/**
 * Preview zoom/pan, applied as `translate(panX, panY) scale(zoom)` around the centre of the screen.
 * Pan is in screen pixels; cursor positions are relative to the screen centre.
 */
export interface ViewZoom {
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const FIT: ViewZoom = { zoom: 1, panX: 0, panY: 0 };

/** Limits panning so the frame always covers the screen. */
export function clampPan(z: ViewZoom, w: number, h: number): ViewZoom {
  const maxX = ((z.zoom - 1) * w) / 2;
  const maxY = ((z.zoom - 1) * h) / 2;
  const clamp = (v: number, m: number) => Math.min(m, Math.max(-m, v)) || 0;
  return { zoom: z.zoom, panX: clamp(z.panX, maxX), panY: clamp(z.panY, maxY) };
}

/** Zooms by `factor`, keeping the content under the cursor (cx, cy from centre) in place. */
export function zoomAt(z: ViewZoom, factor: number, cx: number, cy: number, w: number, h: number): ViewZoom {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z.zoom * factor));
  const k = zoom / z.zoom;
  return clampPan({ zoom, panX: cx - (cx - z.panX) * k, panY: cy - (cy - z.panY) * k }, w, h);
}

export function panBy(z: ViewZoom, dx: number, dy: number, w: number, h: number): ViewZoom {
  return clampPan({ ...z, panX: z.panX + dx, panY: z.panY + dy }, w, h);
}
