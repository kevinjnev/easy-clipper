import type { Fps } from './time';

export type TrackKind = 'video' | 'audio';

export interface MediaItem {
  id: string;
  path: string;
  name: string;
  durationUs: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
  fps: Fps;
  videoCodec: string | null;
  audioCodec: string | null;
  formatName: string;
  proxyPath?: string;
  error?: string;
}

export interface Clip {
  id: string;
  mediaId: string;
  track: TrackKind;
  /** Position on the timeline. */
  startUs: number;
  /** Range within the source file. */
  inUs: number;
  outUs: number;
  /** Shared by a video clip and its audio clip while linked. */
  linkId?: string;
}

export interface Project {
  version: 1;
  fps: Fps;
  width: number;
  height: number;
  media: MediaItem[];
  clips: Clip[];
}

export const clipLen = (c: Clip): number => c.outUs - c.inUs;
export const clipEnd = (c: Clip): number => c.startUs + clipLen(c);

export function createProject(): Project {
  return { version: 1, fps: { num: 30, den: 1 }, width: 1920, height: 1080, media: [], clips: [] };
}

export function timelineEndUs(p: Project): number {
  return p.clips.reduce((end, c) => Math.max(end, clipEnd(c)), 0);
}

/** Earliest start and latest end across the given clips (any tracks), or null if none exist. */
export function selectionBounds(p: Project, clipIds: string[]): { startUs: number; endUs: number } | null {
  const sel = p.clips.filter((c) => clipIds.includes(c.id));
  if (sel.length === 0) return null;
  return { startUs: Math.min(...sel.map((c) => c.startUs)), endUs: Math.max(...sel.map(clipEnd)) };
}

export function trackClips(p: Project, t: TrackKind): Clip[] {
  return p.clips.filter((c) => c.track === t).sort((a, b) => a.startUs - b.startUs);
}

export function partnerOf(p: Project, c: Clip): Clip | undefined {
  if (!c.linkId) return undefined;
  return p.clips.find((o) => o.linkId === c.linkId && o.id !== c.id);
}

export function mediaOf(p: Project, c: Clip): MediaItem {
  const m = p.media.find((x) => x.id === c.mediaId);
  if (!m) throw new Error(`Missing media ${c.mediaId}`);
  return m;
}

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export function parseProject(json: string): Project {
  const p = JSON.parse(json);
  if (!p || p.version !== 1 || !Array.isArray(p.media) || !Array.isArray(p.clips)) {
    throw new Error('Unsupported project file');
  }
  return p as Project;
}
