<script lang="ts">
  import { pickMediaFiles } from '../api';
  import { tooltip } from '../shortcuts';
  import { editor } from '../state/editor.svelte';

  const hasClips = $derived(editor.project.clips.length > 0);
  const hasSelection = $derived(editor.selection.clipIds.length > 0);

  async function importMedia() {
    const paths = await pickMediaFiles();
    if (paths.length) await editor.importFiles(paths);
  }
</script>

<header class="toolbar">
  <div class="group">
    <button onclick={importMedia} title="Import media files">Import</button>
    <button onclick={() => editor.runAction('open')} title={tooltip('open')}>Open</button>
    <button onclick={() => editor.runAction('save')} title={tooltip('save')}>Save{editor.dirty ? ' •' : ''}</button>
  </div>
  <div class="group">
    <button onclick={() => editor.runAction('undo')} disabled={!editor.canUndo} title={tooltip('undo')}>Undo</button>
    <button onclick={() => editor.runAction('redo')} disabled={!editor.canRedo} title={tooltip('redo')}>Redo</button>
  </div>
  <div class="group">
    <button onclick={() => editor.runAction('split')} disabled={!hasClips} title={tooltip('split')}>Split</button>
    <button onclick={() => editor.runAction('delete')} disabled={!hasSelection} title={tooltip('delete')}>Delete</button>
    <button onclick={() => editor.runAction('toggleLink')} disabled={!hasSelection} title={tooltip('toggleLink')}>Link / Unlink</button>
  </div>
  <div class="spacer"></div>
  <div class="group">
    <button class:on={editor.showShortcuts} onclick={() => editor.runAction('toggleShortcuts')} title={tooltip('toggleShortcuts')}>Shortcuts</button>
    <button class="primary" onclick={() => editor.runAction('export')} disabled={!hasClips} title={tooltip('export')}>Export</button>
  </div>
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 6px 10px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .group {
    display: flex;
    flex: none;
    gap: 6px;
  }
  .spacer {
    flex: 1;
  }
</style>
