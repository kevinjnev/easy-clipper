import { describe, expect, it } from 'vitest';
import { createProject, type Project } from '../core/model';
import { timelineMenu } from './menu';

const S = 1_000_000;
const p: Project = {
  ...createProject(),
  clips: [
    { id: 'v1', mediaId: 'm', track: 'video', startUs: 0, inUs: 0, outUs: 10 * S, linkId: 'L' },
    { id: 'a1', mediaId: 'm', track: 'audio', startUs: 0, inUs: 0, outUs: 10 * S, linkId: 'L' },
    { id: 'v2', mediaId: 'm', track: 'video', startUs: 10 * S, inUs: 0, outUs: 5 * S },
    { id: 'a2', mediaId: 'm', track: 'audio', startUs: 20 * S, inUs: 0, outUs: 5 * S },
  ],
};

const summary = (items: ReturnType<typeof timelineMenu>) => items.map((i) => `${i.id}${i.disabled ? ' (off)' : ''}: ${i.label}`);

describe('timeline right-click menu', () => {
  it('offers clip actions on a linked clip', () => {
    expect(summary(timelineMenu(p, ['v1', 'a1'], 'clip', 3 * S, 5 * S))).toEqual([
      'splitHere: Split here',
      'splitPlayhead: Split at playhead',
      'delete: Delete',
      'link: Unlink video and audio',
    ]);
  });

  it('offers linking when one video and one audio clip are selected', () => {
    const items = timelineMenu(p, ['v2', 'a2'], 'clip', 12 * S);
    expect(items.find((i) => i.id === 'link')).toMatchObject({ label: 'Link video and audio', disabled: false });
  });

  it('greys out linking for a single unlinked clip', () => {
    const items = timelineMenu(p, ['v2'], 'clip', 12 * S);
    expect(items.find((i) => i.id === 'link')).toMatchObject({ label: 'Link video and audio', disabled: true });
  });

  it('greys out split at playhead when the playhead is not over a selected clip', () => {
    const items = timelineMenu(p, ['v2'], 'clip', 12 * S, 3 * S);
    expect(items.find((i) => i.id === 'splitPlayhead')?.disabled).toBe(true);
    expect(timelineMenu(p, ['v2'], 'clip', 12 * S, 11 * S).find((i) => i.id === 'splitPlayhead')?.disabled).toBe(false);
  });

  it('offers view actions on empty timeline', () => {
    expect(summary(timelineMenu(p, [], 'empty', 30 * S))).toEqual([
      'playheadHere: Move playhead here',
      'fit: Fit timeline to window',
    ]);
  });
});
