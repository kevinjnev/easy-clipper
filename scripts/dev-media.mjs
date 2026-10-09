// Generates sample media + metadata for the browser dev harness (src/lib/devHarness.ts).
// Usage: node scripts/dev-media.mjs   (needs ffmpeg/ffprobe on PATH)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join(import.meta.dirname, '..', 'static', 'dev-media');
mkdirSync(out, { recursive: true });

const ff = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);

const clips = [
  { name: 'beach.mp4', secs: 8, w: 1280, h: 720, audio: 440, src: 'testsrc2' },
  { name: 'city.mp4', secs: 6, w: 1280, h: 720, audio: 660, src: 'smptebars' },
  { name: 'screen-recording.mp4', secs: 5, w: 1280, h: 720, audio: 0, src: 'rgbtestsrc' },
  { name: 'music.mp3', secs: 10, audio: 330 },
];

const manifest = {};
for (const c of clips) {
  const path = join(out, c.name);
  const args = [];
  if (c.w) args.push('-f', 'lavfi', '-i', `${c.src}=size=${c.w}x${c.h}:rate=30:duration=${c.secs}`);
  if (c.audio) args.push('-f', 'lavfi', '-i', `sine=frequency=${c.audio}:duration=${c.secs},volume=eval=frame:volume=0.3+5*t/${c.secs}`);
  if (c.w) args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-g', '15');
  if (c.audio) args.push('-c:a', c.w ? 'aac' : 'libmp3lame');
  ff(...args, path);

  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]).toString());
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  const [num, den] = (v?.avg_frame_rate ?? '30/1').split('/').map(Number);
  const entry = {
    durationUs: Math.round(parseFloat(info.format.duration) * 1e6),
    hasVideo: !!v, hasAudio: !!a, width: v?.width ?? 0, height: v?.height ?? 0,
    fpsNum: num || 30, fpsDen: den || 1, videoCodec: v?.codec_name ?? null, audioCodec: a?.codec_name ?? null,
    formatName: info.format.format_name,
  };

  if (v) {
    const rate = (10 * 1.05) / (entry.durationUs / 1e6);
    ff('-i', path, '-an', '-vf', `fps=${rate},scale=160:-2,tile=10x1`, '-frames:v', '1', join(out, `${c.name}-thumbs.jpg`));
  }
  if (a) {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], { maxBuffer: 1e8 });
    const peaks = [];
    for (let i = 0; i < pcm.length; i += 200) {
      let m = 0;
      for (let j = i; j < Math.min(i + 200, pcm.length - 1); j += 2) m = Math.max(m, Math.abs(pcm.readInt16LE(j)));
      peaks.push(m / 32768);
    }
    writeFileSync(join(out, `${c.name}-wave.json`), JSON.stringify(peaks));
  }
  manifest[`/dev-media/${c.name}`] = entry;
  console.log('made', c.name);
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
