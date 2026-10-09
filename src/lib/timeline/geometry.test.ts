import { describe, expect, it } from 'vitest';
import { createProject, type Project } from '../core/model';
import { hitTest, RULER_H, trackTop, TRACK_H, usToX, xToUs } from './geometry';

const view = { pxPerSec: 100, scrollUs: 1_000_000 };

const p: Project = {
  ...createProject(),
  clips: [
    { id: 'v1', mediaId: 'm', track: 'video', startUs: 2_000_000, inUs: 0, outUs: 2_000_000 },
    { id: 'a1', mediaId: 'm', track: 'audio', startUs: 2_000_000, inUs: 0, outUs: 2_000_000 },
  ],
};

describe('timeline geometry', () => {
  it('converts between time and x', () => {
    expect(usToX(3_000_000, view)).toBe(200);
    expect(xToUs(200, view)).toBe(3_000_000);
    expect(xToUs(usToX(1_234_567, view), view)).toBe(1_234_567);
  });

  it('hits the ruler', () => {
    expect(hitTest(p, view, 50, RULER_H - 1)).toEqual({ kind: 'ruler' });
  });

  it('hits a clip body', () => {
    const y = trackTop('video') + TRACK_H / 2;
    expect(hitTest(p, view, 200, y)).toEqual({ kind: 'clip', clipId: 'v1' });
  });

  it('hits the right edge within a few pixels of the clip end', () => {
    // v1 spans x = 100..300
    const y = trackTop('video') + 10;
    expect(hitTest(p, view, 297, y)).toEqual({ kind: 'edge', clipId: 'v1', side: 'right' });
    expect(hitTest(p, view, 102, y)).toEqual({ kind: 'edge', clipId: 'v1', side: 'left' });
  });

  it('hits empty space on the audio track', () => {
    const y = trackTop('audio') + 5;
    expect(hitTest(p, view, 400, y)).toEqual({ kind: 'empty', track: 'audio' });
    expect(hitTest(p, view, 200, y)).toEqual({ kind: 'clip', clipId: 'a1' });
  });
});
