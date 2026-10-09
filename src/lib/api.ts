/** Typed wrappers around the Rust commands and native dialogs. */
import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';

export interface MediaInfo {
  durationUs: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
  videoCodec: string | null;
  audioCodec: string | null;
  formatName: string;
}

export interface ExportMedia {
  id: string;
  path: string;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
  durationUs: number;
  videoCodec: string | null;
  audioCodec: string | null;
  formatName: string;
}

export interface ExportClip {
  mediaId: string;
  track: 'video' | 'audio';
  startUs: number;
  inUs: number;
  outUs: number;
}

export interface ExportProject {
  fpsNum: number;
  fpsDen: number;
  width: number;
  height: number;
  media: ExportMedia[];
  clips: ExportClip[];
}

export type ExportFormat = 'mp4' | 'gif' | 'mp3' | 'wav';

export interface ExportSettings {
  format: ExportFormat;
  width: number | null;
  allowUpscale: boolean;
  quality: 'high' | 'medium' | 'small';
  fps: number | null;
  gifFps: number;
  encoder: string;
  outPath: string;
}

/** Rust errors arrive as `{ message }`. */
export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export const probeMedia = (path: string) => invoke<MediaInfo>('probe_media', { path });
export const ffmpegStatus = () => invoke<string>('ffmpeg_status');
export const getThumbnails = (path: string, durationUs: number) => invoke<string>('get_thumbnails', { path, durationUs });
export const getWaveform = (path: string) => invoke<number[]>('get_waveform', { path });
export const ensureProxy = (path: string) => invoke<string | null>('ensure_proxy', { path });
export const listEncoders = () => invoke<string[]>('list_encoders');
export const startExport = (project: ExportProject, settings: ExportSettings) =>
  invoke<void>('start_export', { project, settings });
export const cancelExport = () => invoke<void>('cancel_export');
export const readText = (path: string) => invoke<string>('read_text', { path });
export const writeText = (path: string, text: string) => invoke<void>('write_text', { path, text });
export const pathExists = (path: string) => invoke<boolean>('path_exists', { path });
export const revealInFolder = (path: string) => revealItemInDir(path);
export const onExportProgress = (cb: (fraction: number) => void): Promise<UnlistenFn> =>
  listen<{ fraction: number }>('export-progress', (e) => cb(e.payload.fraction));

/** URL the webview can load a local file from. */
export const fileUrl = (path: string) => (isTauri() ? convertFileSrc(path) : path);

const MEDIA_EXTS = ['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'ts', 'mts', 'm2ts',
  'mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wma'];

export async function pickMediaFiles(): Promise<string[]> {
  const res = await open({ multiple: true, filters: [{ name: 'Media', extensions: MEDIA_EXTS }] });
  return res ? (Array.isArray(res) ? res : [res]) : [];
}

export async function pickProjectToOpen(): Promise<string | null> {
  const res = await open({ multiple: false, filters: [{ name: 'Easy Clipper project', extensions: ['clipproj'] }] });
  return typeof res === 'string' ? res : null;
}

export async function pickProjectSavePath(): Promise<string | null> {
  return save({ filters: [{ name: 'Easy Clipper project', extensions: ['clipproj'] }], defaultPath: 'Untitled.clipproj' });
}

export async function pickExportPath(ext: string): Promise<string | null> {
  return save({ filters: [{ name: ext.toUpperCase(), extensions: [ext] }], defaultPath: `export.${ext}` });
}

export async function pickReplacementFile(name: string): Promise<string | null> {
  const res = await open({ multiple: false, title: `Locate ${name}`, filters: [{ name: 'Media', extensions: MEDIA_EXTS }] });
  return typeof res === 'string' ? res : null;
}
