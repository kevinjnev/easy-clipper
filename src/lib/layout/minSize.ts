/** The smallest preview picture the window keeps visible. */
export const PREVIEW_MIN_H = 150;

export interface LayoutParts {
  toolbarH: number;
  timelineH: number;
  /** 0 when the shortcuts panel is hidden. */
  shortcutsH: number;
  /** Preview padding, gaps and the play/zoom controls. */
  previewChromeH: number;
  toolbarMinW: number;
  /** 0 when the shortcuts panel is hidden. */
  shortcutsMinW: number;
  /** Media bin plus the narrowest preview controls. */
  previewRowMinW: number;
}

/** The smallest window that shows every part without clipping or wrapping. */
export function minWindowSize(m: LayoutParts): { width: number; height: number } {
  return {
    width: Math.ceil(Math.max(m.toolbarMinW, m.shortcutsMinW, m.previewRowMinW)),
    height: Math.ceil(m.toolbarH + m.timelineH + m.shortcutsH + m.previewChromeH + PREVIEW_MIN_H),
  };
}
