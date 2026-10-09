import { clipEnd, clipLen, type Clip, type MediaItem, type Project } from '../core/model';
import { formatTimecode } from '../core/time';
import type { Selection } from '../state/editor.svelte';
import { RULER_H, rulerStep, trackTop, TRACK_H, usToX, type View } from './geometry';

const C = {
  bg: '#16171b',
  ruler: '#1e2026',
  tick: '#4a4e5a',
  label: '#9a9ead',
  lane: '#1b1d22',
  video: '#3d5a99',
  videoDark: '#2b4170',
  audio: '#2f7a5b',
  audioDark: '#1f5540',
  wave: 'rgba(200, 255, 225, 0.75)',
  select: '#ffffff',
  edge: '#ffcf3f',
  playhead: '#ff5a5a',
  drop: '#6c8cff',
  text: '#e6e7ea',
};

export interface DrawState {
  selection: Selection;
  playheadUs: number;
  /** x of the insertion marker while dragging media or a clip onto the timeline. */
  dropX: number | null;
  /** Clip being moved, drawn semi-transparent at its new position. */
  ghost: { clipIds: string[]; offsetUs: number } | null;
  hoverEdge: { clipId: string; side: 'left' | 'right' } | null;
}

const SPRITE_FRAMES = 10;

function drawRuler(ctx: CanvasRenderingContext2D, w: number, p: Project, v: View) {
  ctx.fillStyle = C.ruler;
  ctx.fillRect(0, 0, w, RULER_H);
  const step = rulerStep(v.pxPerSec);
  const minor = step / 5;
  const first = Math.floor(v.scrollUs / 1e6 / minor) * minor;
  ctx.font = '11px Segoe UI, sans-serif';
  ctx.textBaseline = 'top';
  for (let t = first; ; t += minor) {
    const x = usToX(t * 1e6, v);
    if (x > w) break;
    if (x < -50) continue;
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    ctx.fillStyle = C.tick;
    ctx.fillRect(Math.round(x), major ? RULER_H - 10 : RULER_H - 5, 1, major ? 10 : 5);
    if (major) {
      ctx.fillStyle = C.label;
      ctx.fillText(formatTimecode(Math.round(t * 1e6), p.fps), Math.round(x) + 3, 3);
    }
  }
}

function drawThumbs(ctx: CanvasRenderingContext2D, c: Clip, m: MediaItem, img: HTMLImageElement, x0: number, x1: number, top: number) {
  const tileW = img.naturalWidth / SPRITE_FRAMES;
  const tileH = img.naturalHeight;
  const h = TRACK_H - 18;
  const w = (tileW / tileH) * h;
  const len = clipLen(c);
  for (let x = x0; x < x1; x += w) {
    const sourceUs = c.inUs + ((x - x0) / (x1 - x0)) * len;
    const frame = Math.min(SPRITE_FRAMES - 1, Math.max(0, Math.floor((sourceUs / m.durationUs) * SPRITE_FRAMES)));
    const drawW = Math.min(w, x1 - x);
    ctx.drawImage(img, frame * tileW, 0, (drawW / w) * tileW, tileH, x, top + 16, drawW, h);
  }
}

function drawWave(ctx: CanvasRenderingContext2D, c: Clip, peaks: number[], x0: number, x1: number, top: number, v: View) {
  const mid = top + 16 + (TRACK_H - 18) / 2;
  const half = (TRACK_H - 20) / 2;
  ctx.fillStyle = C.wave;
  const start = Math.max(0, Math.floor(x0));
  for (let x = start; x < x1; x++) {
    const sourceSec = (c.inUs + ((x - x0) / v.pxPerSec) * 1e6) / 1e6;
    // Peaks are 80 per second; take the max of those covered by this pixel.
    const a = Math.floor(sourceSec * 80);
    const b = Math.max(a + 1, Math.floor((sourceSec + 1 / v.pxPerSec) * 80));
    let peak = 0;
    for (let i = a; i < b && i < peaks.length; i++) peak = Math.max(peak, peaks[i]);
    const hh = Math.max(1, peak * half);
    ctx.fillRect(x, mid - hh, 1, hh * 2);
  }
}

function drawClip(
  ctx: CanvasRenderingContext2D,
  p: Project,
  c: Clip,
  v: View,
  s: DrawState,
  images: Map<string, HTMLImageElement>,
  waves: Record<string, number[]>,
  offsetUs = 0,
) {
  const m = p.media.find((x) => x.id === c.mediaId);
  const top = trackTop(c.track);
  const x0 = usToX(c.startUs + offsetUs, v);
  const x1 = usToX(clipEnd(c) + offsetUs, v);
  const w = x1 - x0;
  if (x1 < 0 || w <= 0) return;
  const isVideo = c.track === 'video';

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0, top, w, TRACK_H, 5);
  ctx.clip();
  ctx.fillStyle = isVideo ? C.videoDark : C.audioDark;
  ctx.fillRect(x0, top, w, TRACK_H);
  ctx.fillStyle = isVideo ? C.video : C.audio;
  ctx.fillRect(x0, top, w, 16);

  const img = images.get(c.mediaId);
  if (isVideo && m && img?.complete && img.naturalWidth) drawThumbs(ctx, c, m, img, x0, x1, top);
  const peaks = waves[c.mediaId];
  if (!isVideo && peaks) drawWave(ctx, c, peaks, x0, x1, top, v);

  ctx.fillStyle = C.text;
  ctx.font = '11px Segoe UI, sans-serif';
  ctx.textBaseline = 'top';
  const label = `${c.linkId ? '🔗 ' : ''}${m?.name ?? '?'}`;
  ctx.fillText(label, Math.max(x0, 0) + 5, top + 2);
  ctx.restore();

  const selected = s.selection.clipIds.includes(c.id);
  if (selected) {
    ctx.strokeStyle = C.select;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x0 + 1, top + 1, w - 2, TRACK_H - 2, 5);
    ctx.stroke();
  }
  for (const e of [s.selection.edge, s.hoverEdge]) {
    if (e?.clipId !== c.id) continue;
    ctx.fillStyle = e === s.selection.edge ? C.edge : 'rgba(255, 207, 63, 0.5)';
    const ex = e.side === 'left' ? x0 : x1 - 5;
    ctx.fillRect(ex, top, 5, TRACK_H);
  }
}

export function drawTimeline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: Project,
  v: View,
  s: DrawState,
  images: Map<string, HTMLImageElement>,
  waves: Record<string, number[]>,
) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);
  for (const t of ['video', 'audio'] as const) {
    ctx.fillStyle = C.lane;
    ctx.fillRect(0, trackTop(t), w, TRACK_H);
  }
  drawRuler(ctx, w, p, v);

  const ghostIds = new Set(s.ghost?.clipIds ?? []);
  for (const c of p.clips) {
    ctx.globalAlpha = ghostIds.has(c.id) ? 0.35 : 1;
    drawClip(ctx, p, c, v, s, images, waves);
  }
  ctx.globalAlpha = 0.8;
  if (s.ghost) for (const c of p.clips) if (ghostIds.has(c.id)) drawClip(ctx, p, c, v, s, images, waves, s.ghost.offsetUs);
  ctx.globalAlpha = 1;

  if (s.dropX !== null) {
    ctx.fillStyle = C.drop;
    ctx.fillRect(Math.round(s.dropX) - 1, RULER_H, 3, h - RULER_H);
  }

  const px = Math.round(usToX(s.playheadUs, v));
  ctx.fillStyle = C.playhead;
  ctx.fillRect(px, 0, 2, h);
  ctx.beginPath();
  ctx.moveTo(px - 5, 0);
  ctx.lineTo(px + 7, 0);
  ctx.lineTo(px + 1, 8);
  ctx.fill();
}
