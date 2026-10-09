<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../api';
  import { timelineEndUs, trackClips } from '../core/model';
  import { defaultSettings, offlineClipMedia, toExportProject } from '../exportProject';
  import { editor } from '../state/editor.svelte';

  type Phase = 'setup' | 'running' | 'done' | 'error';
  type Res = 'source' | '1080' | '720' | '480' | 'custom';

  const project = editor.project;
  const hasAudio = trackClips(project, 'audio').length > 0;
  const durationS = timelineEndUs(project) / 1e6;

  let encoders = $state<string[]>([]);
  let settings = $state(defaultSettings('mp4', []));
  let useCpu = $state(false);
  let res = $state<Res>('source');
  let customWidth = $state(project.width);
  let phase = $state<Phase>('setup');
  let progress = $state(0);
  let error = $state('');
  let outPath = $state('');

  const isAudio = $derived(settings.format === 'mp3' || settings.format === 'wav');
  const isGif = $derived(settings.format === 'gif');
  const gpu = $derived(encoders[0] ?? null);

  /** Width for a "720p"-style preset: the short side becomes `short`. */
  function presetWidth(short: number) {
    const { width: w, height: h } = project;
    return w >= h ? Math.round((short * w) / h) : short;
  }

  function outputWidth(): number | null {
    if (isGif) return settings.width;
    if (res === 'source') return null;
    if (res === 'custom') return Math.max(2, Math.round(customWidth || 0));
    return presetWidth(Number(res));
  }

  function setFormat(f: api.ExportFormat) {
    const keep = { quality: settings.quality, fps: settings.fps };
    settings = { ...defaultSettings(f, encoders), ...keep };
  }

  async function start() {
    const offline = offlineClipMedia(project);
    if (offline.length) {
      error = `These files are missing, so their clips can't be exported: ${offline.join(', ')}. Delete those clips or reopen the project to locate the files.`;
      phase = 'error';
      return;
    }
    const path = await api.pickExportPath(settings.format);
    if (!path) return;
    outPath = path;
    const final: api.ExportSettings = {
      ...settings,
      width: outputWidth(),
      encoder: useCpu || !gpu ? 'libx264' : gpu,
      outPath: path,
    };
    phase = 'running';
    progress = 0;
    const unlisten = await api.onExportProgress((f) => (progress = f));
    try {
      await api.startExport(toExportProject(project), final);
      phase = 'done';
    } catch (e) {
      error = api.errorMessage(e);
      phase = error === 'Export cancelled' ? 'setup' : 'error';
    } finally {
      unlisten();
    }
  }

  function close() {
    if (phase !== 'running') editor.exportOpen = false;
  }

  onMount(() => {
    api.listEncoders().then((e) => {
      encoders = e;
      settings.encoder = e[0] ?? 'libx264';
    }).catch(() => {});
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="backdrop" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && close()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Export">
    <h3>Export</h3>

    {#if phase === 'setup' || phase === 'error'}
      <div class="field">
        <span class="label">Format</span>
        <div class="seg">
          <button class:on={settings.format === 'mp4'} onclick={() => setFormat('mp4')}>MP4 video</button>
          <button class:on={settings.format === 'gif'} onclick={() => setFormat('gif')}>GIF</button>
          <button class:on={settings.format === 'mp3'} onclick={() => setFormat('mp3')} disabled={!hasAudio} title={hasAudio ? '' : 'No audio on the timeline'}>MP3 audio</button>
          <button class:on={settings.format === 'wav'} onclick={() => setFormat('wav')} disabled={!hasAudio} title={hasAudio ? '' : 'No audio on the timeline'}>WAV audio</button>
        </div>
      </div>

      {#if settings.format === 'mp4'}
        <label class="field">
          <span class="label">Resolution</span>
          <select bind:value={res}>
            <option value="source">Source ({project.width}×{project.height})</option>
            <option value="1080">1080p</option>
            <option value="720">720p</option>
            <option value="480">480p</option>
            <option value="custom">Custom width…</option>
          </select>
          {#if res === 'custom'}
            <input type="number" min="16" max="7680" step="2" bind:value={customWidth} /> px wide
          {/if}
        </label>
        {#if res !== 'source'}
          <label class="field check"><input type="checkbox" bind:checked={settings.allowUpscale} /> Allow upscaling above the source size</label>
        {/if}
        <label class="field">
          <span class="label">Quality</span>
          <select bind:value={settings.quality}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="small">Small file</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Frame rate</span>
          <select bind:value={settings.fps}>
            <option value={null}>Source ({(project.fps.num / project.fps.den).toFixed(2).replace(/\.00$/, '')} fps)</option>
            <option value={60}>60 fps</option>
            <option value={30}>30 fps</option>
          </select>
        </label>
        <div class="field">
          <span class="label">Encoder</span>
          <span>{gpu && !useCpu ? `GPU (${gpu.replace('h264_', '').toUpperCase()})` : 'CPU (x264)'}</span>
          {#if gpu}
            <label class="check"><input type="checkbox" bind:checked={useCpu} /> Use CPU encoder</label>
          {/if}
        </div>
      {/if}

      {#if isGif}
        <label class="field">
          <span class="label">Width</span>
          <input type="number" min="16" max="1920" step="2" bind:value={settings.width} /> px
        </label>
        <label class="field">
          <span class="label">Frame rate</span>
          <select bind:value={settings.gifFps}>
            <option value={10}>10 fps</option>
            <option value={15}>15 fps</option>
            <option value={24}>24 fps</option>
          </select>
        </label>
        {#if durationS > 30}
          <p class="warn">This GIF is {Math.round(durationS)} seconds long — GIFs over 30 seconds get very large. Consider MP4.</p>
        {/if}
      {/if}

      {#if isAudio}
        <p class="muted">Exports only the audio track ({settings.format === 'mp3' ? 'MP3, high quality VBR' : 'WAV, 16-bit 48 kHz'}).</p>
      {/if}

      {#if phase === 'error'}
        <pre class="error">{error}</pre>
      {/if}

      <div class="actions">
        <span class="muted">Length {Math.floor(durationS / 60)}:{String(Math.round(durationS % 60)).padStart(2, '0')}</span>
        <div class="spacer"></div>
        <button onclick={close}>Cancel</button>
        <button class="primary" onclick={start}>Export…</button>
      </div>
    {:else if phase === 'running'}
      <p>Exporting to <b>{outPath}</b></p>
      <div class="bar"><div class="fill" style:width="{Math.round(progress * 100)}%"></div></div>
      <div class="actions">
        <span>{Math.round(progress * 100)}%</span>
        <div class="spacer"></div>
        <button onclick={() => api.cancelExport()}>Cancel</button>
      </div>
    {:else}
      <p>Export finished:</p>
      <p><b>{outPath}</b></p>
      <div class="actions">
        <div class="spacer"></div>
        <button onclick={() => api.revealInFolder(outPath)}>Show in folder</button>
        <button class="primary" onclick={close}>Done</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.55);
    display: grid;
    place-items: center;
    z-index: 20;
  }
  .dialog {
    width: 520px;
    max-width: calc(100vw - 32px);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 20px;
    user-select: text;
  }
  h3 {
    margin: 0 0 12px;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 0;
  }
  .label {
    width: 90px;
    color: var(--muted);
  }
  .check {
    gap: 6px;
    display: flex;
    align-items: center;
  }
  .field.check {
    padding-left: 100px;
  }
  .seg {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  input[type='number'] {
    width: 90px;
  }
  .warn {
    color: var(--warn);
  }
  .muted {
    color: var(--muted);
  }
  .error {
    white-space: pre-wrap;
    max-height: 180px;
    overflow: auto;
    background: #2a1d1d;
    border: 1px solid var(--danger);
    border-radius: 6px;
    padding: 8px;
    font-size: 11px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
  }
  .spacer {
    flex: 1;
  }
  .bar {
    height: 10px;
    background: var(--panel-2);
    border-radius: 5px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }
</style>
