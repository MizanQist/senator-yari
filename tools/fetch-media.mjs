// Downloads every image/video referenced in research/instagram-posts.json into media/originals/<code>/.
// Idempotent: skips files that already exist. Run: node tools/fetch-media.mjs
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'media', 'originals');
const { posts } = JSON.parse(await (await import('node:fs/promises')).readFile(join(ROOT, 'research', 'instagram-posts.json'), 'utf8'));

const jobs = [];
for (const p of posts) {
  const items = p.media.carousel.length
    ? p.media.carousel.map((m, i) => ({ i, image: m.image, video: m.video }))
    : [{ i: 0, image: p.media.image, video: p.media.video }];
  for (const m of items) {
    if (m.image) jobs.push({ code: p.code, name: `${m.i}.jpg`, url: m.image });
    if (m.video) jobs.push({ code: p.code, name: `${m.i}.mp4`, url: m.video });
  }
}

const exists = async (f) => stat(f).then(() => true, () => false);
let done = 0, skipped = 0, failed = [];
async function run(job) {
  const dir = join(OUT, job.code);
  const file = join(dir, job.name);
  if (await exists(file)) { skipped++; return; }
  await mkdir(dir, { recursive: true });
  try {
    const r = await fetch(job.url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await writeFile(file, Buffer.from(await r.arrayBuffer()));
    done++;
  } catch (e) { failed.push({ ...job, error: e.message }); }
}
// ponytail: fixed pool of 4, no retries — rerun the script to pick up failures
const queue = [...jobs];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await run(queue.shift()); }));
console.log(`jobs ${jobs.length} · downloaded ${done} · skipped ${skipped} · failed ${failed.length}`);
if (failed.length) console.log(failed.map(f => `${f.code}/${f.name} ${f.error}`).join('\n'));
