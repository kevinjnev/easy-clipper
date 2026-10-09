import { clipEnd, type Clip, type MediaItem, type Project, type TrackKind } from '../core/model';

/** The audio player is re-seeked when it drifts further than this from the video. */
export const AUDIO_DRIFT_US = 150_000;
/** While playing, the video is only re-seeked if it is wildly off (e.g. it stalled). */
export const VIDEO_RESEEK_US = 1_000_000;
/** When paused, players are seeked to show the exact frame under the playhead. */
export const PAUSED_SEEK_US = 20_000;

/** The clip playing on `track` at timeline time `us`, and the matching time in its source file. */
export function activeAt(p: Project, track: TrackKind, us: number): { clip: Clip; media: MediaItem; sourceUs: number } | null {
  const clip = p.clips.find((c) => c.track === track && c.startUs <= us && us < clipEnd(c));
  if (!clip) return null;
  const media = p.media.find((m) => m.id === clip.mediaId);
  if (!media) return null;
  return { clip, media, sourceUs: clip.inUs + (us - clip.startUs) };
}

export function needsSeek(elementTimeUs: number, expectedSourceUs: number, limitUs: number): boolean {
  return Math.abs(elementTimeUs - expectedSourceUs) > limitUs;
}

/**
 * The next playhead position during playback. While a video clip is playing, the video is the
 * clock (so it never has to be re-seeked to keep up); in gaps, wall time is used. The playhead
 * never moves backwards and stops at the clip's end so the next clip can take over.
 */
export function advancePlayhead(prevUs: number, elapsedUs: number, master: { clip: Clip; mediaTimeUs: number } | null): number {
  if (!master) return prevUs + elapsedUs;
  const { clip, mediaTimeUs } = master;
  const us = clip.startUs + (mediaTimeUs - clip.inUs);
  return Math.min(clipEnd(clip), Math.max(prevUs, us));
}
