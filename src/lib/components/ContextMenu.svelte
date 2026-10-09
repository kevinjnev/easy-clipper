<script lang="ts" generics="T extends string">
  import { onMount } from 'svelte';

  interface Item {
    id: T;
    label: string;
    keys?: string;
    disabled: boolean;
  }

  let { x, y, items, onpick, onclose }: { x: number; y: number; items: Item[]; onpick: (id: T) => void; onclose: () => void } =
    $props();

  let menu: HTMLDivElement;
  let size = $state({ w: 0, h: 0 });
  // Keep the menu inside the window.
  const left = $derived(Math.max(4, Math.min(x, window.innerWidth - size.w - 4)));
  const top = $derived(Math.max(4, Math.min(y, window.innerHeight - size.h - 4)));

  onMount(() => {
    const r = menu.getBoundingClientRect();
    size = { w: r.width, h: r.height };
    const outside = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node)) onclose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onclose();
      }
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', onclose);
    window.addEventListener('resize', onclose);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onclose);
      window.removeEventListener('resize', onclose);
    };
  });
</script>

<div class="menu" role="menu" bind:this={menu} style:left="{left}px" style:top="{top}px">
  {#each items as item (item.id)}
    <button
      role="menuitem"
      disabled={item.disabled}
      onclick={() => {
        onpick(item.id);
        onclose();
      }}
    >
      <span>{item.label}</span>
      {#if item.keys}<kbd>{item.keys}</kbd>{/if}
    </button>
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 70;
    min-width: 200px;
    padding: 4px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
  }
  button {
    display: flex;
    width: 100%;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    background: none;
    border: none;
    border-radius: 5px;
    padding: 6px 10px;
    text-align: left;
  }
  button:hover:not(:disabled) {
    background: #2f3a5c;
  }
  kbd {
    background: none;
    border: none;
    color: var(--muted);
    padding: 0;
  }
</style>
