import { clipEnd, partnerOf, type Project } from '../core/model';

export type MenuAction = 'splitHere' | 'splitPlayhead' | 'delete' | 'link' | 'playheadHere' | 'fit';

export interface MenuItem {
  id: MenuAction;
  label: string;
  keys?: string;
  disabled: boolean;
}

/** Whether the selection is exactly one linked clip or one linked pair. */
function isLinkedSelection(p: Project, ids: string[]): boolean {
  const sel = p.clips.filter((c) => ids.includes(c.id));
  const first = sel[0];
  if (!first) return false;
  const partner = partnerOf(p, first);
  return !!partner && sel.every((c) => c.id === first.id || c.id === partner.id);
}

function isLinkable(p: Project, ids: string[]): boolean {
  const sel = p.clips.filter((c) => ids.includes(c.id));
  return sel.length === 2 && sel.some((c) => c.track === 'video') && sel.some((c) => c.track === 'audio');
}

/** The timeline's right-click menu for a click on a clip or on empty space. */
export function timelineMenu(p: Project, selectedIds: string[], on: 'clip' | 'empty', clickUs: number, playheadUs = 0): MenuItem[] {
  if (on === 'empty') {
    return [
      { id: 'playheadHere', label: 'Move playhead here', disabled: false },
      { id: 'fit', label: 'Fit timeline to window', disabled: p.clips.length === 0 },
    ];
  }
  const selected = p.clips.filter((c) => selectedIds.includes(c.id));
  const inside = (us: number) => selected.some((c) => c.startUs < us && us < clipEnd(c));
  const linked = isLinkedSelection(p, selectedIds);
  return [
    { id: 'splitHere', label: 'Split here', disabled: !inside(clickUs) },
    { id: 'splitPlayhead', label: 'Split at playhead', keys: 'S', disabled: !inside(playheadUs) },
    { id: 'delete', label: 'Delete', keys: 'Delete', disabled: selected.length === 0 },
    {
      id: 'link',
      label: linked ? 'Unlink video and audio' : 'Link video and audio',
      keys: 'Ctrl+L',
      disabled: !linked && !isLinkable(p, selectedIds),
    },
  ];
}
