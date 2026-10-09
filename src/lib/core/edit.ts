/**
 * Pure edit operations. Every function returns a new Project and leaves its input untouched.
 * Clips on a track never overlap; operations on a linked clip apply to its partner too.
 */
import { clipEnd, clipLen, mediaOf, partnerOf, timelineEndUs, trackClips, type Clip, type MediaItem, type Project } from './model';
import { frameDurationUs, frameToUs, snapToFrame, stepFrames, usToFrame } from './time';

const newId = () => crypto.randomUUID();

/** Adds media to the bin. The first media with video sets the project frame rate and size. */
export function addMedia(p: Project, m: MediaItem): Project {
  const first = m.hasVideo && !m.error && !p.media.some((x) => x.hasVideo && !x.error);
  return {
    ...p,
    fps: first ? m.fps : p.fps,
    width: first ? m.width : p.width,
    height: first ? m.height : p.height,
    media: [...p.media, m],
  };
}

/** Clips for a media item starting at 0: a linked video+audio pair, or a single clip. */
function clipsForMedia(p: Project, mediaId: string): Clip[] {
  const m = p.media.find((x) => x.id === mediaId);
  if (!m || m.error) return [];
  const outUs = frameToUs(Math.floor((m.durationUs * p.fps.num) / (1e6 * p.fps.den)), p.fps);
  if (outUs <= 0) return [];
  const linkId = m.hasVideo && m.hasAudio ? newId() : undefined;
  const make = (track: 'video' | 'audio'): Clip => ({ id: newId(), mediaId, track, startUs: 0, inUs: 0, outUs, linkId });
  return [...(m.hasVideo ? [make('video')] : []), ...(m.hasAudio ? [make('audio')] : [])];
}

/** Adds the media at the end of the timeline. */
export function appendMedia(p: Project, mediaId: string): Project {
  const at = timelineEndUs(p);
  const clips = clipsForMedia(p, mediaId).map((c) => ({ ...c, startUs: at }));
  return { ...p, clips: [...p.clips, ...clips] };
}

/** Timeline points not strictly inside any clip, nearest to `atUs` (ties go earlier). */
function nearestBoundary(p: Project, atUs: number): number {
  const points = new Set<number>([0]);
  for (const c of p.clips) {
    points.add(c.startUs);
    points.add(clipEnd(c));
  }
  let best = 0;
  for (const x of [...points].sort((a, b) => a - b)) {
    if (p.clips.some((c) => c.startUs < x && x < clipEnd(c))) continue;
    if (Math.abs(x - atUs) < Math.abs(best - atUs)) best = x;
  }
  return best;
}

/**
 * Inserts clips (positioned relative to 0) at the boundary nearest `atUs`.
 * Later clips on both tracks shift right to make room, regardless of the ripple setting.
 */
function insertClips(p: Project, clips: Clip[], atUs: number): Project {
  if (clips.length === 0) return p;
  const at = nearestBoundary(p, atUs);
  const len = Math.max(...clips.map(clipLen));
  const shifted = p.clips.map((c) => (c.startUs >= at ? { ...c, startUs: c.startUs + len } : c));
  return { ...p, clips: [...shifted, ...clips.map((c) => ({ ...c, startUs: at }))] };
}

/** Inserts the media at the clip boundary nearest `atUs`. */
export function insertMedia(p: Project, mediaId: string, atUs: number): Project {
  return insertClips(p, clipsForMedia(p, mediaId), atUs);
}

/** The ids plus each one's linked partner. */
function withPartners(p: Project, ids: string[]): Set<string> {
  const out = new Set(ids);
  for (const c of p.clips) {
    if (!ids.includes(c.id)) continue;
    const partner = partnerOf(p, c);
    if (partner) out.add(partner.id);
  }
  return out;
}

/** Start of the next clip on the same track after `c` (Infinity if none). */
function nextStart(p: Project, c: Clip): number {
  const next = trackClips(p, c.track).find((o) => o.id !== c.id && o.startUs >= clipEnd(c));
  return next ? next.startUs : Infinity;
}

/** End of the previous clip on the same track before `c` (0 if none). */
function prevEnd(p: Project, c: Clip): number {
  return trackClips(p, c.track)
    .filter((o) => o.id !== c.id && clipEnd(o) <= c.startUs)
    .reduce((end, o) => Math.max(end, clipEnd(o)), 0);
}

/** Shifts clips (not in `exclude`) whose start is at or after `fromUs`. */
function shiftLater(clips: Clip[], fromUs: number, byUs: number, exclude: Set<string>): Clip[] {
  if (byUs === 0) return clips;
  return clips.map((c) => (!exclude.has(c.id) && c.startUs >= fromUs ? { ...c, startUs: c.startUs + byUs } : c));
}

/**
 * Moves a clip edge by `deltaUs` (snapped to whole project frames).
 * Clamped so the clip stays within its source, is at least one frame long, and — without ripple —
 * doesn't overlap its neighbours or start before 0.
 * Left edge: ripple off moves the clip start with it; ripple on keeps the start and shifts later clips.
 * Right edge: ripple on shifts later clips (on both tracks) by the same amount.
 */
export function trimEdge(p: Project, clipId: string, edge: 'left' | 'right', deltaUs: number, ripple: boolean): Project {
  const clip = p.clips.find((c) => c.id === clipId);
  if (!clip) return p;
  const group = [clip, partnerOf(p, clip)].filter((c): c is Clip => !!c);
  const frame = frameDurationUs(p.fps);
  const steps = usToFrame(deltaUs, p.fps);

  const edgeUs = edge === 'left' ? clip.inUs : clip.outUs;
  let d = stepFrames(edgeUs, steps, p.fps) - edgeUs;
  let lo = -Infinity;
  let hi = Infinity;
  for (const c of group) {
    if (edge === 'right') {
      lo = Math.max(lo, c.inUs + frame - c.outUs);
      hi = Math.min(hi, mediaOf(p, c).durationUs - c.outUs);
      if (!ripple) hi = Math.min(hi, nextStart(p, c) - clipEnd(c));
    } else {
      lo = Math.max(lo, -c.inUs);
      if (!ripple) lo = Math.max(lo, prevEnd(p, c) - c.startUs);
      hi = Math.min(hi, c.outUs - frame - c.inUs);
    }
  }
  if (lo > hi) return p;
  d = Math.min(hi, Math.max(lo, d));
  if (d === 0) return p;

  const ids = new Set(group.map((c) => c.id));
  const oldEnd = clipEnd(clip);
  let clips = p.clips.map((c) => {
    if (!ids.has(c.id)) return c;
    if (edge === 'right') return { ...c, outUs: c.outUs + d };
    return { ...c, inUs: c.inUs + d, startUs: ripple ? c.startUs : c.startUs + d };
  });
  if (ripple) clips = shiftLater(clips, oldEnd, edge === 'right' ? d : -d, ids);
  return { ...p, clips };
}

/**
 * Splits clips at `atUs` (snapped to a frame). With `clipIds` null, splits every clip under the point.
 * Left halves keep their link; right halves of a linked pair share a new link.
 */
export function splitAt(p: Project, atUs: number, clipIds: string[] | null): Project {
  const at = snapToFrame(atUs, p.fps);
  const allowed = clipIds ? withPartners(p, clipIds) : null;
  const newLinks = new Map<string, string>();
  const clips: Clip[] = [];
  for (const c of p.clips) {
    const inside = c.startUs < at && at < clipEnd(c);
    if (!inside || (allowed && !allowed.has(c.id))) {
      clips.push(c);
      continue;
    }
    const cut = c.inUs + (at - c.startUs);
    let linkId: string | undefined;
    if (c.linkId) {
      if (!newLinks.has(c.linkId)) newLinks.set(c.linkId, newId());
      linkId = newLinks.get(c.linkId);
    }
    clips.push({ ...c, outUs: cut });
    clips.push({ ...c, id: newId(), startUs: at, inUs: cut, linkId });
  }
  return { ...p, clips };
}

/**
 * Removes clips and their partners. With ripple, each removed span is closed up — but only when
 * no remaining clip on either track still overlaps it.
 */
export function deleteClips(p: Project, clipIds: string[], ripple: boolean): Project {
  const ids = withPartners(p, clipIds);
  const removed = p.clips.filter((c) => ids.has(c.id));
  let clips = p.clips.filter((c) => !ids.has(c.id));
  if (!ripple) return { ...p, clips };

  const spans = new Map<string, [number, number]>();
  for (const c of removed) spans.set(`${c.startUs}:${clipEnd(c)}`, [c.startUs, clipEnd(c)]);
  const ordered = [...spans.values()].sort((a, b) => b[0] - a[0]);
  for (const [start, end] of ordered) {
    const covered = clips.some((c) => c.startUs < end && clipEnd(c) > start);
    if (!covered) clips = shiftLater(clips, end, -(end - start), new Set());
  }
  return { ...p, clips };
}

/** Moves a clip (and its partner) to the clip boundary nearest `targetUs`, closing the gap it leaves. */
export function moveClip(p: Project, clipId: string, targetUs: number): Project {
  const clip = p.clips.find((c) => c.id === clipId);
  if (!clip) return p;
  const group = [clip, partnerOf(p, clip)].filter((c): c is Clip => !!c);
  const without = deleteClips(p, [clipId], true);
  return insertClips(without, group.map((c) => ({ ...c, startUs: 0 })), targetUs);
}

/**
 * A selected linked pair is unlinked; exactly one video and one audio clip with the same start
 * and length are linked. Anything else is left unchanged.
 */
export function toggleLink(p: Project, clipIds: string[]): Project {
  const sel = p.clips.filter((c) => clipIds.includes(c.id));
  if (sel.length === 0) return p;
  const first = sel[0];
  const partner = partnerOf(p, first);
  if (partner && sel.every((c) => c.id === first.id || c.id === partner.id)) {
    return { ...p, clips: p.clips.map((c) => (c.linkId === first.linkId ? { ...c, linkId: undefined } : c)) };
  }
  if (sel.length !== 2) return p;
  const video = sel.find((c) => c.track === 'video');
  const audio = sel.find((c) => c.track === 'audio');
  if (!video || !audio || video.startUs !== audio.startUs || clipLen(video) !== clipLen(audio)) return p;
  const linkId = newId();
  return {
    ...p,
    clips: p.clips.map((c) => (c.id === video.id || c.id === audio.id ? { ...c, linkId } : c)),
  };
}
