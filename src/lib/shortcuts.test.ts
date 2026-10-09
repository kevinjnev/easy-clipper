import { describe, expect, it } from 'vitest';
import { resolveShortcut, SHORTCUTS, type Action } from './shortcuts';

const key = (k: string, mods: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}) =>
  resolveShortcut({ key: k, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

describe('resolveShortcut', () => {
  it('maps keys to actions', () => {
    expect(key('ArrowRight', { shiftKey: true })).toBe('stepFwd10');
    expect(key('ArrowLeft')).toBe('stepBack');
    expect(key('s')).toBe('split');
    expect(key('S', { shiftKey: true })).toBeNull();
    expect(key('z', { ctrlKey: true })).toBe('undo');
    expect(key('Z', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(key('y', { ctrlKey: true })).toBe('redo');
    expect(key('?', { shiftKey: true })).toBe('toggleShortcuts');
    expect(key(' ')).toBe('playPause');
    expect(key('Delete')).toBe('delete');
    expect(key('Backspace')).toBe('delete');
    expect(key('[')).toBe('selectLeftEdge');
    expect(key(']')).toBe('selectRightEdge');
    expect(key('l', { ctrlKey: true })).toBe('toggleLink');
    expect(key('e', { ctrlKey: true })).toBe('export');
    expect(key('Enter')).toBe('appendSelectedMedia');
    expect(key('x')).toBeNull();
  });

  it('lists every action exactly once', () => {
    const all: Action[] = ['playPause', 'split', 'delete', 'undo', 'redo', 'stepBack', 'stepFwd', 'stepBack10',
      'stepFwd10', 'selectLeftEdge', 'selectRightEdge', 'home', 'end', 'save', 'open', 'export', 'toggleShortcuts',
      'toggleLink', 'appendSelectedMedia'];
    const listed = SHORTCUTS.map((s) => s.action).sort();
    expect(listed).toEqual([...all].sort());
  });
});
