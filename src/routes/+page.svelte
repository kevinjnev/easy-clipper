<script lang="ts">
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { onMount, tick } from 'svelte';
  import { isTauri } from '@tauri-apps/api/core';
  import { LogicalSize } from '@tauri-apps/api/dpi';
  import { errorMessage, ffmpegStatus } from '$lib/api';
  import ExportDialog from '$lib/components/ExportDialog.svelte';
  import MediaBin from '$lib/components/MediaBin.svelte';
  import Preview from '$lib/components/Preview.svelte';
  import ShortcutsPanel from '$lib/components/ShortcutsPanel.svelte';
  import Timeline from '$lib/components/Timeline.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import { minWindowSize } from '$lib/layout/minSize';
  import { resolveShortcut } from '$lib/shortcuts';
  import { editor } from '$lib/state/editor.svelte';

  let ffmpegError = $state<string | null>(null);
  let fileHover = $state(false);
  const dragName = $derived(editor.mediaDrag ? editor.project.media.find((m) => m.id === editor.mediaDrag?.mediaId)?.name : null);

  // Window minimum size, measured from the real layout so it holds under any display or text scaling.
  let appEl: HTMLDivElement;
  let appliedMin = { width: 0, height: 0 };
  let measureQueued = false;

  const px = (el: Element, prop: string) => parseFloat(getComputedStyle(el).getPropertyValue(prop)) || 0;
  const w = (el: Element | null) => (el ? el.getBoundingClientRect().width : 0);
  const h = (el: Element | null) => (el ? el.getBoundingClientRect().height : 0);

  /**
   * Width a flex/grid row needs: its children side by side with its gaps and padding. Stretchy
   * fillers (flex-grow) are skipped — they take whatever is left, so their current size says nothing.
   */
  function rowMinWidth(row: Element | null): number {
    if (!row) return 0;
    const kids = [...row.children];
    const gap = px(row, 'column-gap');
    const widths = kids.reduce((sum, k) => sum + (px(k, 'flex-grow') > 0 ? 0 : w(k)), 0);
    // A filler still has gaps on both sides even at zero width.
    return widths + gap * Math.max(0, kids.length - 1) + px(row, 'padding-left') + px(row, 'padding-right');
  }

  function measureMinSize() {
    measureQueued = false;
    const q = (sel: string) => appEl?.querySelector(sel) ?? null;
    const preview = q('.preview');
    const controls = q('.controls');
    if (!appEl || !preview || !controls) return;
    const shortcuts = q('.shortcuts');
    const [tc, transport, zoom] = [...controls.children];
    const controlsMinW = 2 * Math.max(w(tc), w(zoom)) + w(transport) + 2 * px(controls, 'column-gap');
    const size = minWindowSize({
      toolbarH: h(q('.toolbar')),
      timelineH: h(q('.timeline')),
      shortcutsH: h(shortcuts),
      previewChromeH: px(preview, 'padding-top') + px(preview, 'padding-bottom') + px(preview, 'row-gap') + h(controls),
      toolbarMinW: rowMinWidth(q('.toolbar')),
      shortcutsMinW: shortcuts ? rowMinWidth(q('.shortcuts .grid')) + px(shortcuts, 'padding-left') + px(shortcuts, 'padding-right') : 0,
      previewRowMinW: w(q('.bin')) + px(preview, 'padding-left') + px(preview, 'padding-right') + controlsMinW,
    });
    if (size.width === appliedMin.width && size.height === appliedMin.height) return;
    appliedMin = size;
    (window as unknown as { __minSize: typeof size }).__minSize = size;
    if (!isTauri()) return;
    const win = getCurrentWindow();
    win.setMinSize(new LogicalSize(size.width, size.height)).catch(() => {});
    // If the window is already smaller (e.g. the shortcuts panel was just shown), grow it to fit.
    if (window.innerWidth < size.width || window.innerHeight < size.height) {
      win.isMaximized().then((max) => {
        if (!max) win.setSize(new LogicalSize(Math.max(window.innerWidth, size.width), Math.max(window.innerHeight, size.height)));
      }).catch(() => {});
    }
  }

  /** One measurement per batch of changes, however many things change at once. */
  function queueMeasure() {
    if (measureQueued) return;
    measureQueued = true;
    setTimeout(measureMinSize, 0);
  }

  // Showing or hiding the shortcuts panel changes the minimum height.
  $effect(() => {
    void editor.showShortcuts;
    tick().then(queueMeasure);
  });

  /** The browser's own right-click menu is meaningless here; keep it only for text boxes (copy/paste). */
  function onContextMenu(e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
  }

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
    // Development: lets the dev harness / browser console drive the editor.
    if (import.meta.env.DEV) (window as unknown as { __editor: typeof editor }).__editor = editor;
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
    // Re-measure when parts of the layout change size (e.g. text scaling, the panel appearing).
    const ro = new ResizeObserver(queueMeasure);
    ro.observe(appEl);
    for (const sel of ['.toolbar', '.timeline', '.controls']) {
      const el = appEl.querySelector(sel);
      if (el) ro.observe(el);
    }
    document.fonts?.ready.then(queueMeasure);
    let unlistenClose: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (e) => {
        if (!(await editor.confirmDiscard())) e.preventDefault();
      })
      .then((u) => (unlistenClose = u));
    return () => {
      ro.disconnect();
      unlisten?.();
      unlistenClose?.();
    };
  });
</script>

<svelte:window onkeydown={onKeydown} oncontextmenu={onContextMenu} />

<div class="app" class:with-shortcuts={editor.showShortcuts} bind:this={appEl}>
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
      <p class="muted">Simple Clipper uses FFmpeg to read and export video. The download zip includes it — make sure <code>ffmpeg.exe</code> and <code>ffprobe.exe</code> are in the same folder as <code>SimpleClipper.exe</code>, then restart.</p>
    </div>
  </div>
{/if}

<style>
  .app {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
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
