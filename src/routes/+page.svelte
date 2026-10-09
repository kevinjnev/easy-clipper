<script lang="ts">
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { onMount } from 'svelte';
  import { errorMessage, ffmpegStatus } from '$lib/api';
  import ExportDialog from '$lib/components/ExportDialog.svelte';
  import MediaBin from '$lib/components/MediaBin.svelte';
  import Preview from '$lib/components/Preview.svelte';
  import ShortcutsPanel from '$lib/components/ShortcutsPanel.svelte';
  import Timeline from '$lib/components/Timeline.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import { resolveShortcut } from '$lib/shortcuts';
  import { editor } from '$lib/state/editor.svelte';

  let ffmpegError = $state<string | null>(null);
  let fileHover = $state(false);
  const dragName = $derived(editor.mediaDrag ? editor.project.media.find((m) => m.id === editor.mediaDrag?.mediaId)?.name : null);

  function onKeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (editor.exportOpen) return;
    const action = resolveShortcut(e);
    if (!action) return;
    e.preventDefault();
    editor.runAction(action);
  }

  onMount(() => {
    ffmpegStatus().catch((e) => (ffmpegError = errorMessage(e)));
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === 'enter' || p.type === 'over') fileHover = true;
        else if (p.type === 'leave') fileHover = false;
        else if (p.type === 'drop') {
          fileHover = false;
          if (p.paths.length) void editor.importFiles(p.paths);
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app" class:with-shortcuts={editor.showShortcuts}>
  <Toolbar />
  <main>
    <MediaBin />
    <Preview />
  </main>
  <Timeline />
  {#if editor.showShortcuts}
    <ShortcutsPanel />
  {/if}
</div>

{#if editor.exportOpen}
  <ExportDialog />
{/if}

{#if editor.notice}
  <div class="notice" role="alert">
    <span>{editor.notice}</span>
    <button onclick={() => (editor.notice = null)}>Dismiss</button>
  </div>
{/if}

{#if fileHover}
  <div class="drop-overlay">Drop to import</div>
{/if}

{#if editor.mediaDrag && dragName}
  <div class="drag-ghost" style:left="{editor.mediaDrag.x + 12}px" style:top="{editor.mediaDrag.y + 12}px">{dragName}</div>
{/if}

{#if ffmpegError}
  <div class="modal-backdrop">
    <div class="modal">
      <h3>FFmpeg is missing</h3>
      <p>{ffmpegError}</p>
      <p class="muted">Easy Clipper uses FFmpeg to read and export video. The download zip includes it — make sure <code>ffmpeg.exe</code> and <code>ffprobe.exe</code> are in the same folder as <code>EasyClipper.exe</code>, then restart.</p>
    </div>
  </div>
{/if}

<style>
  .app {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) 222px;
    height: 100vh;
  }
  .app.with-shortcuts {
    grid-template-rows: auto minmax(0, 1fr) 222px auto;
  }
  main {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    min-height: 0;
  }
  .notice {
    position: fixed;
    top: 54px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 12px;
    align-items: center;
    background: #3a2a2a;
    border: 1px solid var(--danger);
    border-radius: 8px;
    padding: 8px 12px;
    max-width: 70vw;
    z-index: 30;
  }
  .drop-overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 22px;
    background: rgb(20 30 60 / 0.6);
    border: 3px dashed var(--accent);
    pointer-events: none;
    z-index: 40;
  }
  .drag-ghost {
    position: fixed;
    pointer-events: none;
    background: var(--accent-2);
    padding: 4px 8px;
    border-radius: 6px;
    z-index: 50;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.6);
    display: grid;
    place-items: center;
    z-index: 60;
  }
  .modal {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 22px;
    max-width: 520px;
  }
  .muted {
    color: var(--muted);
  }
</style>
