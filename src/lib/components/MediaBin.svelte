<script lang="ts">
  import { fileUrl, pickMediaFiles } from '../api';
  import type { MediaItem } from '../core/model';
  import { editor } from '../state/editor.svelte';

  const DRAG_START_PX = 5;

  function duration(us: number) {
    const s = Math.round(us / 1e6);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function kind(m: MediaItem) {
    if (m.hasVideo && m.hasAudio) return 'Video + audio';
    if (m.hasVideo) return 'Video (no audio)';
    return 'Audio';
  }

  async function importMedia() {
    const paths = await pickMediaFiles();
    if (paths.length) await editor.importFiles(paths);
  }

  function startDrag(e: PointerEvent, m: MediaItem) {
    if (e.button !== 0 || m.error) return;
    editor.selectMedia(m.id);
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent) => {
      if (editor.mediaDrag || Math.hypot(ev.clientX - sx, ev.clientY - sy) > DRAG_START_PX) {
        editor.mediaDrag = { mediaId: m.id, x: ev.clientX, y: ev.clientY };
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // Let the timeline's pointerup handler see the drag first.
      setTimeout(() => (editor.mediaDrag = null));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
</script>

<aside class="bin">
  <div class="head">
    <strong>Media</strong>
    <button onclick={importMedia}>+ Import</button>
  </div>
  {#if editor.project.media.length === 0}
    <div class="empty">
      Drop video or audio files here,<br />or click <b>Import</b>.
    </div>
  {:else}
    <ul>
      {#each editor.project.media as m (m.id)}
        <li
          class:selected={editor.selection.mediaId === m.id}
          class:error={!!m.error}
          onpointerdown={(e) => startDrag(e, m)}
          ondblclick={() => !m.error && editor.runAction('appendSelectedMedia')}
          title={m.error ?? `${m.path}\nDouble-click or press Enter to add to the end of the timeline; drag onto the timeline to insert.`}
        >
          <div
            class="thumb"
            style:background-image={editor.thumbs[m.id] ? `url("${fileUrl(editor.thumbs[m.id])}")` : undefined}
          >
            {#if !m.hasVideo && !m.error}♪{/if}
            {#if m.error}!{/if}
          </div>
          <div class="info">
            <div class="name">{m.name}</div>
            {#if m.error}
              <div class="sub err">{m.error}</div>
            {:else}
              <div class="sub">{duration(m.durationUs)} · {kind(m)}{m.hasVideo ? ` · ${m.width}×${m.height}` : ''}</div>
              {#if editor.preparing[m.id]}<div class="sub badge">Preparing preview…</div>{/if}
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .bin {
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-right: 1px solid var(--border);
    min-height: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
  }
  .empty {
    color: var(--muted);
    text-align: center;
    margin: 30px 12px;
    line-height: 1.6;
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 24px 8px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 6px 6px;
    overflow-y: auto;
  }
  li {
    display: flex;
    gap: 8px;
    padding: 6px;
    border-radius: 6px;
    cursor: grab;
    border: 1px solid transparent;
  }
  li:hover {
    background: var(--panel-2);
  }
  li.selected {
    border-color: var(--accent);
    background: var(--panel-2);
  }
  li.error {
    cursor: default;
  }
  .thumb {
    flex: none;
    width: 64px;
    height: 36px;
    border-radius: 4px;
    background-color: #0d0e11;
    background-size: 1000% 100%;
    background-position: 0 0;
    display: grid;
    place-items: center;
    color: var(--muted);
    font-size: 16px;
  }
  .error .thumb {
    color: var(--danger);
  }
  .info {
    min-width: 0;
  }
  .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    color: var(--muted);
    font-size: 11px;
  }
  .sub.err {
    color: var(--danger);
  }
  .badge {
    color: var(--warn);
  }
</style>
