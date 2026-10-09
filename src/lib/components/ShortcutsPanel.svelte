<script lang="ts">
  import { SHORTCUT_HINTS, SHORTCUTS, type ShortcutGroup } from '../shortcuts';
  import { editor } from '../state/editor.svelte';

  const GROUPS: ShortcutGroup[] = ['Playback', 'Editing', 'Trimming', 'Project'];
  const rows = (g: ShortcutGroup) => [
    ...SHORTCUTS.filter((s) => s.group === g),
    ...SHORTCUT_HINTS.filter((s) => s.group === g),
  ];
</script>

<section class="shortcuts" aria-label="Keyboard shortcuts">
  <div class="head">
    <strong>Shortcuts</strong>
    <span class="hint">Click a clip edge or press <kbd>[</kbd> / <kbd>]</kbd>, then use <kbd>←</kbd> <kbd>→</kbd> to trim frame by frame.</span>
    <button class="close" onclick={() => (editor.showShortcuts = false)} title="Hide (?)">✕</button>
  </div>
  <div class="grid">
    {#each GROUPS as g (g)}
      <div class="col">
        <h4>{g}</h4>
        {#each rows(g) as s (s.keys + s.label)}
          <div class="row"><kbd>{s.keys}</kbd><span>{s.label}</span></div>
        {/each}
      </div>
    {/each}
  </div>
</section>

<style>
  .shortcuts {
    background: var(--panel);
    border-top: 1px solid var(--border);
    padding: 6px 12px 10px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .hint {
    color: var(--muted);
    flex: 1;
  }
  .close {
    padding: 2px 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px 20px;
  }
  h4 {
    margin: 6px 0 4px;
    color: var(--muted);
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: baseline;
    padding: 1px 0;
  }
  .row kbd {
    min-width: 64px;
    text-align: center;
  }
</style>
