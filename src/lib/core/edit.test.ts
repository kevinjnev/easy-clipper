import { describe, expect, it } from 'vitest';
import { addMedia, appendMedia, deleteClips, dropMedia, moveClip, placeGroup, splitAt, toggleLink, trimEdge } from './edit';
import { createProject, parseProject, serializeProject, trackClips, type MediaItem, type Project } from './model';

const FPS = { num: 30, den: 1 };
const F = 33_333; // one frame at 30 fps, rounded
const S = 1_000_000;

function media(id: string, durS: number, opts: { audio?: boolean; video?: boolean } = {}): MediaItem {
  const hasVideo = opts.video ?? true;
  const hasAudio = opts.audio ?? true;
  return {
    id, path: `C:/clips/${id}.mp4`, name: `${id}.mp4`, durationUs: durS * S,
    hasVideo, hasAudio, width: hasVideo ? 1920 : 0, height: hasVideo ? 1080 : 0, fps: FPS,
    videoCodec: hasVideo ? 'h264' : null, audioCodec: hasAudio ? 'aac' : null, formatName: 'mov,mp4',
  };
}

function withMedia(...items: MediaItem[]): Project {
  return items.reduce((p, m) => addMedia(p, m), createProject());
}

const v = (p: Project) => trackClips(p, 'video');
const a = (p: Project) => trackClips(p, 'audio');
/** "name@start-end" per clip on a track, in seconds. */
const layout = (clips: { mediaId: string; startUs: number; inUs: number; outUs: number }[]) =>
  clips.map((c) => `${c.mediaId}@${c.startUs / S}-${(c.startUs + c.outUs - c.inUs) / S}`);

function twoPairs(): Project {
  let p = withMedia(media('A', 10), media('B', 10));
  p = appendMedia(p, 'A');
  return appendMedia(p, 'B');
}

function threePairs(): Project {
  return appendMedia(addMedia(twoPairs(), media('C', 5)), 'C');
}

describe('appendMedia', () => {
  it('appends linked video and audio clips end to end', () => {
    const p = twoPairs();
    expect(p.clips).toHaveLength(4);
    expect(layout(v(p))).toEqual(['A@0-10', 'B@10-20']);
    expect(layout(a(p))).toEqual(['A@0-10', 'B@10-20']);
    expect(v(p)[0].linkId).toBeDefined();
    expect(v(p)[0].linkId).toBe(a(p)[0].linkId);
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
  it('trims the linked partner too and leaves later clips where they are', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[0].id, 'right', -F);
    expect(v(p)[0].outUs).toBe(9_966_667);
    expect(a(p)[0].outUs).toBe(9_966_667);
    expect(v(p)[1].startUs).toBe(10 * S);
    expect(a(p)[1].startUs).toBe(10 * S);
  });

  it('moving the left edge moves the clip start with it', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[0].id, 'left', S);
    expect(v(p)[0]).toMatchObject({ startUs: S, inUs: S, outUs: 10 * S });
    expect(a(p)[0]).toMatchObject({ startUs: S, inUs: S });
  });

  it('cannot extend past the end of the source', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[1].id, 'right', 5 * S);
    expect(v(p)[1].outUs).toBe(10 * S);
  });

  it('cannot extend before the start of the source', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[0].id, 'left', -F);
    expect(v(p)[0]).toMatchObject({ startUs: 0, inUs: 0 });
  });

  it('stops at one frame when shrinking', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[0].id, 'right', -20 * S);
    expect(v(p)[0].outUs - v(p)[0].inUs).toBe(F);
  });

  it('stops at the next clip', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[0].id, 'right', -S);
    p = trimEdge(p, v(p)[0].id, 'right', 3 * S);
    expect(v(p)[0].outUs).toBe(10 * S);
    expect(v(p)[1].startUs).toBe(10 * S);
  });

  it('stops at the previous clip', () => {
    let p = twoPairs();
    p = trimEdge(p, v(p)[1].id, 'left', 2 * S); // B now starts at 12 s, in 2 s
    p = trimEdge(p, v(p)[1].id, 'left', -5 * S);
    expect(v(p)[1]).toMatchObject({ startUs: 10 * S, inUs: 0 });
  });
});

describe('splitAt', () => {
  it('splits a linked pair at the playhead into two linked pairs', () => {
    let p = appendMedia(withMedia(media('A', 10)), 'A');
    const origLink = v(p)[0].linkId;
    p = splitAt(p, 4 * S, null);
    expect(p.clips).toHaveLength(4);
    const [vl, vr] = v(p);
    const [al, ar] = a(p);
    expect(vl).toMatchObject({ startUs: 0, inUs: 0, outUs: 4 * S, linkId: origLink });
    expect(al).toMatchObject({ outUs: 4 * S, linkId: origLink });
    expect(vr).toMatchObject({ startUs: 4 * S, inUs: 4 * S, outUs: 10 * S });
    expect(ar).toMatchObject({ startUs: 4 * S, inUs: 4 * S });
    expect(vr.linkId).toBeDefined();
    expect(vr.linkId).toBe(ar.linkId);
    expect(vr.linkId).not.toBe(origLink);
  });

  it('splitting exactly on a clip edge does nothing', () => {
    expect(splitAt(twoPairs(), 10 * S, null).clips).toHaveLength(4);
  });

  it('only splits the given clips and their partners', () => {
    let p = twoPairs();
    p = splitAt(p, 15 * S, [v(p)[0].id]);
    expect(p.clips).toHaveLength(4);
    p = splitAt(p, 15 * S, [v(p)[1].id]);
    expect(p.clips).toHaveLength(6);
  });

  it('when only one clip of a linked pair is under the playhead, the new half is unlinked', () => {
    let p = twoPairs();
    const ids = [v(p)[0].id, a(p)[0].id];
    p = toggleLink(p, ids);
    p = moveClip(p, a(p)[0].id, 30 * S);
    p = toggleLink(p, ids); // linked again, audio at 30-40 s
    p = splitAt(p, 5 * S, null);
    const [vl, vr] = v(p);
    expect(vl.linkId).toBeDefined();
    expect(vl.linkId).toBe(a(p).find((c) => c.mediaId === 'A')?.linkId);
    expect(vr.linkId).toBeUndefined();
  });
});

describe('deleteClips', () => {
  it('removes the linked pair and leaves a gap', () => {
    let p = twoPairs();
    p = deleteClips(p, [v(p)[0].id]);
    expect(p.clips).toHaveLength(2);
    expect(layout(v(p))).toEqual(['B@10-20']);
    expect(layout(a(p))).toEqual(['B@10-20']);
  });
});

describe('moveClip', () => {
  it('drops into empty space exactly where released, leaving a gap', () => {
    let p = twoPairs();
    p = moveClip(p, v(p)[1].id, 25 * S);
    expect(layout(v(p))).toEqual(['A@0-10', 'B@25-35']);
    expect(layout(a(p))).toEqual(['A@0-10', 'B@25-35']);
  });

  it('dropping onto a clip inserts at the nearest gap and pushes everything after it', () => {
    let p = threePairs(); // A 0-10, B 10-20, C 20-25
    p = moveClip(p, v(p)[2].id, 12 * S);
    expect(layout(v(p))).toEqual(['A@0-10', 'C@10-15', 'B@15-25']);
    expect(layout(a(p))).toEqual(['A@0-10', 'C@10-15', 'B@15-25']);
  });

  it('an unlinked audio clip moves freely under other video', () => {
    let p = twoPairs();
    p = toggleLink(p, [v(p)[1].id, a(p)[1].id]);
    p = moveClip(p, a(p)[1].id, 23 * S);
    expect(layout(a(p))).toEqual(['A@0-10', 'B@23-33']);
    expect(layout(v(p))).toEqual(['A@0-10', 'B@10-20']);
  });

  it('a linked pair keeps its offset when moved', () => {
    let p = twoPairs();
    const ids = [v(p)[1].id, a(p)[1].id];
    p = toggleLink(p, ids);
    p = moveClip(p, a(p)[1].id, 22 * S); // audio B 22-32, video B still 10-20
    p = toggleLink(p, ids);
    p = moveClip(p, v(p)[1].id, 40 * S);
    expect(layout(v(p))).toEqual(['A@0-10', 'B@40-50']);
    expect(layout(a(p))).toEqual(['A@0-10', 'B@52-62']);
  });

  it('cannot move before the start of the timeline', () => {
    let p = twoPairs();
    p = deleteClips(p, [v(p)[0].id]);
    p = moveClip(p, v(p)[0].id, -3 * S);
    expect(layout(v(p))).toEqual(['B@0-10']);
  });
});

describe('positions stay on whole frames', () => {
  it('a clip dragged to a fractional time lands on the nearest frame, in whole microseconds', () => {
    let p = twoPairs();
    p = moveClip(p, v(p)[1].id, 26_849_080.341728717);
    const start = v(p)[1].startUs;
    expect(Number.isInteger(start)).toBe(true);
    expect(start).toBe(26_833_333); // frame 805 at 30 fps
    expect(a(p)[1].startUs).toBe(start);
  });

  it('media dropped at a fractional time also lands on a frame', () => {
    let p = addMedia(twoPairs(), media('C', 5));
    p = dropMedia(p, 'C', 30_000_000.75);
    expect(v(p)[2].startUs).toBe(30_000_000);
  });
});

describe('dropMedia', () => {
  it('places new media exactly where dropped when there is room', () => {
    let p = addMedia(twoPairs(), media('C', 5));
    p = dropMedia(p, 'C', 30 * S);
    expect(layout(v(p))).toEqual(['A@0-10', 'B@10-20', 'C@30-35']);
  });

  it('dropping onto a clip inserts at the nearest gap and pushes later clips', () => {
    let p = addMedia(twoPairs(), media('C', 5));
    p = dropMedia(p, 'C', 6 * S);
    expect(layout(v(p))).toEqual(['A@0-10', 'C@10-15', 'B@15-25']);
    expect(layout(a(p))).toEqual(['A@0-10', 'C@10-15', 'B@15-25']);
  });

  it('audio-only media only checks the audio track', () => {
    let p = twoPairs();
    p = toggleLink(p, [v(p)[1].id, a(p)[1].id]);
    p = moveClip(p, a(p)[1].id, 30 * S); // audio gap at 10-30 under video B
    p = addMedia(p, media('M', 5, { video: false }));
    p = dropMedia(p, 'M', 12 * S);
    expect(layout(a(p))).toEqual(['A@0-10', 'M@12-17', 'B@30-40']);
    expect(layout(v(p))).toEqual(['A@0-10', 'B@10-20']);
  });
});

describe('placeGroup', () => {
  it('reports where the group lands and which clips it pushes', () => {
    const p = twoPairs();
    const group = [v(p)[1], a(p)[1]];
    const free = placeGroup(p, group, 25 * S);
    expect(free.startUs).toBe(25 * S);
    expect(free.pushedIds).toEqual([]);
    const blocked = placeGroup(p, group, 3 * S);
    expect(blocked.startUs).toBe(0);
    expect(blocked.pushedIds.sort()).toEqual([v(p)[0].id, a(p)[0].id].sort());
  });
});

describe('pushing only what is in the way', () => {
  it('a gap after the blocking clip absorbs the push', () => {
    let p = addMedia(addMedia(twoPairs(), media('C', 5)), media('D', 10));
    p = dropMedia(p, 'D', 30 * S); // A 0-10, B 10-20, gap, D 30-40
    p = dropMedia(p, 'C', 12 * S);
    expect(layout(v(p))).toEqual(['A@0-10', 'C@10-15', 'B@15-25', 'D@30-40']);
    expect(layout(a(p))).toEqual(['A@0-10', 'C@10-15', 'B@15-25', 'D@30-40']);
  });

  it('pushes cascade through clips with no gap between them', () => {
    let p = addMedia(threePairs(), media('X', 5)); // A 0-10, B 10-20, C 20-25
    p = dropMedia(p, 'X', 6 * S);
    expect(layout(v(p))).toEqual(['A@0-10', 'X@10-15', 'B@15-25', 'C@25-30']);
  });

  it('only the blocked track is pushed: video over an audio-only stretch moves nothing', () => {
    let p = appendMedia(withMedia(media('A', 10), media('M', 10, { video: false }), media('V', 5, { audio: false })), 'A');
    p = dropMedia(p, 'M', 20 * S); // music on the audio track at 20-30, nothing on video there
    p = dropMedia(p, 'V', 22 * S);
    expect(layout(v(p))).toEqual(['A@0-10', 'V@22-27']);
    expect(layout(a(p))).toEqual(['A@0-10', 'M@20-30']);
  });

  it('a pair whose audio lands on another audio clip pushes just that clip', () => {
    let p = appendMedia(withMedia(media('A', 10), media('M', 10, { video: false }), media('P', 5)), 'A');
    p = dropMedia(p, 'M', 20 * S);
    p = dropMedia(p, 'P', 22 * S);
    expect(layout(v(p))).toEqual(['A@0-10', 'P@20-25']);
    expect(layout(a(p))).toEqual(['A@0-10', 'P@20-25', 'M@25-35']);
  });

  it("a pushed clip's linked partner moves with it", () => {
    let p = addMedia(twoPairs(), media('V', 5, { audio: false }));
    p = dropMedia(p, 'V', 3 * S);
    expect(layout(v(p))).toEqual(['V@0-5', 'A@5-15', 'B@15-25']);
    expect(layout(a(p))).toEqual(['A@5-15', 'B@15-25']);
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

  it('links a video and an audio clip that are no longer lined up', () => {
    let p = twoPairs();
    const ids = [v(p)[0].id, a(p)[0].id];
    p = toggleLink(p, ids);
    p = moveClip(p, a(p)[0].id, 25 * S);
    p = toggleLink(p, ids);
    const audio = a(p).find((c) => c.mediaId === 'A')!;
    expect(v(p)[0].linkId).toBeDefined();
    expect(v(p)[0].linkId).toBe(audio.linkId);
  });

  it('linking a clip to a new partner unlinks its old one', () => {
    let p = twoPairs();
    p = toggleLink(p, [v(p)[0].id, a(p)[1].id]);
    expect(v(p)[0].linkId).toBe(a(p)[1].linkId);
    expect(a(p)[0].linkId).toBeUndefined();
    expect(v(p)[1].linkId).toBeUndefined();
  });

  it('ignores two clips on the same track', () => {
    const p = twoPairs();
    expect(toggleLink(p, [v(p)[0].id, v(p)[1].id])).toBe(p);
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
