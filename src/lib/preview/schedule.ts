import { clipEnd, type Clip, type MediaItem, type Project, type TrackKind } from '../core/model';

/** Players are re-seeked when they drift further than this from the timeline clock. */
export const DRIFT_US = 50_000;

/** The clip playing on `track` at timeline time `us`, and the matching time in its source file. */
export function activeAt(p: Project, track: TrackKind, us: number): { clip: Clip; media: MediaItem; sourceUs: number } | null {
  const clip = p.clips.find((c) => c.track === track && c.startUs <= us && us < clipEnd(c));
  if (!clip) return null;
  const media = p.media.find((m) => m.id === clip.mediaId);
  if (!media) return null;
  return { clip, media, sourceUs: clip.inUs + (us - clip.startUs) };
}

export function needsSeek(elementTimeUs: number, expectedSourceUs: number): boolean {
  return Math.abs(elementTimeUs - expectedSourceUs) > DRIFT_US;
}
