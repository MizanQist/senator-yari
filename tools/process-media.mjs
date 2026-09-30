// Turns media/originals/<code>/<i>.{jpg,mp4} into web assets in media/web/<code>/ and writes media/web/manifest.json.
// Images: 1440 / 720 / 360 wide JPEGs + a 24px LQIP (inlined by the build). Videos: 720p H.264 + poster.
// Idempotent per output file. Run: node tools/process-media.mjs   (needs ffmpeg/ffprobe on the Homebrew path)
import { readdir, mkdir, stat, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const FFMPEG = '/opt/homebrew/bin/ffmpeg', FFPROBE = '/opt/homebrew/bin/ffprobe';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IN = join(ROOT, 'media', 'originals'), OUT = join(ROOT, 'media', 'web');
const WIDTHS = [1440, 720, 360];
const exists = f => stat(f).then(() => true, () => false);

async function probe(file) {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'json', file]);
  const s = JSON.parse(stdout).streams[0];
  return { w: s.width, h: s.height, duration: s.duration ? Math.round(+s.duration) : undefined };
}

async function image(src, dir, base) {
  const meta = await probe(src);
  for (const w of WIDTHS) {
    const out = join(dir, `${base}-${w}.jpg`);
    if (await exists(out)) continue;
    await run(FFMPEG, ['-v', 'error', '-y', '-i', src, '-vf', `scale='min(${w},iw)':-2`, '-q:v', '3', out]);
  }
  const lq = join(dir, `${base}-lqip.jpg`);
  if (!await exists(lq)) await run(FFMPEG, ['-v', 'error', '-y', '-i', src, '-vf', 'scale=24:-2', '-q:v', '8', lq]);
  return { type: 'image', ...meta, lqip: `data:image/jpeg;base64,${(await readFile(lq)).toString('base64')}` };
}

async function video(src, dir, base) {
  const meta = await probe(src);
  const out = join(dir, `${base}-720.mp4`), poster = join(dir, `${base}-poster.jpg`);
  if (!await exists(out)) {
    await run(FFMPEG, ['-v', 'error', '-y', '-i', src, '-vf', `scale='min(720,iw)':-2`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '26',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k', '-ac', '2', out]);
  }
  if (!await exists(poster)) await run(FFMPEG, ['-v', 'error', '-y', '-ss', '1', '-i', src, '-frames:v', '1', '-vf', `scale='min(720,iw)':-2`, '-q:v', '3', poster]);
  const lq = join(dir, `${base}-lqip.jpg`);
  if (!await exists(lq)) await run(FFMPEG, ['-v', 'error', '-y', '-i', poster, '-vf', 'scale=24:-2', '-q:v', '8', lq]);
  return { type: 'video', ...meta, lqip: `data:image/jpeg;base64,${(await readFile(lq)).toString('base64')}` };
}

const manifest = {};
const codes = (await readdir(IN)).filter(c => !c.startsWith('.'));
const jobs = [];
for (const code of codes) {
  for (const f of (await readdir(join(IN, code))).sort()) {
    const base = f.replace(/\.\w+$/, '');
    jobs.push(async () => {
      const dir = join(OUT, code); await mkdir(dir, { recursive: true });
      const src = join(IN, code, f);
      try {
        const m = f.endsWith('.mp4') ? await video(src, dir, base) : await image(src, dir, base);
        (manifest[code] ??= {})[base] = m;
      } catch (e) { console.error('FAIL', code, f, e.message.split('\n')[0]); }
    });
  }
}
let n = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (jobs.length) { await jobs.shift()(); if (++n % 25 === 0) console.log(`${n} files`); } }));
// carousel slots must be ordered numerically for the templates
for (const code in manifest) manifest[code] = Object.fromEntries(Object.entries(manifest[code]).sort((a, b) => +a[0] - +b[0]));
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`done: ${Object.keys(manifest).length} posts, ${n} files`);
