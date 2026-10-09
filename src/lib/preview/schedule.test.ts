import { describe, expect, it } from 'vitest';
import { createProject, type MediaItem, type Project } from '../core/model';
import { activeAt, AUDIO_DRIFT_US, advancePlayhead, needsSeek } from './schedule';

const m = { id: 'm', durationUs: 10_000_000 } as MediaItem;
const p: Project = {
  ...createProject(),
  media: [m],
  clips: [
    { id: 'a', mediaId: 'm', track: 'video', startUs: 0, inUs: 2_000_000, outUs: 4_000_000 },
    { id: 'b', mediaId: 'm', track: 'video', startUs: 2_000_000, inUs: 5_000_000, outUs: 6_000_000 },
    { id: 'c', mediaId: 'm', track: 'video', startUs: 5_000_000, inUs: 0, outUs: 1_000_000 },
  ],
};

describe('activeAt', () => {
  it('maps timeline time to source time inside a clip', () => {
    const hit = activeAt(p, 'video', 500_000);
    expect(hit?.clip.id).toBe('a');
    expect(hit?.sourceUs).toBe(2_500_000);
    expect(hit?.media).toBe(m);
  });

  it('returns the next clip exactly at a cut', () => {
    expect(activeAt(p, 'video', 2_000_000)?.clip.id).toBe('b');
    expect(activeAt(p, 'video', 2_000_000)?.sourceUs).toBe(5_000_000);
  });

  it('returns null in a gap and after the end', () => {
    expect(activeAt(p, 'video', 3_500_000)).toBeNull();
    expect(activeAt(p, 'video', 6_000_000)).toBeNull();
    expect(activeAt(p, 'audio', 500_000)).toBeNull();
  });
});

describe('needsSeek', () => {
  it('seeks only when drift exceeds the limit', () => {
    expect(needsSeek(1_000_000, 1_100_000, AUDIO_DRIFT_US)).toBe(false);
    expect(needsSeek(1_000_000, 1_200_000, AUDIO_DRIFT_US)).toBe(true);
    expect(needsSeek(1_200_000, 1_000_000, AUDIO_DRIFT_US)).toBe(true);
  });
});

describe('advancePlayhead', () => {
  const clip = p.clips[0]; // timeline 0-2 s, source 2-4 s

  it('follows the playing video when there is one', () => {
    expect(advancePlayhead(500_000, 16_000, { clip, mediaTimeUs: 2_530_000 })).toBe(530_000);
  });

  it('runs on wall time in gaps', () => {
    expect(advancePlayhead(3_500_000, 16_000, null)).toBe(3_516_000);
  });

  it('never moves backwards while the video catches up', () => {
    expect(advancePlayhead(500_000, 16_000, { clip, mediaTimeUs: 2_480_000 })).toBe(500_000);
  });

  it('stops at the clip end so the next clip can take over', () => {
    expect(advancePlayhead(1_990_000, 16_000, { clip, mediaTimeUs: 4_050_000 })).toBe(2_000_000);
  });
});
