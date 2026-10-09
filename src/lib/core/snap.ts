import { clipEnd, type Project } from './model';
import { frameToUs, type Fps } from './time';

/** Points a dragged edge or clip can snap to: 0, the playhead and every clip start/end. */
export function snapTargets(p: Project, playheadUs: number, excludeIds: string[]): number[] {
  const targets = new Set<number>([0, playheadUs]);
  for (const c of p.clips) {
    if (excludeIds.includes(c.id)) continue;
    targets.add(c.startUs);
    targets.add(clipEnd(c));
  }
  return [...targets];
}

/** The nearest target within `thresholdUs`, or `us` unchanged. */
export function snapValue(us: number, targets: number[], thresholdUs: number): number {
  let best = us;
  let bestDist = thresholdUs;
  for (const t of targets) {
    const dist = Math.abs(t - us);
    if (dist <= bestDist) {
      best = t;
      bestDist = dist;
    }
  }
  return best;
}

const SNAP_FRAMES = 5;
const SNAP_PX = 10;

/** How close (in µs) a dragged edge must be to snap: 10 px on screen, but never more than 5 frames. */
export function snapThresholdUs(pxPerSec: number, fps: Fps): number {
  return Math.min(frameToUs(SNAP_FRAMES, fps), Math.round((SNAP_PX / pxPerSec) * 1e6));
}

/** Snaps a dragged clip of length `lenUs` by its start or its end, whichever lands closer to a target. */
export function snapSpan(startUs: number, lenUs: number, targets: number[], thresholdUs: number): number {
  const byStart = snapValue(startUs, targets, thresholdUs);
  const byEnd = snapValue(startUs + lenUs, targets, thresholdUs) - lenUs;
  const dStart = byStart === startUs ? Infinity : Math.abs(byStart - startUs);
  const dEnd = byEnd === startUs ? Infinity : Math.abs(byEnd - startUs);
  if (dStart === Infinity && dEnd === Infinity) return startUs;
  return dStart <= dEnd ? byStart : byEnd;
}
