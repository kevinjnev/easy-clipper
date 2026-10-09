/** A frame rate as a rational number, e.g. 30000/1001 for 29.97 fps. */
export type Fps = { num: number; den: number };

export function usToFrame(us: number, fps: Fps): number {
  return Math.round((us * fps.num) / (1e6 * fps.den));
}

export function frameToUs(frame: number, fps: Fps): number {
  return Math.round((frame * 1e6 * fps.den) / fps.num);
}

export function snapToFrame(us: number, fps: Fps): number {
  return frameToUs(usToFrame(us, fps), fps);
}

/** Moves `n` frames from the frame nearest `us`. Does not clamp. */
export function stepFrames(us: number, n: number, fps: Fps): number {
  return frameToUs(usToFrame(us, fps) + n, fps);
}

export function frameDurationUs(fps: Fps): number {
  return frameToUs(1, fps);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "MM:SS:FF", or "HH:MM:SS:FF" from one hour. */
export function formatTimecode(us: number, fps: Fps): string {
  const frame = Math.max(0, usToFrame(us, fps));
  const perSec = Math.round(fps.num / fps.den);
  const ff = frame % perSec;
  const totalSec = Math.floor(frameToUs(frame - ff, fps) / 1e6 + 1e-9);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return (h > 0 ? `${pad(h)}:` : '') + `${pad(m)}:${pad(s)}:${pad(ff)}`;
}
