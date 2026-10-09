import { describe, expect, it } from 'vitest';
import { addMedia, appendMedia, deleteClips, insertMedia, moveClip, splitAt, toggleLink, trimEdge } from './edit';
import { createProject, parseProject, serializeProject, trackClips, type MediaItem, type Project } from './model';

const FPS = { num: 30, den: 1 };
const F = 33_333; // one frame at 30 fps, rounded

function media(id: string, durS: number, opts: { audio?: boolean; video?: boolean } = {}): MediaItem {
  const hasVideo = opts.video ?? true;
  const hasAudio = opts.audio ?? true;
  return {
    id, path: `C:/clips/${id}.mp4`, name: `${id}.mp4`, durationUs: durS * 1_000_000,
    hasVideo, hasAudio, width: hasVideo ? 1920 : 0, height: hasVideo ? 1080 : 0, fps: FPS,
    videoCodec: hasVideo ? 'h264' : null, audioCodec: hasAudio ? 'aac' : null, formatName: 'mov,mp4',
  };
}

function withMedia(...items: MediaItem[]): Project {
  return items.reduce((p, m) => addMedia(p, m), createProject());
}

const v = (p: Project) => trackClips(p, 'video');
const a = (p: Project) => trackClips(p, 'audio');

function twoPairs(): Project {
  let p = withMedia(media('A', 10), media('B', 10));
  p = appendMedia(p, 'A');
  return appendMedia(p, 'B');
}

describe('appendMedia', () => {
  it('appends linked video and audio clips end to end', () => {
    const p = twoPairs();
    expect(p.clips).toHaveLength(4);
    expect(v(p).map((c) => c.startUs)).toEqual([0, 10_000_000]);
    expect(a(p).map((c) => c.startUs)).toEqual([0, 10_000_000]);
    expect(v(p)[0].linkId).toBeDefined();
    expect(v(p)[0].linkId).toBe(a(p)[0].linkId);
    expect(v(p)[1].linkId).toBe(a(p)[1].linkId);
    expect(v(p)[0].linkId).not.toBe(v(p)[1].linkId);
  });

  it('adds only an audio clip for audio-only media', () => {
    const p = appendMedia(withMedia(media('M', 5, { video: false })), 'M');
    expect(v(p)).toHaveLength(0);
    expect(a(p)).toHaveLength(1);
    expect(a(p)[0].linkId).toBeUndefined();
  });

  it('adds only a video clip for silent video', () => {
    const p = appendMedia(withMedia(media('S', 5, { audio: false })), 'S');
    expect(v(p)).toHaveLength(1);
    expect(a(p)).toHaveLength(0);
  });

  it('first video media sets project fps and size', () => {
    const m = { ...media('A', 1), fps: { num: 60, den: 1 }, width: 1280, height: 720 };
    const p = withMedia(m);
    expect(p.fps).toEqual({ num: 60, den: 1 });
    expect([p.width, p.height]).toEqual([1280, 720]);
  });
});

describe('trimEdge', () => {
  it('right edge -1 frame with ripple trims partner and pulls later clips', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[0].id, 'right', -F, true);
    expect(v(p)[0].outUs).toBe(9_966_667);
    expect(a(p)[0].outUs).toBe(9_966_667);
    expect(v(p)[1].startUs).toBe(9_966_667);
    expect(a(p)[1].startUs).toBe(9_966_667);
  });

  it('left edge +30 frames without ripple moves the clip start', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[0].id, 'left', 1_000_000, false);
    expect(v(p)[0]).toMatchObject({ startUs: 1_000_000, inUs: 1_000_000, outUs: 10_000_000 });
    expect(a(p)[0]).toMatchObject({ startUs: 1_000_000, inUs: 1_000_000 });
    expect(v(p)[1].startUs).toBe(10_000_000);
  });

  it('left edge with ripple keeps the start and pulls later clips', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[0].id, 'left', 1_000_000, true);
    expect(v(p)[0]).toMatchObject({ startUs: 0, inUs: 1_000_000 });
    expect(v(p)[1].startUs).toBe(9_000_000);
  });

  it('cannot extend past the end of the source', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[0].id, 'right', 5_000_000, true);
    expect(v(p)[0].outUs).toBe(10_000_000);
    expect(v(p)[1].startUs).toBe(10_000_000);
  });

  it('cannot extend before the start of the source', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[0].id, 'left', -F, false);
    expect(v(p)[0]).toMatchObject({ startUs: 0, inUs: 0 });
  });

  it('stops at one frame when shrinking', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[0].id, 'right', -20_000_000, true);
    expect(v(p)[0].outUs - v(p)[0].inUs).toBe(F);
  });

  it('without ripple cannot overlap the next clip', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[0].id, 'right', -1_000_000, false);
    p = trimEdge(p, v(p)[0].id, 'right', 3_000_000, false);
    expect(v(p)[0].outUs).toBe(10_000_000);
    expect(v(p)[1].startUs).toBe(10_000_000);
  });

  it('without ripple a left extend cannot overlap the previous clip', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[1].id, 'left', 2_000_000, false); // B now starts at 12 s, in 2 s
    p = trimEdge(p, v(p)[1].id, 'left', -5_000_000, false);
    expect(v(p)[1]).toMatchObject({ startUs: 10_000_000, inUs: 0 });
  });
});

describe('splitAt', () => {
  it('splits a linked pair at the playhead into two linked pairs', () => {
    let p = appendMedia(withMedia(media('A', 10)), 'A');
    const origLink = v(p)[0].linkId;
    p = splitAt(p, 4_000_000, null);
    expect(p.clips).toHaveLength(4);
    const [vl, vr] = v(p);
    const [al, ar] = a(p);
    expect(vl).toMatchObject({ startUs: 0, inUs: 0, outUs: 4_000_000, linkId: origLink });
    expect(al).toMatchObject({ outUs: 4_000_000, linkId: origLink });
    expect(vr).toMatchObject({ startUs: 4_000_000, inUs: 4_000_000, outUs: 10_000_000 });
    expect(ar).toMatchObject({ startUs: 4_000_000, inUs: 4_000_000 });
    expect(vr.linkId).toBeDefined();
    expect(vr.linkId).toBe(ar.linkId);
    expect(vr.linkId).not.toBe(origLink);
  });

  it('splitting exactly on a clip edge does nothing', () => {
    const p = twoPairs();
    expect(splitAt(p, 10_000_000, null).clips).toHaveLength(4);
  });

  it('only splits the given clips and their partners', () => {
    let p = twoPairs();
    p = splitAt(p, 15_000_000, [v(p)[0].id]);
    expect(p.clips).toHaveLength(4);
    p = splitAt(p, 15_000_000, [v(p)[1].id]);
    expect(p.clips).toHaveLength(6);
  });
});

describe('deleteClips', () => {
  it('ripple delete closes the gap', () => {
    let p = twoPairs();
    p = deleteClips(p, [v(p)[0].id], true);
    expect(p.clips).toHaveLength(2);
    expect(v(p)[0].startUs).toBe(0);
    expect(a(p)[0].startUs).toBe(0);
  });

  it('keeps the gap when an unlinked clip still covers it', () => {
    let p = twoPairs();
    p = toggleLink(p, [v(p)[0].id, a(p)[0].id]);
    p = deleteClips(p, [v(p)[0].id], true);
    expect(v(p)).toHaveLength(1);
    expect(v(p)[0].startUs).toBe(10_000_000);
    expect(a(p)[0].startUs).toBe(0);
  });

  it('without ripple leaves a gap', () => {
    let p = twoPairs();
    p = deleteClips(p, [v(p)[0].id], false);
    expect(v(p)[0].startUs).toBe(10_000_000);
  });
});

describe('insertMedia', () => {
  it('snaps to the nearest boundary and pushes later clips', () => {
    let p = addMedia(twoPairs(), media('C', 5));
    p = insertMedia(p, 'C', 6_000_000);
    expect(v(p).map((c) => [c.mediaId, c.startUs])).toEqual([['A', 0], ['C', 10_000_000], ['B', 15_000_000]]);
    expect(a(p).map((c) => c.startUs)).toEqual([0, 10_000_000, 15_000_000]);
  });
});

describe('moveClip', () => {
  it('moves the second pair to the start', () => {
    let p = twoPairs();
    p = moveClip(p, v(p)[1].id, 0);
    expect(v(p).map((c) => [c.mediaId, c.startUs])).toEqual([['B', 0], ['A', 10_000_000]]);
    expect(a(p).map((c) => [c.mediaId, c.startUs])).toEqual([['B', 0], ['A', 10_000_000]]);
    expect(v(p)[0].linkId).toBe(a(p)[0].linkId);
  });
});

describe('toggleLink', () => {
  it('unlinks then relinks a pair', () => {
    let p = appendMedia(withMedia(media('A', 10)), 'A');
    const ids = p.clips.map((c) => c.id);
    p = toggleLink(p, ids);
    expect(p.clips.every((c) => c.linkId === undefined)).toBe(true);
    p = toggleLink(p, ids);
    expect(v(p)[0].linkId).toBeDefined();
    expect(v(p)[0].linkId).toBe(a(p)[0].linkId);
  });
});

describe('project files', () => {
  it('round-trips through JSON', () => {
    const p = twoPairs();
    expect(parseProject(serializeProject(p))).toEqual(p);
  });

  it('rejects other versions', () => {
    const json = JSON.stringify({ ...twoPairs(), version: 2 });
    expect(() => parseProject(json)).toThrow('Unsupported project file');
  });
});
