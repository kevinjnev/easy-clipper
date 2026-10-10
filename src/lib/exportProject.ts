import type { ExportFormat, ExportProject, ExportSettings } from './api';
import type { MediaItem, Project } from './core/model';

const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** The flattened timeline the Rust exporter expects. */
export function toExportProject(p: Project): ExportProject {
  return {
    fpsNum: p.fps.num,
    fpsDen: p.fps.den,
    width: p.width,
    height: p.height,
    media: p.media
      .filter((m) => !m.error)
      .map((m) => ({
        id: m.id, path: m.path, hasVideo: m.hasVideo, hasAudio: m.hasAudio, width: m.width, height: m.height,
        durationUs: Math.round(m.durationUs), videoCodec: m.videoCodec, audioCodec: m.audioCodec, formatName: m.formatName,
      })),
    // The exporter takes whole microseconds; older saved projects may hold fractional ones.
    clips: p.clips.map((c) => ({
      mediaId: c.mediaId, track: c.track, startUs: Math.round(c.startUs), inUs: Math.round(c.inUs), outUs: Math.round(c.outUs),
    })),
  };
}

export function defaultSettings(format: ExportFormat, encoders: string[]): ExportSettings {
  return {
    format,
    width: format === 'gif' ? 480 : null,
    allowUpscale: false,
    quality: 'medium',
    fps: null,
    gifFps: 15,
    encoder: encoders[0] ?? 'libx264',
    outPath: '',
  };
}

/** Media whose source file no longer exists (items that failed to open are ignored). */
export function missingMedia(p: Project, exists: (path: string) => boolean): MediaItem[] {
  return p.media.filter((m) => !m.error && !exists(m.path));
}

export function relink(p: Project, mediaId: string, newPath: string): Project {
  return {
    ...p,
    media: p.media.map((m) => (m.id === mediaId ? { ...m, path: newPath, name: basename(newPath) } : m)),
  };
}

/** Relinks each listed media item whose file name exists in `folder`. */
export function relinkFromFolder(p: Project, mediaIds: string[], folder: string, exists: (path: string) => boolean): Project {
  const sep = folder.includes('/') && !folder.includes('\\') ? '/' : '\\';
  let out = p;
  for (const m of p.media) {
    if (!mediaIds.includes(m.id)) continue;
    const candidate = `${folder.replace(/[\\/]+$/, '')}${sep}${basename(m.path)}`;
    if (exists(candidate)) out = relink(out, m.id, candidate);
  }
  return out;
}

/** Names of media used by timeline clips that can't be read (missing or failed to open). */
export function offlineClipMedia(p: Project): string[] {
  const used = new Set(p.clips.map((c) => c.mediaId));
  return p.media.filter((m) => m.error && used.has(m.id)).map((m) => m.name);
}
