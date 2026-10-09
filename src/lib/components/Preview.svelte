<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fileUrl } from '../api';
  import { clipEnd, timelineEndUs } from '../core/model';
  import { formatTimecode } from '../core/time';
  import { activeAt, advancePlayhead, AUDIO_DRIFT_US, needsSeek, PAUSED_SEEK_US, VIDEO_RESEEK_US } from '../preview/schedule';
  import { FIT, panBy, zoomAt, type ViewZoom } from '../preview/zoom';
  import { tooltip } from '../shortcuts';
  import { editor } from '../state/editor.svelte';

  let video: HTMLVideoElement;
  let audio: HTMLAudioElement;
  let showVideo = $state(false);
  let screen: HTMLDivElement;
  let vz = $state<ViewZoom>(FIT);
  let panning = $state(false);

  const activeVideo = $derived(activeAt(editor.project, 'video', editor.playheadUs));
  const preparing = $derived(
    activeVideo ? editor.preparing[activeVideo.media.id] && !editor.proxies[activeVideo.media.id] : false,
  );
  const empty = $derived(editor.project.clips.length === 0);

  type Hit = ReturnType<typeof activeAt>;

  /**
   * Points a player at the clip under the playhead. It is only seeked when the clip changes or it
   * is further than `limitUs` from where it should be; every other seek would stall playback.
   */
  function sync(el: HTMLMediaElement, hit: Hit, limitUs: number, playing: boolean): boolean {
    if (!hit) {
      if (!el.paused) el.pause();
      delete el.dataset.clip;
      return false;
    }
    const url = fileUrl(editor.proxies[hit.media.id] ?? hit.media.path);
    // A tiny offset so the seek lands inside the frame rather than on its boundary.
    const target = hit.sourceUs + 1000;
    if (el.dataset.src !== url) {
      el.dataset.src = url;
      el.dataset.clip = hit.clip.id;
      el.src = url;
      el.currentTime = target / 1e6;
    } else if (el.dataset.clip !== hit.clip.id || (!el.seeking && needsSeek(el.currentTime * 1e6, target, limitUs))) {
      el.dataset.clip = hit.clip.id;
      el.currentTime = target / 1e6;
    }
    if (playing && el.paused) el.play().catch(() => {});
    if (!playing && !el.paused) el.pause();
    return true;
  }

  function syncAll(playing: boolean) {
    if (!video || !audio) return;
    const vHit = activeAt(editor.project, 'video', editor.playheadUs);
    const aHit = activeAt(editor.project, 'audio', editor.playheadUs);
    showVideo = sync(video, vHit, playing ? VIDEO_RESEEK_US : PAUSED_SEEK_US, playing);
    // While the video is the clock, keep the audio close to it; otherwise the audio is the clock.
    const audioLimit = !playing ? PAUSED_SEEK_US : vHit ? AUDIO_DRIFT_US : VIDEO_RESEEK_US;
    sync(audio, aHit, audioLimit, playing);
  }

  /** A player that is showing `hit`'s clip and actually playing, so its time can drive the playhead. */
  const ready = (el: HTMLMediaElement, hit: Hit) =>
    !!hit && el.dataset.clip === hit.clip.id && !el.seeking && !el.paused && el.readyState >= 2;

  // While paused, show the exact frame under the playhead.
  $effect(() => {
    void editor.playheadUs;
    void editor.project;
    void editor.proxies;
    if (!editor.playing) syncAll(false);
  });

  // Playback: the playing video (or audio) is the clock; wall time only covers gaps.
  $effect(() => {
    if (!editor.playing) return;
    const end = timelineEndUs(editor.project);
    // Only `playing` and the project restart this loop; the playhead changes every frame.
    return untrack(() => play(end));
  });

  /** How long the playhead waits for a player that is loading or seeking before moving on anyway. */
  const MAX_WAIT_MS = 1000;

  function play(end: number) {
    if (end === 0) {
      editor.playing = false;
      return undefined;
    }
    if (editor.playheadUs >= end) editor.playheadUs = 0;
    let last = performance.now();
    let waitingSince: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      const elapsedUs = (now - last) * 1000;
      last = now;
      const prev = editor.playheadUs;
      const vHit = activeAt(editor.project, 'video', prev);
      const aHit = activeAt(editor.project, 'audio', prev);
      const [el, hit] = vHit ? [video, vHit] : [audio, aHit];
      let next: number;
      if (!hit) {
        next = advancePlayhead(prev, elapsedUs, null);
        waitingSince = null;
      } else if (el.ended) {
        next = clipEnd(hit.clip);
      } else if (ready(el, hit)) {
        next = advancePlayhead(prev, elapsedUs, { clip: hit.clip, mediaTimeUs: el.currentTime * 1e6 });
        waitingSince = null;
      } else {
        // Loading or seeking into a new clip: hold, unless it takes too long.
        waitingSince ??= now;
        next = now - waitingSince > MAX_WAIT_MS ? prev + elapsedUs : prev;
      }
      if (next >= end) {
        editor.playheadUs = end;
        editor.playing = false;
        return;
      }
      editor.playheadUs = next;
      syncAll(true);
      raf = requestAnimationFrame(tick);
    };
    syncAll(true);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      syncAll(false);
    };
  }

  /** Zoom by `factor` around a point given in client coordinates (default: the centre). */
  function zoomBy(factor: number, clientX?: number, clientY?: number) {
    const r = screen.getBoundingClientRect();
    const cx = clientX === undefined ? 0 : clientX - r.left - r.width / 2;
    const cy = clientY === undefined ? 0 : clientY - r.top - r.height / 2;
    vz = zoomAt(vz, factor, cx, cy, r.width, r.height);
  }

  function onScreenWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.25 : 0.8, e.clientX, e.clientY);
  }

  // Ctrl+drag moves the zoomed-in frame.
  function onScreenPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !e.ctrlKey || vz.zoom === 1) return;
    e.preventDefault();
    screen.setPointerCapture(e.pointerId);
    panning = true;
    let lx = e.clientX;
    let ly = e.clientY;
    const move = (ev: PointerEvent) => {
      const r = screen.getBoundingClientRect();
      vz = panBy(vz, ev.clientX - lx, ev.clientY - ly, r.width, r.height);
      lx = ev.clientX;
      ly = ev.clientY;
    };
    const up = () => {
      panning = false;
      screen.removeEventListener('pointermove', move);
      screen.removeEventListener('pointerup', up);
    };
    screen.addEventListener('pointermove', move);
    screen.addEventListener('pointerup', up);
  }

  onMount(() => {
    syncAll(false);
    screen.addEventListener('wheel', onScreenWheel, { passive: false });
    return () => screen.removeEventListener('wheel', onScreenWheel);
  });
</script>

<section class="preview">
  <div
    class="screen"
    bind:this={screen}
    onpointerdown={onScreenPointerDown}
    style:cursor={vz.zoom > 1 ? (panning ? 'grabbing' : 'grab') : 'default'}
    title={vz.zoom > 1 ? 'Ctrl+drag to move, Ctrl+Scroll to zoom' : 'Ctrl+Scroll to zoom'}
    role="img"
    aria-label="Preview"
  >
    <video
      bind:this={video}
      muted
      playsinline
      preload="auto"
      class:hidden={!showVideo}
      style:transform="translate({vz.panX}px, {vz.panY}px) scale({vz.zoom})"
    ></video>
    <audio bind:this={audio} preload="auto"></audio>
    {#if empty}
      <div class="placeholder">Import a clip to get started</div>
    {/if}
    {#if preparing}
      <div class="badge">Preparing preview…</div>
    {/if}
  </div>
  <div class="controls">
    <span class="tc">{formatTimecode(editor.playheadUs, editor.project.fps)}</span>
    <div class="transport">
      <button onclick={() => editor.runAction('home')} title={tooltip('home')}>⏮</button>
      <button class="play" onclick={() => editor.runAction('playPause')} title={tooltip('playPause')} disabled={empty}>
        {editor.playing ? '❚❚' : '▶'}
      </button>
      <button onclick={() => editor.runAction('end')} title={tooltip('end')}>⏭</button>
    </div>
    <div class="zoom">
      <button onclick={() => zoomBy(0.8)} disabled={vz.zoom <= 1} title="Zoom out (Ctrl+Scroll on the preview)">−</button>
      <span class="pct">{Math.round(vz.zoom * 100)}%</span>
      <button onclick={() => zoomBy(1.25)} disabled={vz.zoom >= 8} title="Zoom in (Ctrl+Scroll on the preview)">+</button>
      <button onclick={() => (vz = FIT)} disabled={vz.zoom === 1} title="Fit the frame">Fit</button>
    </div>
  </div>
</section>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    padding: 8px;
    gap: 6px;
  }
  .screen {
    position: relative;
    flex: 1;
    min-height: 0;
    background: #000;
    border-radius: 6px;
    overflow: hidden;
    display: grid;
    place-items: center;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transform-origin: center;
  }
  .hidden {
    visibility: hidden;
  }
  .placeholder {
    position: absolute;
    color: var(--muted);
  }
  .badge {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgb(0 0 0 / 0.7);
    color: var(--warn);
    padding: 3px 8px;
    border-radius: 4px;
  }
  .controls {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
  }
  .transport,
  .zoom {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .zoom {
    justify-self: end;
  }
  .zoom button {
    padding: 3px 8px;
  }
  .pct {
    min-width: 40px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .play {
    width: 44px;
  }
  .tc {
    font-variant-numeric: tabular-nums;
    min-width: 80px;
  }
</style>
