import { clipEnd, type Project } from './model';

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
