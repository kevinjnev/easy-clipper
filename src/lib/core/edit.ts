/**
 * Pure edit operations. Every function returns a new Project and leaves its input untouched.
 * Clips on a track never overlap; operations on a linked clip apply to its partner too.
 * Nothing moves other clips except dropping onto an occupied spot, which inserts and pushes.
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
export function clipsForMedia(p: Project, mediaId: string): Clip[] {
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
export function nearestBoundary(p: Project, atUs: number): number {
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

export type Placement = { kind: 'free'; startUs: number } | { kind: 'insert'; atUs: number };

/**
 * Where a group of clips (keeping their offsets from each other) lands when dropped with its
 * earliest clip at `targetStartUs`: exactly there if every clip fits on its track, otherwise
 * inserted at the clip boundary nearest the drop point. Clips in the group are ignored as obstacles.
 */
export function dropPlacement(p: Project, group: Clip[], targetStartUs: number): Placement {
  const ids = new Set(group.map((c) => c.id));
  const others = p.clips.filter((c) => !ids.has(c.id));
  const groupStart = Math.min(...group.map((c) => c.startUs));
  const start = Math.max(0, targetStartUs);
  const fits = group.every((c) => {
    const s = start + (c.startUs - groupStart);
    const e = s + clipLen(c);
    return !others.some((o) => o.track === c.track && o.startUs < e && clipEnd(o) > s);
  });
  if (fits) return { kind: 'free', startUs: start };
  return { kind: 'insert', atUs: nearestBoundary({ ...p, clips: others }, start) };
}

/** Puts the group at its placement; an insert pushes every later clip right by the group's length. */
function applyPlacement(p: Project, group: Clip[], placement: Placement): Project {
  const ids = new Set(group.map((c) => c.id));
  let others = p.clips.filter((c) => !ids.has(c.id));
  const groupStart = Math.min(...group.map((c) => c.startUs));
  const groupEnd = Math.max(...group.map(clipEnd));
  let start: number;
  if (placement.kind === 'free') {
    start = placement.startUs;
  } else {
    start = placement.atUs;
    const len = groupEnd - groupStart;
    others = others.map((c) => (c.startUs >= start ? { ...c, startUs: c.startUs + len } : c));
  }
  return { ...p, clips: [...others, ...group.map((c) => ({ ...c, startUs: start + (c.startUs - groupStart) }))] };
}

/** Adds media with its first clip starting at `atUs` (or inserted at the nearest gap if that spot is taken). */
export function dropMedia(p: Project, mediaId: string, atUs: number): Project {
  const group = clipsForMedia(p, mediaId);
  if (group.length === 0) return p;
  return applyPlacement(p, group, dropPlacement(p, group, atUs));
}

/** A clip and its linked partner. */
export function groupOf(p: Project, clipId: string): Clip[] {
  const clip = p.clips.find((c) => c.id === clipId);
  if (!clip) return [];
  const partner = partnerOf(p, clip);
  return partner ? [clip, partner] : [clip];
}

/** Moves a clip (and its partner, keeping their offset) so the clip starts at `targetUs`. */
export function moveClip(p: Project, clipId: string, targetUs: number): Project {
  const group = groupOf(p, clipId);
  if (group.length === 0) return p;
  const groupStart = Math.min(...group.map((c) => c.startUs));
  const target = targetUs - (group[0].startUs - groupStart);
  return applyPlacement(p, group, dropPlacement(p, group, target));
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

/**
 * Moves a clip edge by `deltaUs` (snapped to whole project frames), for the clip and its partner.
 * Clamped so each clip stays within its source, is at least one frame long, doesn't overlap its
 * neighbours and doesn't start before 0. Moving the left edge moves the clip's start with it.
 */
export function trimEdge(p: Project, clipId: string, edge: 'left' | 'right', deltaUs: number): Project {
  const group = groupOf(p, clipId);
  if (group.length === 0) return p;
  const clip = group[0];
  const frame = frameDurationUs(p.fps);
  const edgeUs = edge === 'left' ? clip.inUs : clip.outUs;
  let d = stepFrames(edgeUs, usToFrame(deltaUs, p.fps), p.fps) - edgeUs;
  let lo = -Infinity;
  let hi = Infinity;
  for (const c of group) {
    if (edge === 'right') {
      lo = Math.max(lo, c.inUs + frame - c.outUs);
      hi = Math.min(hi, mediaOf(p, c).durationUs - c.outUs, nextStart(p, c) - clipEnd(c));
    } else {
      lo = Math.max(lo, -c.inUs, prevEnd(p, c) - c.startUs);
      hi = Math.min(hi, c.outUs - frame - c.inUs);
    }
  }
  if (lo > hi) return p;
  d = Math.min(hi, Math.max(lo, d));
  if (d === 0) return p;
  const ids = new Set(group.map((c) => c.id));
  return {
    ...p,
    clips: p.clips.map((c) => {
      if (!ids.has(c.id)) return c;
      if (edge === 'right') return { ...c, outUs: c.outUs + d };
      return { ...c, inUs: c.inUs + d, startUs: c.startUs + d };
    }),
  };
}

/** Removes link ids that don't join exactly two clips. */
function tidyLinks(clips: Clip[]): Clip[] {
  const counts = new Map<string, number>();
  for (const c of clips) if (c.linkId) counts.set(c.linkId, (counts.get(c.linkId) ?? 0) + 1);
  return clips.map((c) => (c.linkId && counts.get(c.linkId) !== 2 ? { ...c, linkId: undefined } : c));
}

/**
 * Splits clips at `atUs` (snapped to a frame). With `clipIds` null, splits every clip under the point.
 * Left halves keep their link; right halves of a pair that were both split share a new link.
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
  return { ...p, clips: tidyLinks(clips) };
}

/** Removes clips and their partners, leaving a gap. */
export function deleteClips(p: Project, clipIds: string[]): Project {
  const ids = withPartners(p, clipIds);
  return { ...p, clips: p.clips.filter((c) => !ids.has(c.id)) };
}

/**
 * Selecting one linked clip or its pair unlinks it. Selecting one video and one audio clip links
 * them wherever they are (dropping any links they had before). Anything else is left unchanged.
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
  if (!video || !audio) return p;
  const linkId = newId();
  const ids = new Set([video.id, audio.id]);
  const clips = p.clips.map((c) => (ids.has(c.id) ? { ...c, linkId } : c));
  return { ...p, clips: tidyLinks(clips) };
}
