import { describe, expect, it } from 'vitest';
import { createProject, type MediaItem, type Project } from './core/model';
import { defaultSettings, missingMedia, offlineClipMedia, relink, relinkFromFolder, toExportProject } from './exportProject';

const media = (id: string, path: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  id, path, name: path.split(/[\\/]/).pop()!, durationUs: 5_000_000, hasVideo: true, hasAudio: true,
  width: 1280, height: 720, fps: { num: 30000, den: 1001 }, videoCodec: 'h264', audioCodec: 'aac',
  formatName: 'mov,mp4', ...extra,
});

const p: Project = {
  ...createProject(),
  fps: { num: 30000, den: 1001 },
  width: 1280,
  height: 720,
  media: [media('a', 'C:\\old\\a.mp4'), media('b', 'C:\\old\\b.mp4'), media('x', 'C:\\bad.mkv', { error: 'nope' })],
  clips: [
    { id: 'c1', mediaId: 'a', track: 'video', startUs: 0, inUs: 1, outUs: 2, linkId: 'L' },
    { id: 'c2', mediaId: 'a', track: 'audio', startUs: 0, inUs: 1, outUs: 2, linkId: 'L' },
  ],
};

describe('toExportProject', () => {
  it('flattens the project for the backend', () => {
    const e = toExportProject(p);
    expect(e).toMatchObject({ fpsNum: 30000, fpsDen: 1001, width: 1280, height: 720 });
    expect(e.clips).toEqual([
      { mediaId: 'a', track: 'video', startUs: 0, inUs: 1, outUs: 2 },
      { mediaId: 'a', track: 'audio', startUs: 0, inUs: 1, outUs: 2 },
    ]);
    expect(e.media.map((m) => m.id)).toEqual(['a', 'b']);
    expect(e.media[0]).toEqual({
      id: 'a', path: 'C:\\old\\a.mp4', hasVideo: true, hasAudio: true, width: 1280, height: 720,
      durationUs: 5_000_000, videoCodec: 'h264', audioCodec: 'aac', formatName: 'mov,mp4',
    });
  });
});

describe('defaultSettings', () => {
  it('uses 480 px wide 15 fps GIFs', () => {
    expect(defaultSettings('gif', [])).toMatchObject({ format: 'gif', width: 480, gifFps: 15, encoder: 'libx264' });
  });

  it('keeps source size for MP4 and prefers a GPU encoder', () => {
    expect(defaultSettings('mp4', ['h264_amf'])).toMatchObject({ width: null, fps: null, quality: 'medium', encoder: 'h264_amf' });
  });
});

describe('missing media', () => {
  it('lists media whose files are gone, ignoring items that never opened', () => {
    const missing = missingMedia(p, (path) => path === 'C:\\old\\b.mp4');
    expect(missing.map((m) => m.id)).toEqual(['a']);
  });

  it('relinks one item', () => {
    const r = relink(p, 'a', 'D:\\new\\a2.mp4');
    expect(r.media[0]).toMatchObject({ path: 'D:\\new\\a2.mp4', name: 'a2.mp4' });
    expect(r.media[1].path).toBe('C:\\old\\b.mp4');
  });

  it('finds other missing files in the folder the user picked', () => {
    const r = relinkFromFolder(p, ['a', 'b'], 'D:\\new', (path) => path === 'D:\\new\\b.mp4');
    expect(r.media.find((m) => m.id === 'b')?.path).toBe('D:\\new\\b.mp4');
    expect(r.media.find((m) => m.id === 'a')?.path).toBe('C:\\old\\a.mp4');
  });
});

describe('offlineClipMedia', () => {
  it('names media used on the timeline that cannot be read', () => {
    const q = { ...p, clips: [...p.clips, { id: 'c3', mediaId: 'x', track: 'video' as const, startUs: 5, inUs: 0, outUs: 1 }] };
    expect(offlineClipMedia(q)).toEqual(['bad.mkv']);
    expect(offlineClipMedia(p)).toEqual([]);
  });
});
