import * as api from '../api';
import { addMedia, appendMedia, deleteClips, splitAt, toggleLink, trimEdge } from '../core/edit';
import { History } from '../core/history';
import { missingMedia, relink, relinkFromFolder } from '../exportProject';
import { clipEnd, createProject, parseProject, selectionBounds, serializeProject, timelineEndUs, type MediaItem, type Project } from '../core/model';
import { frameDurationUs, stepFrames } from '../core/time';
import type { Action } from '../shortcuts';

export interface Selection {
  clipIds: string[];
  edge: { clipId: string; side: 'left' | 'right' } | null;
  mediaId: string | null;
}

const SHORTCUTS_KEY = 'easyclipper.showShortcuts';

/** Per-user UI preferences; storage can be unavailable, so failures fall back to defaults. */
function readSetting(key: string, fallback: string): string {
  try {
    return globalThis.localStorage?.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Not remembered; harmless.
  }
}

const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;

function toMediaItem(id: string, path: string, info: api.MediaInfo): MediaItem {
  return {
    id, path, name: basename(path), durationUs: info.durationUs,
    hasVideo: info.hasVideo, hasAudio: info.hasAudio, width: info.width, height: info.height,
    fps: { num: info.fpsNum, den: info.fpsDen },
    videoCodec: info.videoCodec, audioCodec: info.audioCodec, formatName: info.formatName,
  };
}

function errorItem(id: string, path: string, error: string): MediaItem {
  return {
    id, path, name: basename(path), durationUs: 0, hasVideo: false, hasAudio: false, width: 0, height: 0,
    fps: { num: 30, den: 1 }, videoCodec: null, audioCodec: null, formatName: '', error,
  };
}

export class EditorStore {
  project = $state.raw<Project>(createProject());
  selection = $state<Selection>({ clipIds: [], edge: null, mediaId: null });
  playheadUs = $state(0);
  playing = $state(false);
  pxPerSec = $state(80);
  /** Time at the left edge of the timeline. */
  scrollUs = $state(0);
  private _showShortcuts = $state(readSetting(SHORTCUTS_KEY, 'true') === 'true');
  get showShortcuts() {
    return this._showShortcuts;
  }
  set showShortcuts(v: boolean) {
    this._showShortcuts = v;
    writeSetting(SHORTCUTS_KEY, String(v));
  }
  exportOpen = $state(false);
  projectPath = $state<string | null>(null);
  dirty = $state(false);
  canUndo = $state(false);
  canRedo = $state(false);
  /** Per media id: thumbnail sprite path, waveform peaks, preview-copy path, and whether a preview copy is being made. */
  thumbs = $state<Record<string, string>>({});
  waves = $state.raw<Record<string, number[]>>({});
  proxies = $state<Record<string, string>>({});
  preparing = $state<Record<string, boolean>>({});
  notice = $state<string | null>(null);
  /** A media item being dragged from the bin (pointer-based: Tauri's file drop disables HTML5 drag and drop). */
  mediaDrag = $state<{ mediaId: string; x: number; y: number } | null>(null);

  private history = new History<Project>(this.project);
  private gestureBase: Project | null = null;

  private set(next: Project, record: boolean) {
    if (next === this.project) return;
    if (record) this.history.push(next);
    this.project = next;
    this.dirty = true;
    this.syncHistoryFlags();
    this.pruneSelection();
  }

  private syncHistoryFlags() {
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
  }

  private pruneSelection() {
    const ids = new Set(this.project.clips.map((c) => c.id));
    this.selection.clipIds = this.selection.clipIds.filter((id) => ids.has(id));
    if (this.selection.edge && !ids.has(this.selection.edge.clipId)) this.selection.edge = null;
  }

  /** Applies an edit as one undo step. */
  apply(fn: (p: Project) => Project) {
    this.set(fn(this.project), true);
  }

  undo() {
    this.project = this.history.undo();
    this.dirty = true;
    this.syncHistoryFlags();
    this.pruneSelection();
  }

  redo() {
    this.project = this.history.redo();
    this.dirty = true;
    this.syncHistoryFlags();
    this.pruneSelection();
  }

  /** Live edits during a drag: each update starts from the state at the start of the drag. */
  beginGesture() {
    this.gestureBase = this.project;
  }

  updateGesture(fn: (p: Project) => Project) {
    if (this.gestureBase) this.set(fn(this.gestureBase), false);
  }

  endGesture() {
    if (this.gestureBase && this.project !== this.gestureBase) this.history.push(this.project);
    this.gestureBase = null;
    this.syncHistoryFlags();
  }

  selectClips(ids: string[], edge: Selection['edge'] = null) {
    this.selection.clipIds = ids;
    this.selection.edge = edge;
  }

  selectMedia(id: string | null) {
    this.selection.mediaId = id;
  }

  setPlayhead(us: number) {
    this.playheadUs = Math.max(0, Math.min(us, timelineEndUs(this.project)));
  }

  async importFiles(paths: string[]) {
    for (const path of paths) {
      const id = crypto.randomUUID();
      let item: MediaItem;
      try {
        item = toMediaItem(id, path, await api.probeMedia(path));
      } catch (e) {
        item = errorItem(id, path, api.errorMessage(e));
      }
      this.apply((p) => addMedia(p, item));
      this.selection.mediaId = id;
      if (!item.error) void this.loadMediaExtras(item);
    }
  }

  /** Thumbnails, waveform and (if needed) a preview copy, in the background. */
  async loadMediaExtras(m: MediaItem) {
    const jobs: Promise<unknown>[] = [];
    if (m.hasVideo) {
      jobs.push(api.getThumbnails(m.path, m.durationUs).then((t) => (this.thumbs[m.id] = t)));
    }
    if (m.hasAudio) {
      jobs.push(api.getWaveform(m.path).then((w) => (this.waves = { ...this.waves, [m.id]: w })));
    }
    this.preparing[m.id] = true;
    jobs.push(
      api.ensureProxy(m.path).then((proxy) => {
        if (proxy) this.proxies[m.id] = proxy;
      }).finally(() => (this.preparing[m.id] = false)),
    );
    const results = await Promise.allSettled(jobs);
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) this.notice = `${m.name}: ${api.errorMessage((failed as PromiseRejectedResult).reason)}`;
  }

  private stepOrTrim(frames: number) {
    const edge = this.selection.edge;
    if (edge) {
      this.apply((p) => trimEdge(p, edge.clipId, edge.side, frames * frameDurationUs(p.fps)));
      return;
    }
    this.setPlayhead(stepFrames(this.playheadUs, frames, this.project.fps));
  }

  private selectEdge(side: 'left' | 'right') {
    let id = this.selection.clipIds[0];
    if (!id) {
      const under = this.project.clips
        .filter((c) => c.startUs <= this.playheadUs && this.playheadUs < clipEnd(c))
        .sort((a, b) => (a.track === 'video' ? -1 : 1) - (b.track === 'video' ? -1 : 1));
      id = under[0]?.id;
    }
    if (id) this.selectClips([id], { clipId: id, side });
  }

  runAction(a: Action) {
    const ids = this.selection.clipIds;
    switch (a) {
      case 'playPause': this.playing = !this.playing; break;
      case 'split': this.apply((p) => splitAt(p, this.playheadUs, ids.length ? ids : null)); break;
      case 'delete':
        if (ids.length) {
          this.apply((p) => deleteClips(p, ids));
          this.selectClips([]);
        }
        break;
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      case 'stepBack': this.stepOrTrim(-1); break;
      case 'stepFwd': this.stepOrTrim(1); break;
      case 'stepBack10': this.stepOrTrim(-10); break;
      case 'stepFwd10': this.stepOrTrim(10); break;
      case 'selectLeftEdge': this.selectEdge('left'); break;
      case 'selectRightEdge': this.selectEdge('right'); break;
      case 'home': this.setPlayhead(selectionBounds(this.project, ids)?.startUs ?? 0); break;
      case 'end': {
        // With a selection, land on its last frame so the preview shows it (not what follows).
        const bounds = selectionBounds(this.project, ids);
        this.setPlayhead(bounds ? stepFrames(bounds.endUs, -1, this.project.fps) : timelineEndUs(this.project));
        break;
      }
      case 'save': void this.save(); break;
      case 'open': void this.open(); break;
      case 'export': if (this.project.clips.length) this.exportOpen = true; break;
      case 'toggleShortcuts': this.showShortcuts = !this.showShortcuts; break;
      case 'toggleLink': this.apply((p) => toggleLink(p, ids)); break;
      case 'appendSelectedMedia': {
        const mediaId = this.selection.mediaId;
        if (mediaId) this.apply((p) => appendMedia(p, mediaId));
        break;
      }
    }
  }

  async save() {
    if (!this.projectPath) return this.saveAs();
    await api.writeText(this.projectPath, serializeProject(this.project));
    this.dirty = false;
  }

  async saveAs() {
    const path = await api.pickProjectSavePath();
    if (!path) return;
    this.projectPath = path;
    await this.save();
  }

  /** Replaces the open project (used by open and by relinking missing media). */
  load(p: Project, path: string | null) {
    this.history.reset(p);
    this.project = p;
    this.projectPath = path;
    this.dirty = false;
    this.playheadUs = 0;
    this.selectClips([]);
    this.selection.mediaId = null;
    this.syncHistoryFlags();
    for (const m of p.media) if (!m.error) void this.loadMediaExtras(m);
  }

  /** True when it's fine to throw away the current project (nothing unsaved, or the user agreed). */
  async confirmDiscard(): Promise<boolean> {
    if (!this.dirty) return true;
    return api.askDiscardChanges();
  }

  async open() {
    if (!(await this.confirmDiscard())) return;
    const path = await api.pickProjectToOpen();
    if (!path) return;
    try {
      const p = await this.relinkMissing(parseProject(await api.readText(path)));
      this.load(p, path);
    } catch (e) {
      this.notice = `Could not open project: ${api.errorMessage(e)}`;
    }
  }

  /**
   * Asks the user to locate each media file that has moved. After each pick, other missing
   * files with the same name in that folder are relinked automatically.
   */
  private async relinkMissing(p: Project): Promise<Project> {
    const exists = new Map<string, boolean>();
    const check = async (paths: string[]) => {
      await Promise.all(paths.filter((x) => !exists.has(x)).map(async (x) => exists.set(x, await api.pathExists(x))));
      return (x: string) => exists.get(x) ?? false;
    };

    let missing = missingMedia(p, await check(p.media.map((m) => m.path)));
    const skipped: string[] = [];
    while (missing.length) {
      const m = missing[0];
      const picked = await api.pickReplacementFile(m.name);
      if (!picked) {
        skipped.push(m.name);
        p = { ...p, media: p.media.map((x) => (x.id === m.id ? { ...x, error: `File not found: ${x.path}` } : x)) };
      } else {
        p = relink(p, m.id, picked);
        exists.set(picked, true);
        const folder = picked.replace(/[\\/][^\\/]*$/, '');
        const others = missing.slice(1);
        const sep = picked.includes('\\') ? '\\' : '/';
        const candidates = others.map((o) => `${folder}${sep}${o.name}`);
        p = relinkFromFolder(p, others.map((o) => o.id), folder, await check(candidates));
      }
      missing = missingMedia(p, await check(p.media.map((x) => x.path)));
    }
    if (skipped.length) this.notice = `Missing media: ${skipped.join(', ')}. Clips using it can't be previewed or exported.`;
    return p;
  }
}

export const editor = new EditorStore();
