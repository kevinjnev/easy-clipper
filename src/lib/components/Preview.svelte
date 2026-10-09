<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fileUrl } from '../api';
  import { timelineEndUs, type Project, type TrackKind } from '../core/model';
  import { formatTimecode } from '../core/time';
  import { activeAt, needsSeek } from '../preview/schedule';
  import { tooltip } from '../shortcuts';
  import { editor } from '../state/editor.svelte';

  let video: HTMLVideoElement;
  let audio: HTMLAudioElement;
  let showVideo = $state(false);

  const activeVideo = $derived(activeAt(editor.project, 'video', editor.playheadUs));
  const preparing = $derived(
    activeVideo ? editor.preparing[activeVideo.media.id] && !editor.proxies[activeVideo.media.id] : false,
  );
  const empty = $derived(editor.project.clips.length === 0);

  /** Points a player at the clip under the playhead and keeps it in step with the timeline clock. */
  function sync(el: HTMLMediaElement, p: Project, track: TrackKind, us: number, playing: boolean): boolean {
    const hit = activeAt(p, track, us);
    if (!hit) {
      if (!el.paused) el.pause();
      return false;
    }
    const url = fileUrl(editor.proxies[hit.media.id] ?? hit.media.path);
    // A tiny offset so the seek lands inside the frame rather than on its boundary.
    const target = hit.sourceUs + 1000;
    if (el.dataset.src !== url) {
      el.dataset.src = url;
      el.src = url;
      el.currentTime = target / 1e6;
    } else if (needsSeek(el.currentTime * 1e6, target) && !(playing && el.seeking)) {
      el.currentTime = target / 1e6;
    }
    if (playing && el.paused) el.play().catch(() => {});
    if (!playing && !el.paused) el.pause();
    return true;
  }

  function syncAll(playing: boolean) {
    if (!video || !audio) return;
    showVideo = sync(video, editor.project, 'video', editor.playheadUs, playing);
    sync(audio, editor.project, 'audio', editor.playheadUs, playing);
  }

  // While paused, show the exact frame under the playhead.
  $effect(() => {
    void editor.playheadUs;
    void editor.project;
    void editor.proxies;
    if (!editor.playing) syncAll(false);
  });

  // Playback: the timeline clock runs on wall time and the players follow it.
  $effect(() => {
    if (!editor.playing) return;
    const end = timelineEndUs(editor.project);
    // Only `playing` and the project restart this loop; the playhead changes every frame.
    return untrack(() => play(end));
  });

  function play(end: number) {
    if (end === 0) {
      editor.playing = false;
      return undefined;
    }
    if (editor.playheadUs >= end) editor.playheadUs = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const next = editor.playheadUs + (now - last) * 1000;
      last = now;
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

  onMount(() => syncAll(false));
</script>

<section class="preview">
  <div class="screen">
    <video bind:this={video} muted playsinline preload="auto" class:hidden={!showVideo}></video>
    <audio bind:this={audio} preload="auto"></audio>
    {#if empty}
      <div class="placeholder">Import a clip to get started</div>
    {/if}
    {#if preparing}
      <div class="badge">Preparing preview…</div>
    {/if}
  </div>
  <div class="controls">
    <button onclick={() => editor.runAction('home')} title={tooltip('home')}>⏮</button>
    <button class="play" onclick={() => editor.runAction('playPause')} title={tooltip('playPause')} disabled={empty}>
      {editor.playing ? '❚❚' : '▶'}
    </button>
    <button onclick={() => editor.runAction('end')} title={tooltip('end')}>⏭</button>
    <span class="tc">{formatTimecode(editor.playheadUs, editor.project.fps)}</span>
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
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
  }
  .play {
    width: 44px;
  }
  .tc {
    font-variant-numeric: tabular-nums;
    min-width: 80px;
  }
</style>
