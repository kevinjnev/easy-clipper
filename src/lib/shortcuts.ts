export type Action =
  | 'playPause' | 'split' | 'delete' | 'undo' | 'redo'
  | 'stepBack' | 'stepFwd' | 'stepBack10' | 'stepFwd10'
  | 'selectLeftEdge' | 'selectRightEdge' | 'home' | 'end'
  | 'save' | 'open' | 'export' | 'toggleShortcuts' | 'toggleLink' | 'appendSelectedMedia';

export type ShortcutGroup = 'Playback' | 'Editing' | 'Trim & view' | 'Project';

export interface Shortcut {
  action: Action;
  keys: string;
  label: string;
  group: ShortcutGroup;
}

/** One key combination. `shift: undefined` means Shift may be up or down. */
interface Combo {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
}

const BINDINGS: (Shortcut & { combos: Combo[] })[] = [
  { action: 'playPause', keys: 'Space', label: 'Play / pause', group: 'Playback', combos: [{ key: ' ' }] },
  { action: 'stepBack', keys: '←', label: 'Previous frame / nudge edge', group: 'Playback', combos: [{ key: 'arrowleft' }] },
  { action: 'stepFwd', keys: '→', label: 'Next frame / nudge edge', group: 'Playback', combos: [{ key: 'arrowright' }] },
  { action: 'stepBack10', keys: 'Shift+←', label: 'Back 10 frames', group: 'Playback', combos: [{ key: 'arrowleft', shift: true }] },
  { action: 'stepFwd10', keys: 'Shift+→', label: 'Forward 10 frames', group: 'Playback', combos: [{ key: 'arrowright', shift: true }] },
  { action: 'home', keys: 'Home', label: 'Go to start (of selection)', group: 'Playback', combos: [{ key: 'home' }] },
  { action: 'end', keys: 'End', label: 'Go to end (of selection)', group: 'Playback', combos: [{ key: 'end' }] },
  { action: 'split', keys: 'S', label: 'Split at playhead', group: 'Editing', combos: [{ key: 's' }] },
  { action: 'delete', keys: 'Delete', label: 'Delete selected clips', group: 'Editing', combos: [{ key: 'delete' }, { key: 'backspace' }] },
  { action: 'toggleLink', keys: 'Ctrl+L', label: 'Link / unlink video + audio', group: 'Editing', combos: [{ key: 'l', ctrl: true }] },
  { action: 'appendSelectedMedia', keys: 'Enter', label: 'Add selected media to end', group: 'Editing', combos: [{ key: 'enter' }] },
  { action: 'undo', keys: 'Ctrl+Z', label: 'Undo', group: 'Project', combos: [{ key: 'z', ctrl: true }] },
  { action: 'redo', keys: 'Ctrl+Y', label: 'Redo', group: 'Project', combos: [{ key: 'y', ctrl: true }, { key: 'z', ctrl: true, shift: true }] },
  { action: 'selectLeftEdge', keys: '[', label: 'Select left edge of clip', group: 'Trim & view', combos: [{ key: '[' }] },
  { action: 'selectRightEdge', keys: ']', label: 'Select right edge of clip', group: 'Trim & view', combos: [{ key: ']' }] },
  { action: 'save', keys: 'Ctrl+S', label: 'Save project', group: 'Project', combos: [{ key: 's', ctrl: true }] },
  { action: 'open', keys: 'Ctrl+O', label: 'Open project', group: 'Project', combos: [{ key: 'o', ctrl: true }] },
  { action: 'export', keys: 'Ctrl+E', label: 'Export', group: 'Project', combos: [{ key: 'e', ctrl: true }] },
  { action: 'toggleShortcuts', keys: '?', label: 'Show / hide shortcuts', group: 'Project', combos: [{ key: '?', shift: undefined }] },
];

export const SHORTCUTS: Shortcut[] = BINDINGS.map(({ action, keys, label, group }) => ({ action, keys, label, group }));

/** Mouse gestures shown in the shortcuts panel; they have no keyboard action. */
export const SHORTCUT_HINTS: { keys: string; label: string; group: ShortcutGroup }[] = [
  { keys: 'Drag clip edge', label: 'Trim', group: 'Trim & view' },
  { keys: 'Shift+Arrows', label: 'Move selected edge 10 frames', group: 'Trim & view' },
  { keys: 'Alt+Drag', label: 'Drag without snapping', group: 'Editing' },
  { keys: 'Drag clip', label: 'Reorder', group: 'Editing' },
  { keys: 'Ctrl+Scroll', label: 'Zoom timeline or preview', group: 'Trim & view' },
  { keys: 'Ctrl+Drag', label: 'Move zoomed preview', group: 'Trim & view' },
  { keys: 'Scroll', label: 'Scroll timeline', group: 'Trim & view' },
];

export function resolveShortcut(e: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): Action | null {
  if (e.altKey) return null;
  const key = e.key.toLowerCase();
  for (const b of BINDINGS) {
    for (const c of b.combos) {
      if (c.key !== key || (c.ctrl ?? false) !== e.ctrlKey) continue;
      const shiftMatches = 'shift' in c && c.shift === undefined ? true : (c.shift ?? false) === e.shiftKey;
      if (shiftMatches) return b.action;
    }
  }
  return null;
}

export function tooltip(action: Action): string {
  const s = SHORTCUTS.find((x) => x.action === action);
  return s ? `${s.label} (${s.keys})` : '';
}
