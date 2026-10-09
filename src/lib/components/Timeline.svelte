<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fileUrl } from '../api';
  import { clipsForMedia, dropMedia, groupOf, moveClip, placeGroup, splitAt, trimEdge } from '../core/edit';
  import { timelineMenu, type MenuAction, type MenuItem } from '../timeline/menu';
  import ContextMenu from './ContextMenu.svelte';
  import { clipEnd, clipLen, timelineEndUs, type Clip } from '../core/model';
  import { snapSpan, snapTargets, snapThresholdUs, snapValue } from '../core/snap';
  import { formatTimecode } from '../core/time';
  import { editor } from '../state/editor.svelte';
  import { drawPlayhead, drawTimeline, type DrawState } from '../timeline/draw';
  import { hitTest, RULER_H, trackTop, TRACK_H, usToX, xToUs, type Hit, type View } from '../timeline/geometry';

  const DRAG_PX = 4;
  const MIN_PX_PER_SEC = 2;
  const MAX_PX_PER_SEC = 2000;

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let scroller: HTMLDivElement;
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
  /** Scrollable length: the clips plus half a screen of room to drop things after them. */
  const contentUs = $derived(Math.max(endUs + ((width / 2) * 1e6) / editor.pxPerSec, (width * 1e6) / editor.pxPerSec));
  const contentPx = $derived((contentUs / 1e6) * editor.pxPerSec);

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

  // The clips are drawn into an off-screen layer only when the timeline changes; each frame (e.g.
  // during playback) just copies that layer and draws the playhead on top.
  const layer = typeof document === 'undefined' ? null : document.createElement('canvas');
  let layerVersion = $state(0);

  $effect(() => {
    const state: DrawState = { selection: editor.selection, dropX, ghost, hoverEdge };
    void imageTick;
    void JSON.stringify(editor.selection);
    const ctx = layer?.getContext('2d');
    if (!layer || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (layer.width !== w) layer.width = w;
    if (layer.height !== h) layer.height = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTimeline(ctx, width, height, editor.project, view, state, images, editor.waves);
    untrack(() => layerVersion++);
  });

  $effect(() => {
    void layerVersion;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !layer) return;
    if (canvas.width !== layer.width) canvas.width = layer.width;
    if (canvas.height !== layer.height) canvas.height = layer.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPlayhead(ctx, height, editor.playheadUs, view);
  });

  // Keep the scroll bar in step with scrolling done any other way (wheel, zoom, playback).
  $effect(() => {
    const left = (editor.scrollUs / 1e6) * editor.pxPerSec;
    void contentPx;
    if (scroller && Math.abs(scroller.scrollLeft - left) > 1) scroller.scrollLeft = left;
  });

  // Keep the playhead visible while playing.
  $effect(() => {
    if (!editor.playing) return;
    const x = usToX(editor.playheadUs, view);
    if (x > width - 40 || x < 0) setScroll(editor.playheadUs - (width * 0.1 * 1e6) / editor.pxPerSec);
  });

  // Zoom to fit when the first clips arrive.
  let hadClips = false;
  $effect(() => {
    const has = editor.project.clips.length > 0;
    if (has && !hadClips) fit();
    hadClips = has;
  });

  function setScroll(us: number) {
    const max = Math.max(0, contentUs - (width * 1e6) / editor.pxPerSec);
    editor.scrollUs = Math.min(max, Math.max(0, us));
  }

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
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom,
    };
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey) {
      zoom(e.deltaY < 0 ? 1.25 : 0.8, local(e).x);
    } else {
      const delta = ((e.deltaY !== 0 ? e.deltaY : e.deltaX) / editor.pxPerSec) * 1e6;
      setScroll(editor.scrollUs + delta);
    }
  }

  function onScrollbar() {
    editor.scrollUs = (scroller.scrollLeft / editor.pxPerSec) * 1e6;
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

  const threshold = () => snapThresholdUs(editor.pxPerSec, editor.project.fps);
  const targets = (excludeIds: string[]) => snapTargets(editor.project, editor.playheadUs, excludeIds);

  /** Where a dragged group would land; shows a marker there when the drop would push other clips. */
  function preview(group: Clip[], groupStartUs: number): number {
    const placed = placeGroup(editor.project, group, groupStartUs);
    dropX = placed.pushedIds.length ? usToX(placed.startUs, view) : null;
    return placed.startUs;
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
      const exclude = groupOf(editor.project, hit.clipId).map((c) => c.id);
      const origUs = hit.side === 'right' ? clipEnd(clip) : clip.startUs;
      editor.beginGesture();
      drag(
        (ev, dx) => {
          let target = origUs + (dx / editor.pxPerSec) * 1e6;
          if (!ev.altKey) target = snapValue(target, targets(exclude), threshold());
          editor.updateGesture((p) => trimEdge(p, hit.clipId, hit.side, target - origUs));
        },
        () => editor.endGesture(),
        x,
      );
      return;
    }

    // Clip body: select, then drag to move. Nothing changes until the drop.
    const ids = editor.selection.clipIds;
    if (e.ctrlKey) {
      editor.selectClips(ids.includes(hit.clipId) ? ids.filter((i) => i !== hit.clipId) : [...ids, hit.clipId]);
      return;
    }
    const group = groupOf(editor.project, hit.clipId);
    editor.selectClips(group.map((c) => c.id));
    const clip = group[0];
    const groupStart = Math.min(...group.map((c) => c.startUs));
    const groupEnd = Math.max(...group.map(clipEnd));
    let moving = false;
    let newStart = clip.startUs;
    drag(
      (ev, dx) => {
        if (!moving && Math.abs(dx) < DRAG_PX) return;
        moving = true;
        cursor = 'grabbing';
        const shift = (dx / editor.pxPerSec) * 1e6;
        let gs = Math.max(0, groupStart + shift);
        if (!ev.altKey) gs = snapSpan(gs, groupEnd - groupStart, targets(group.map((c) => c.id)), threshold());
        newStart = gs + (clip.startUs - groupStart);
        const landsAt = preview(group, gs);
        ghost = { clipIds: group.map((c) => c.id), offsetUs: landsAt - groupStart };
      },
      () => {
        if (moving) editor.apply((p) => moveClip(p, hit.clipId, newStart));
        ghost = null;
        dropX = null;
        cursor = 'grab';
      },
      x,
    );
  }

  // Right-click menu.
  let menu = $state<{ x: number; y: number; items: MenuItem[]; atUs: number } | null>(null);

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    const { x, y } = local(e);
    const hit = hitTest(editor.project, view, x, y);
    const atUs = Math.max(0, xToUs(x, view));
    let items: MenuItem[];
    if (hit.kind === 'clip' || hit.kind === 'edge') {
      if (!editor.selection.clipIds.includes(hit.clipId)) editor.selectClips(groupOf(editor.project, hit.clipId).map((c) => c.id));
      items = timelineMenu(editor.project, editor.selection.clipIds, 'clip', atUs, editor.playheadUs);
    } else {
      items = timelineMenu(editor.project, [], 'empty', atUs);
    }
    menu = { x: e.clientX, y: e.clientY, items, atUs };
  }

  function onMenuPick(action: MenuAction) {
    const atUs = menu?.atUs ?? 0;
    const ids = editor.selection.clipIds;
    switch (action) {
      case 'splitHere': editor.apply((p) => splitAt(p, atUs, ids)); break;
      case 'splitPlayhead': editor.runAction('split'); break;
      case 'delete': editor.runAction('delete'); break;
      case 'link': editor.runAction('toggleLink'); break;
      case 'playheadHere': editor.setPlayhead(atUs); break;
      case 'fit': fit(); break;
    }
  }

  // Media dragged from the bin: show where it would land; add it only on drop.
  let mediaDropStart: number | null = null;

  function onWindowPointerMove(e: PointerEvent) {
    const drag = editor.mediaDrag;
    if (!drag) return;
    const { x, inside } = local(e);
    const group = clipsForMedia(editor.project, drag.mediaId);
    if (!inside || group.length === 0) {
      dropX = null;
      mediaDropStart = null;
      return;
    }
    let start = Math.max(0, xToUs(x, view));
    if (!e.altKey) start = snapSpan(start, Math.max(...group.map(clipLen)), targets([]), threshold());
    mediaDropStart = start;
    dropX = usToX(preview(group, start), view);
  }

  function onWindowPointerUp() {
    const drag = editor.mediaDrag;
    const start = mediaDropStart;
    dropX = null;
    mediaDropStart = null;
    if (drag && start !== null) editor.apply((p) => dropMedia(p, drag.mediaId, start));
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

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} onpick={onMenuPick} onclose={() => (menu = null)} />
{/if}

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
    <div class="lanes">
      <div class="canvas-wrap" bind:this={wrap}>
        <canvas
          bind:this={canvas}
          style:width="{width}px"
          style:height="{height}px"
          style:cursor
          onpointerdown={onPointerDown}
          onpointermove={onHover}
          onpointerleave={() => (hoverEdge = null)}
          oncontextmenu={onContextMenu}
        ></canvas>
        {#if editor.project.clips.length === 0}
          <div class="hint">Drag media here from the bin, or select it and press <kbd>Enter</kbd></div>
        {/if}
      </div>
      <div class="hscroll" bind:this={scroller} onscroll={onScrollbar}>
        <div style:width="{contentPx}px"></div>
      </div>
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
  .lanes {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .canvas-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  /* Absolutely positioned so the canvas never props the layout open when the window shrinks. */
  canvas {
    position: absolute;
    inset: 0;
    display: block;
    touch-action: none;
  }
  .hscroll {
    flex: none;
    overflow-x: auto;
    overflow-y: hidden;
    height: 14px;
    background: var(--panel);
  }
  .hscroll > div {
    height: 1px;
  }
  .hscroll::-webkit-scrollbar {
    height: 12px;
  }
  .hscroll::-webkit-scrollbar-thumb {
    background: #4a4e5a;
    border-radius: 6px;
    border: 2px solid var(--panel);
  }
  .hscroll::-webkit-scrollbar-thumb:hover {
    background: #5d6272;
  }
  .hint {
    position: absolute;
    left: 16px;
    top: 50%;
    color: var(--muted);
    pointer-events: none;
  }
</style>
