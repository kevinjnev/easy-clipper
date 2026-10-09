import { describe, expect, it } from 'vitest';
import { clampPan, FIT, panBy, zoomAt } from './zoom';

const W = 800;
const H = 450;

describe('preview zoom', () => {
  it('keeps the point under the cursor fixed while zooming', () => {
    // Cursor 100 px right of centre: that content point stays under the cursor.
    expect(zoomAt(FIT, 2, 100, 0, W, H)).toEqual({ zoom: 2, panX: -100, panY: 0 });
  });

  it('stays between 100% and 800%', () => {
    expect(zoomAt(FIT, 0.5, 0, 0, W, H)).toEqual(FIT);
    expect(zoomAt({ zoom: 6, panX: 0, panY: 0 }, 2, 0, 0, W, H).zoom).toBe(8);
  });

  it('never pans the frame out of view', () => {
    expect(clampPan({ zoom: 2, panX: 1000, panY: -1000 }, W, H)).toEqual({ zoom: 2, panX: 400, panY: -225 });
    expect(panBy(FIT, 50, 50, W, H)).toEqual(FIT);
  });

  it('zooming back out re-centres the frame', () => {
    const zoomed = { zoom: 2, panX: 300, panY: 100 };
    expect(zoomAt(zoomed, 0.5, 0, 0, W, H)).toEqual(FIT);
  });
});
