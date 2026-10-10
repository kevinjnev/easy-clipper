import { describe, expect, it } from 'vitest';
import { minWindowSize, PREVIEW_MIN_H } from './minSize';

const parts = {
  toolbarH: 42,
  timelineH: 222,
  shortcutsH: 182,
  previewChromeH: 51, // padding + gap + controls
  toolbarMinW: 640,
  shortcutsMinW: 943,
  previewRowMinW: 760,
};

describe('minWindowSize', () => {
  it('fits every fixed part plus a minimum preview', () => {
    expect(minWindowSize(parts)).toEqual({ width: 943, height: 42 + 222 + 182 + 51 + PREVIEW_MIN_H });
  });

  it('is shorter when the shortcuts panel is hidden', () => {
    expect(minWindowSize({ ...parts, shortcutsH: 0, shortcutsMinW: 0 })).toEqual({ width: 760, height: 42 + 222 + 51 + PREVIEW_MIN_H });
  });

  it('rounds fractional measurements up so nothing is clipped', () => {
    expect(minWindowSize({ ...parts, toolbarH: 42.4, shortcutsMinW: 942.2 })).toEqual({ width: 943, height: 648 });
  });
});
