/**
 * Development only: lets the UI run in a normal browser (no Tauri) by faking the Rust commands
 * with the sample files from `node scripts/dev-media.mjs`. Never included in release builds.
 */
import { emit } from '@tauri-apps/api/event';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import type { MediaInfo } from './api';

const files: Record<string, string> = {};
let exportTimer: ReturnType<typeof setInterval> | null = null;

export async function install() {
  const manifest: Record<string, MediaInfo> = await fetch('/dev-media/manifest.json')
    .then((r) => r.json())
    .catch(() => ({}));
  mockWindows('main');
  mockIPC(
    async (cmd, args) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const path = a.path as string;
      switch (cmd) {
        case 'ffmpeg_status': return 'ffmpeg (dev harness)';
        case 'probe_media':
          if (!manifest[path]) throw { message: `Could not open this file: ${path}` };
          return manifest[path];
        case 'get_thumbnails': return `${path}-thumbs.jpg`;
        case 'get_waveform': return fetch(`${path}-wave.json`).then((r) => r.json());
        case 'ensure_proxy': return null;
        case 'list_encoders': return ['h264_amf'];
        case 'path_exists': return path in manifest || path in files;
        case 'read_text': return files[path];
        case 'write_text': files[path] = a.text as string; return null;
        case 'cancel_export':
          if (exportTimer) clearInterval(exportTimer);
          exportTimer = null;
          return null;
        case 'start_export':
          console.log('[dev harness] export', JSON.stringify(args));
          return new Promise((resolve, reject) => {
            let f = 0;
            exportTimer = setInterval(() => {
              f = Math.min(1, f + 0.1);
              void emit('export-progress', { fraction: f });
              if (f >= 1) {
                clearInterval(exportTimer!);
                exportTimer = null;
                resolve(null);
              }
            }, 150);
            (window as unknown as { __rejectExport?: () => void }).__rejectExport = () => reject({ message: 'Export cancelled' });
          });
        case 'plugin:dialog|open': {
          const opts = (a.options ?? {}) as { filters?: { extensions: string[] }[] };
          if (opts.filters?.[0]?.extensions.includes('clipproj')) return Object.keys(files)[0] ?? null;
          return Object.keys(manifest);
        }
        case 'plugin:dialog|save': return '/dev-media/out/' + (((a.options as { defaultPath?: string })?.defaultPath) ?? 'export');
        case 'plugin:opener|reveal_item_in_dir': return null;
        default:
          if (cmd.startsWith('plugin:event|')) return null;
          console.warn('[dev harness] unhandled', cmd, args);
          return null;
      }
    },
    { shouldMockEvents: true },
  );
}
