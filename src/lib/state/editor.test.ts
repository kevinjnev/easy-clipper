import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  probeMedia: vi.fn(async (path: string) => {
    if (path.includes('broken')) throw { message: 'Could not open this file' };
    return {
      durationUs: 10_000_000, hasVideo: true, hasAudio: true, width: 1920, height: 1080,
      fpsNum: 30, fpsDen: 1, videoCodec: 'h264', audioCodec: 'aac', formatName: 'mov,mp4',
    };
  }),
  getThumbnails: vi.fn(async () => 'C:/cache/t.jpg'),
  getWaveform: vi.fn(async () => [0.5]),
  ensureProxy: vi.fn(async () => null),
  pickProjectToOpen: vi.fn(async () => 'C:/projects/p.clipproj'),
  readText: vi.fn(async () => projectJson),
  pathExists: vi.fn(async (path: string) => path.startsWith('D:/moved/')),
  pickReplacementFile: vi.fn(async () => 'D:/moved/a.mp4'),
}));

let projectJson = '';

import { serializeProject, trackClips } from '../core/model';
import { EditorStore } from './editor.svelte';

let ed: EditorStore;

beforeEach(async () => {
  ed = new EditorStore();
  await ed.importFiles(['C:/clips/a.mp4']);
  ed.runAction('appendSelectedMedia');
});

describe('EditorStore', () => {
  it('imports and appends selected media', () => {
    expect(ed.project.media).toHaveLength(1);
    expect(ed.project.media[0].name).toBe('a.mp4');
    expect(ed.project.clips).toHaveLength(2);
  });

  it('arrow keys move the playhead one frame when no edge is selected', () => {
    ed.runAction('stepFwd');
    expect(ed.playheadUs).toBe(33_333);
    ed.runAction('stepBack');
    ed.runAction('stepBack');
    expect(ed.playheadUs).toBe(0);
  });

  it('arrow keys trim the selected edge instead of moving the playhead', () => {
    const video = trackClips(ed.project, 'video')[0];
    ed.selectClips([video.id]);
    ed.runAction('selectRightEdge');
    ed.runAction('stepBack10');
    ed.runAction('stepFwd');
    expect(trackClips(ed.project, 'video')[0].outUs).toBe(9_700_000);
    expect(ed.playheadUs).toBe(0);
  });

  it('split then undo restores the clips', () => {
    ed.playheadUs = 4_000_000;
    ed.runAction('split');
    expect(ed.project.clips).toHaveLength(4);
    ed.runAction('undo');
    expect(ed.project.clips).toHaveLength(2);
    ed.runAction('redo');
    expect(ed.project.clips).toHaveLength(4);
  });

  it('a file that cannot be opened shows an error instead of throwing', async () => {
    await ed.importFiles(['C:/clips/broken.mkv']);
    const bad = ed.project.media.find((m) => m.name === 'broken.mkv');
    expect(bad?.error).toBe('Could not open this file');
  });

  it('delete removes the selected pair and clears the selection', () => {
    ed.selectClips([trackClips(ed.project, 'video')[0].id]);
    ed.runAction('delete');
    expect(ed.project.clips).toHaveLength(0);
    expect(ed.selection.clipIds).toEqual([]);
  });

  it('a drag gesture is one undo step', () => {
    const id = trackClips(ed.project, 'video')[0].id;
    ed.beginGesture();
    ed.updateGesture((p) => ({ ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, outUs: 9_000_000 } : c)) }));
    ed.updateGesture((p) => ({ ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, outUs: 8_000_000 } : c)) }));
    ed.endGesture();
    expect(trackClips(ed.project, 'video')[0].outUs).toBe(8_000_000);
    ed.undo();
    expect(trackClips(ed.project, 'video')[0].outUs).toBe(10_000_000);
  });

  it('opening a project with moved media asks for one file and finds the rest in that folder', async () => {
    await ed.importFiles(['C:/clips/b.mp4']);
    projectJson = serializeProject(ed.project);
    const fresh = new EditorStore();
    await fresh.open();
    expect(fresh.project.media.map((m) => m.path)).toEqual(['D:/moved/a.mp4', 'D:/moved/b.mp4']);
    expect(fresh.projectPath).toBe('C:/projects/p.clipproj');
    expect(fresh.canUndo).toBe(false);
  });
});
