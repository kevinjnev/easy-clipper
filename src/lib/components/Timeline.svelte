<script lang="ts">
  import { onMount } from 'svelte';
  import { fileUrl } from '../api';
  import { insertMedia, moveClip, nearestBoundary, trimEdge } from '../core/edit';
  import { clipEnd, partnerOf, timelineEndUs } from '../core/model';
  import { snapTargets, snapValue } from '../core/snap';
  import { formatTimecode } from '../core/time';
  import { editor } from '../state/editor.svelte';
  import { drawTimeline, type DrawState } from '../timeline/draw';
  import { hitTest, RULER_H, trackTop, TRACK_H, usToX, xToUs, type Hit, type View } from '../timeline/geometry';

  const SNAP_PX = 8;
  const DRAG_PX = 4;
  const MIN_PX_PER_SEC = 2;
  const MAX_PX_PER_SEC = 2000;

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = $state(800);
  let height = $state(180);
  let hoverEdge = $state<DrawState['hoverEdge']>(null);
  let dropX = $state<number | null>(null);
  let ghost = $state<DrawState['ghost']>(null);
  let cursor = $state('default');
  const images = new Map<string, HTMLImageElement>();
  let imageTick = $state(0);

  const view = $derived<View>({ pxPerSec: editor.pxPerSec, scrollUs: editor.scrollUs });
  const endUs = $derived(timelineEndUs(editor.project));

  // Load thumbnail sprites as they become available.
  $effect(() => {
    for (const [id, path] of Object.entries(editor.thumbs)) {
      if (images.has(id)) continue;
      const img = new Image();
      img.onload = () => imageTick++;
      img.src = fileUrl(path);
      images.set(id, img);
    }
  });

  // Redraw whenever anything visible changes.
  $effect(() => {
    const state: DrawState = {
      selection: editor.selection,
      playheadUs: editor.playheadUs,
      dropX,
      ghost,
      hoverEdge,
    };
    void imageTick;
    void JSON.stringify(editor.selection);
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTimeline(ctx, width, height, editor.project, view, state, images, editor.waves);
  });

  // Keep the playhead visible while playing.
  $effect(() => {
    if (!editor.playing) return;
    const x = usToX(editor.playheadUs, view);
    if (x > width - 40 || x < 0) editor.scrollUs = Math.max(0, editor.playheadUs - (width * 0.1 * 1e6) / editor.pxPerSec);
  });

  // Zoom to fit when the first clips arrive.
  let hadClips = false;
  $effect(() => {
    const has = editor.project.clips.length > 0;
    if (has && !hadClips) fit();
    hadClips = has;
  });

  function fit() {
    const end = timelineEndUs(editor.project);
    if (end <= 0) return;
    editor.pxPerSec = Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, (width * 0.92) / (end / 1e6)));
    editor.scrollUs = 0;
  }

  function zoom(factor: number, anchorX = width / 2) {
    const anchorUs = xToUs(anchorX, view);
    const px = Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, editor.pxPerSec * factor));
    editor.pxPerSec = px;
    editor.scrollUs = Math.max(0, anchorUs - (anchorX / px) * 1e6);
  }

  function local(e: { clientX: number; clientY: number }) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey) {
      zoom(e.deltaY < 0 ? 1.25 : 0.8, local(e).x);
    } else {
      const delta = (e.deltaY !== 0 ? e.deltaY : e.deltaX) / editor.pxPerSec * 1e6;
      editor.scrollUs = Math.max(0, editor.scrollUs + delta);
    }
  }

  function cursorFor(hit: Hit) {
    if (hit.kind === 'edge') return 'ew-resize';
    if (hit.kind === 'clip') return 'grab';
    if (hit.kind === 'ruler') return 'pointer';
    return 'default';
  }

  function onHover(e: PointerEvent) {
    if (e.buttons) return;
    const { x, y } = local(e);
    const hit = hitTest(editor.project, view, x, y);
    hoverEdge = hit.kind === 'edge' ? { clipId: hit.clipId, side: hit.side } : null;
    cursor = cursorFor(hit);
  }

  function drag(onMove: (e: PointerEvent, dx: number) => void, onUp: (e: PointerEvent, dx: number) => void, startX: number) {
    const move = (e: PointerEvent) => onMove(e, local(e).x - startX);
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onUp(e, local(e).x - startX);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function snapUs(us: number, excludeIds: string[], e: PointerEvent) {
    if (e.altKey) return us;
    return snapValue(us, snapTargets(editor.project, editor.playheadUs, excludeIds), (SNAP_PX / editor.pxPerSec) * 1e6);
  }

  function groupIds(clipId: string) {
    const c = editor.project.clips.find((x) => x.id === clipId);
    const partner = c && partnerOf(editor.project, c);
    return [clipId, ...(partner ? [partner.id] : [])];
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const { x, y } = local(e);
    const hit = hitTest(editor.project, view, x, y);

    if (hit.kind === 'ruler' || hit.kind === 'empty') {
      if (hit.kind === 'empty') editor.selectClips([]);
      editor.setPlayhead(xToUs(x, view));
      drag((ev) => editor.setPlayhead(xToUs(local(ev).x, view)), () => {}, x);
      return;
    }

    if (hit.kind === 'edge') {
      editor.selectClips([hit.clipId], { clipId: hit.clipId, side: hit.side });
      const clip = editor.project.clips.find((c) => c.id === hit.clipId)!;
      const exclude = groupIds(hit.clipId);
      const origUs = hit.side === 'right' ? clipEnd(clip) : clip.startUs;
      editor.beginGesture();
      drag(
        (ev, dx) => {
          const target = snapUs(origUs + (dx / editor.pxPerSec) * 1e6, exclude, ev);
          editor.updateGesture((p) => trimEdge(p, hit.clipId, hit.side, target - origUs, editor.ripple));
        },
        () => editor.endGesture(),
        x,
      );
      return;
    }

    // Clip body: select, then drag to reorder.
    const ids = editor.selection.clipIds;
    if (e.ctrlKey) {
      editor.selectClips(ids.includes(hit.clipId) ? ids.filter((i) => i !== hit.clipId) : [...ids, hit.clipId]);
      return;
    }
    editor.selectClips(groupIds(hit.clipId));
    const clip = editor.project.clips.find((c) => c.id === hit.clipId)!;
    const exclude = groupIds(hit.clipId);
    let moving = false;
    drag(
      (ev, dx) => {
        if (!moving && Math.abs(dx) < DRAG_PX) return;
        moving = true;
        cursor = 'grabbing';
        const newStart = snapUs(clip.startUs + (dx / editor.pxPerSec) * 1e6, exclude, ev);
        ghost = { clipIds: exclude, offsetUs: newStart - clip.startUs };
        dropX = usToX(nearestBoundary(editor.project, xToUs(local(ev).x, view)), view);
      },
      (ev) => {
        if (moving) editor.apply((p) => moveClip(p, hit.clipId, xToUs(local(ev).x, view)));
        ghost = null;
        dropX = null;
        cursor = 'grab';
      },
      x,
    );
  }

  // Media dragged from the bin.
  function onWindowPointerMove(e: PointerEvent) {
    if (!editor.mediaDrag) return;
    const { x, inside } = local(e);
    dropX = inside ? usToX(nearestBoundary(editor.project, xToUs(x, view)), view) : null;
  }

  function onWindowPointerUp(e: PointerEvent) {
    const drag = editor.mediaDrag;
    if (!drag) return;
    dropX = null;
    const { x, inside } = local(e);
    if (inside) editor.apply((p) => insertMedia(p, drag.mediaId, xToUs(x, view)));
  }

  onMount(() => {
    const ro = new ResizeObserver(() => {
      width = wrap.clientWidth;
      height = wrap.clientHeight;
    });
    ro.observe(wrap);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
    };
  });
</script>

<svelte:window onpointermove={onWindowPointerMove} onpointerup={onWindowPointerUp} />

<section class="timeline">
  <div class="bar">
    <span class="tc">{formatTimecode(editor.playheadUs, editor.project.fps)} / {formatTimecode(endUs, editor.project.fps)}</span>
    <span class="muted">{editor.project.width}×{editor.project.height} · {(editor.project.fps.num / editor.project.fps.den).toFixed(2).replace(/\.00$/, '')} fps</span>
    <div class="spacer"></div>
    <button onclick={() => zoom(0.8)} title="Zoom out (Ctrl+Scroll)">−</button>
    <button onclick={() => zoom(1.25)} title="Zoom in (Ctrl+Scroll)">+</button>
    <button onclick={fit} title="Fit the whole timeline">Fit</button>
  </div>
  <div class="body">
    <div class="labels">
      <div class="lab" style:top="{trackTop('video')}px" style:height="{TRACK_H}px">Video</div>
      <div class="lab" style:top="{trackTop('audio')}px" style:height="{TRACK_H}px">Audio</div>
      <div class="lab ruler" style:height="{RULER_H}px"></div>
    </div>
    <div class="canvas-wrap" bind:this={wrap}>
      <canvas
        bind:this={canvas}
        style:width="{width}px"
        style:height="{height}px"
        style:cursor
        onpointerdown={onPointerDown}
        onpointermove={onHover}
        onpointerleave={() => (hoverEdge = null)}
      ></canvas>
      {#if editor.project.clips.length === 0}
        <div class="hint">Drag media here from the bin, or select it and press <kbd>Enter</kbd></div>
      {/if}
    </div>
  </div>
</section>

<style>
  .timeline {
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border-top: 1px solid var(--border);
    min-height: 0;
  }
  .bar {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 4px 10px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .bar button {
    padding: 2px 10px;
  }
  .tc {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .muted {
    color: var(--muted);
  }
  .spacer {
    flex: 1;
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .labels {
    position: relative;
    width: 56px;
    flex: none;
    background: var(--panel);
    border-right: 1px solid var(--border);
  }
  .lab {
    position: absolute;
    left: 0;
    right: 0;
    display: grid;
    place-items: center;
    color: var(--muted);
    font-size: 11px;
  }
  .lab.ruler {
    top: 0;
    background: var(--panel);
  }
  .canvas-wrap {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  canvas {
    display: block;
    touch-action: none;
  }
  .hint {
    position: absolute;
    left: 16px;
    top: 50%;
    color: var(--muted);
    pointer-events: none;
  }
</style>
