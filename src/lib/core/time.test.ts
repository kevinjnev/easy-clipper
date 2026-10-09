import { describe, expect, it } from 'vitest';
import { formatTimecode, frameDurationUs, frameToUs, snapToFrame, stepFrames, usToFrame } from './time';

const fps30 = { num: 30, den: 1 };
const ntsc = { num: 30000, den: 1001 };

describe('time', () => {
  it('converts frames to microseconds', () => {
    expect(frameToUs(30, fps30)).toBe(1_000_000);
    expect(frameDurationUs(fps30)).toBe(33_333);
  });

  it('snaps to the nearest frame', () => {
    expect(snapToFrame(16_000, fps30)).toBe(0);
    expect(snapToFrame(17_000, fps30)).toBe(33_333);
  });

  it('stepping 1000 frames at 29.97 round-trips', () => {
    let us = 0;
    for (let i = 0; i < 1000; i++) us = stepFrames(us, 1, ntsc);
    expect(us).toBe(frameToUs(1000, ntsc));
    expect(us).toBe(33_366_667);
    expect(usToFrame(us, ntsc)).toBe(1000);
  });

  it('does not clamp negative steps', () => {
    expect(stepFrames(0, -1, fps30)).toBe(-33_333);
  });

  it('formats timecode', () => {
    expect(formatTimecode(61_500_000, fps30)).toBe('01:01:15');
    expect(formatTimecode(3_661_000_000, fps30)).toBe('01:01:01:00');
  });
});
