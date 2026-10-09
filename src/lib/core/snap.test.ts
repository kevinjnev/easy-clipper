import { describe, expect, it } from 'vitest';
import { History } from './history';
import { createProject, type Project } from './model';
import { snapTargets, snapValue } from './snap';

describe('snapping', () => {
  const p: Project = {
    ...createProject(),
    clips: [
      { id: 'a', mediaId: 'm', track: 'video', startUs: 0, inUs: 0, outUs: 2_000_000 },
      { id: 'b', mediaId: 'm', track: 'audio', startUs: 3_000_000, inUs: 0, outUs: 1_000_000 },
    ],
  };

  it('collects clip edges, zero and the playhead, minus excluded clips', () => {
    expect(snapTargets(p, 5_500_000, ['b']).sort((x, y) => x - y)).toEqual([0, 2_000_000, 5_500_000]);
  });

  it('snaps within the threshold only', () => {
    const targets = [0, 2_000_000];
    expect(snapValue(2_050_000, targets, 100_000)).toBe(2_000_000);
    expect(snapValue(2_150_000, targets, 100_000)).toBe(2_150_000);
  });
});

describe('History', () => {
  it('undoes and redoes', () => {
    const h = new History(0);
    h.push(1);
    h.push(2);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toBe(1);
    expect(h.present).toBe(1);
  });

  it('pushing after undo clears redo', () => {
    const h = new History(0);
    h.push(1);
    h.undo();
    h.push(5);
    expect(h.canRedo).toBe(false);
    expect(h.present).toBe(5);
  });

  it('keeps at most 200 undo steps', () => {
    const h = new History(0);
    for (let i = 1; i <= 205; i++) h.push(i);
    let n = 0;
    while (h.canUndo) {
      h.undo();
      n++;
    }
    expect(n).toBe(200);
    expect(h.present).toBe(5);
  });
});
