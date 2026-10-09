import { clipEnd, type Project, type TrackKind } from '../core/model';

export const RULER_H = 24;
export const TRACK_H = 64;
export const TRACK_GAP = 6;
export const TOP_PAD = 6;
export const EDGE_PX = 6;
export const TIMELINE_H = RULER_H + TOP_PAD + TRACK_H * 2 + TRACK_GAP + TOP_PAD;

export interface View {
  pxPerSec: number;
  /** Time at the left edge of the canvas. */
  scrollUs: number;
}

export type Hit =
  | { kind: 'ruler' }
  | { kind: 'edge'; clipId: string; side: 'left' | 'right' }
  | { kind: 'clip'; clipId: string }
  | { kind: 'empty'; track: TrackKind };

export function usToX(us: number, v: View): number {
  return ((us - v.scrollUs) / 1e6) * v.pxPerSec;
}

export function xToUs(x: number, v: View): number {
  return Math.round((x / v.pxPerSec) * 1e6 + v.scrollUs);
}

export function trackTop(t: TrackKind): number {
  return RULER_H + TOP_PAD + (t === 'video' ? 0 : TRACK_H + TRACK_GAP);
}

export function trackAt(y: number): TrackKind {
  return y < trackTop('audio') - TRACK_GAP / 2 ? 'video' : 'audio';
}

export function hitTest(p: Project, v: View, x: number, y: number): Hit {
  if (y < RULER_H) return { kind: 'ruler' };
  const track = trackAt(y);
  const top = trackTop(track);
  if (y < top || y > top + TRACK_H) return { kind: 'empty', track };
  for (const c of p.clips) {
    if (c.track !== track) continue;
    const x0 = usToX(c.startUs, v);
    const x1 = usToX(clipEnd(c), v);
    if (x < x0 || x > x1) continue;
    // Narrow clips: split the clip in half between the two edges.
    const zone = Math.min(EDGE_PX, (x1 - x0) / 3);
    if (x >= x1 - zone) return { kind: 'edge', clipId: c.id, side: 'right' };
    if (x <= x0 + zone) return { kind: 'edge', clipId: c.id, side: 'left' };
    return { kind: 'clip', clipId: c.id };
  }
  return { kind: 'empty', track };
}

/** A "nice" ruler step (in seconds) giving labels at least `minPx` apart. */
export function rulerStep(pxPerSec: number, minPx = 80): number {
  const steps = [1 / 30, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
  return steps.find((s) => s * pxPerSec >= minPx) ?? 3600;
}
