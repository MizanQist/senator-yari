// One-off: self-host the two typefaces (latin subsets, variable woff2) and the Phosphor icons the site uses.
// Run: node tools/fetch-assets.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS = join(ROOT, 'src', 'assets', 'fonts');
const ICONS = join(ROOT, 'src', 'assets', 'icons');
await mkdir(FONTS, { recursive: true });
await mkdir(ICONS, { recursive: true });

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const families = [
  ['bricolage', 'Bricolage+Grotesque:opsz,wght@12..96,300..800'],
  ['publicsans', 'Public+Sans:ital,wght@0,300..800;1,300..800'],
];
for (const [slug, fam] of families) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam}&display=swap`, { headers: { 'User-Agent': UA } })).text();
  // keep only the /* latin */ blocks (one per style: upright + italic)
  const blocks = css.split('/* ').filter(b => b.startsWith('latin */'));
  let i = 0;
  for (const b of blocks) {
    const url = b.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    const italic = /font-style: italic/.test(b);
    if (!url) continue;
    const name = `${slug}${italic ? '-italic' : ''}.woff2`;
    await writeFile(join(FONTS, name), Buffer.from(await (await fetch(url)).arrayBuffer()));
    console.log('font', name); i++;
  }
  if (!i) console.log('NO LATIN BLOCK for', slug, css.slice(0, 200));
}

const icons = ['arrow-up-right', 'arrow-right', 'arrow-left', 'x', 'list', 'play', 'instagram-logo', 'x-logo', 'facebook-logo',
  'map-pin', 'calendar-blank', 'sun', 'moon', 'envelope-simple', 'whatsapp-logo', 'caret-down', 'caret-right', 'images', 'video-camera', 'quotes', 'rss', 'magnifying-glass', 'speaker-simple-slash', 'speaker-simple-high'];
for (const n of icons) {
  const r = await fetch(`https://raw.githubusercontent.com/phosphor-icons/core/main/assets/regular/${n}.svg`);
  if (!r.ok) { console.log('icon missing', n, r.status); continue; }
  await writeFile(join(ICONS, `${n}.svg`), await r.text());
}
console.log('icons done');
