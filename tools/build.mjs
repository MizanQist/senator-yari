// Static site generator for senator-yari. Zero dependencies.
//   node tools/build.mjs            → site/ (local preview, root-relative links)
//   BASE=/senator-yari node tools/build.mjs   → links prefixed for GitHub Pages project hosting
//   MEDIA=1 forces a fresh copy of media/web → site/media
import { readFile, writeFile, mkdir, rm, cp, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src'), OUT = join(ROOT, 'site');
const BASE = process.env.BASE || '';
const readJson = async p => JSON.parse(await readFile(p, 'utf8'));

const site = await readJson(join(SRC, 'data', 'site.json'));
const { posts: allPosts } = await readJson(join(ROOT, 'research', 'instagram-posts.json'));
const manifest = await readJson(join(ROOT, 'media', 'web', 'manifest.json'));
const nigeria = await readJson(join(SRC, 'data', 'nigeria-paths.json'));
const posts = allPosts.slice().sort((a, b) => b.date.localeCompare(a.date));
const byCode = Object.fromEntries(posts.map(p => [p.code, p]));

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const u = p => BASE + p;
const abs = p => site.siteUrl.replace(/\/$/, '') + p;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = d => { const [y, m, day] = d.split('-'); return `${+day} ${MONTHS[+m - 1]} ${y}`; };
const fmtShort = d => { const [y, m, day] = d.split('-'); return `${+day} ${MONTHS[+m - 1].slice(0, 3)} ${y}`; };
const n = x => (x ?? 0).toLocaleString('en');
const icons = {};
for (const f of await readdir(join(SRC, 'assets', 'icons'))) {
  const svg = await readFile(join(SRC, 'assets', 'icons', f), 'utf8');
  icons[f.replace('.svg', '')] = svg.replace(/<svg([^>]*)>/, (m, a) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, '')} aria-hidden="true" focusable="false">`);
}
const ic = name => icons[name] || '';
const CATS = ['Campaign 2027', 'Projects & giving', 'Senate work', 'Party & politics', 'Visits & engagements', 'Condolences & tributes', 'Observances & messages', 'Personal'];
const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const firstSentence = s => (s || '').split(/\n|(?<=[.!?])\s/)[0].trim();
const altFor = p => firstSentence(p.caption) ? firstSentence(p.caption).slice(0, 140) : `Post by @${p.author} on ${fmt(p.date)}`;
const linkify = s => esc(s).replace(/@([a-z0-9._]+)/gi, (m, h) => `<a href="https://www.instagram.com/${h}/" rel="noopener">@${h}</a>`).replace(/#(\w+)/g, (m, t) => `<a href="https://www.instagram.com/explore/tags/${t}/" rel="noopener">#${t}</a>`);

/* ---------- media ---------- */
const slots = code => Object.entries(manifest[code] || {}).map(([slot, m]) => ({ slot, ...m }));
const firstImage = code => slots(code).find(s => s.type === 'image') || slots(code)[0];
const src = (code, slot, w) => u(`/media/${code}/${slot}-${w}.jpg`);
const poster = (code, slot) => u(`/media/${code}/${slot}-poster.jpg`);
const mp4 = (code, slot) => u(`/media/${code}/${slot}-720.mp4`);
const ratioClass = m => { const r = m.w / m.h; return r < .7 ? 'r-916' : r < .9 ? 'r-45' : r < 1.15 ? 'r-1' : r < 1.6 ? 'r-43' : 'r-169'; };

// An image (or a video's poster) in a bezelled frame. Lazy by default with an inlined LQIP under it.
function media(code, slot, { ratio, sizes = '(max-width: 960px) 100vw, 33vw', eager = false, alt = '', cls = '', zoom = true, badge = true } = {}) {
  const m = manifest[code]?.[slot]; if (!m) return '';
  const isVideo = m.type === 'video';
  const img = isVideo
    ? `<img ${eager ? 'src' : 'data-lazy'}="${poster(code, slot)}" width="${m.w}" height="${m.h}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'}>`
    : `<img ${eager ? 'src' : 'data-lazy'}="${src(code, slot, 720)}" ${eager ? 'srcset' : 'data-srcset'}="${src(code, slot, 360)} 360w, ${src(code, slot, 720)} 720w, ${src(code, slot, 1440)} 1440w" sizes="${sizes}" width="${m.w}" height="${m.h}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'}>`;
  return `<div class="frame ${zoom ? 'hover-zoom' : ''} ${cls}"><div class="media ${ratio || ratioClass(m)}" style="background-image:url(${m.lqip})">${img}${isVideo && badge ? `<span class="badge">${ic('play')}</span>` : ''}</div></div>`;
}
// A click-to-play video with its poster; one network request only when played.
function video(code, slot, { ratio, alt = '', cls = '' } = {}) {
  const m = manifest[code]?.[slot]; if (!m || m.type !== 'video') return media(code, slot, { ratio, alt, cls });
  ratio ||= ratioClass(m);
  return `<div class="frame ${cls}"><div class="media ${ratio}" data-video style="background-image:url(${m.lqip})">
    <img data-lazy="${poster(code, slot)}" width="${m.w}" height="${m.h}" alt="${esc(alt)}" loading="lazy" decoding="async">
    <video data-src="${mp4(code, slot)}" poster="${poster(code, slot)}" preload="none" playsinline controls width="${m.w}" height="${m.h}"></video>
    <button class="play" type="button" aria-label="Play video"><span>${ic('play')}</span></button></div></div>`;
}
const postHref = p => u(`/activity/${p.code}/`);
// site.json may name a specific slide as "code:slot"; bare codes fall back to the first image
const ref = s => { const [code, slot] = String(s).split(':'); return { code, slot: slot ?? firstImage(code)?.slot ?? '0' }; };
const hasMedia = code => !!manifest[ref(code).code];
const refMedia = (s, opts) => { const r = ref(s); return media(r.code, r.slot, opts); };
const refHref = s => { const p = byCode[ref(s).code]; return p ? postHref(p) : '#'; };

/* ---------- layout ---------- */
function layout({ title, description, path, body, image, jsonld, bodyClass = '', current }) {
  const fullTitle = path === '/' ? `${site.name} · ${site.title}` : `${title} · ${site.shortName}`;
  const og = image ? abs(image) : abs(`/media/${site.hero.code}/${site.hero.slot}-poster.jpg`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || site.description)}">
<link rel="canonical" href="${abs(path)}">
<meta property="og:type" content="${path.startsWith('/activity/') && path !== '/activity/' ? 'article' : 'website'}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || site.description)}">
<meta property="og:image" content="${og}">
<meta property="og:url" content="${abs(path)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0c1511">
<link rel="icon" href="${u('/assets/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${u('/assets/apple-touch-icon.png')}">
<link rel="manifest" href="${u('/manifest.webmanifest')}">
<link rel="alternate" type="application/rss+xml" title="${esc(site.shortName)} activity" href="${u('/feed.xml')}">
<link rel="preload" href="${u('/assets/fonts/bricolage.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${u('/assets/fonts/publicsans.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${u('/assets/site.css')}">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
${nav(current)}
<main id="main">
${body}
</main>
${footer()}
<script src="${u('/assets/site.js')}" defer></script>
</body>
</html>`;
}
function nav(current) {
  const links = site.nav.map(([l, h]) => `<li><a href="${u(h)}" ${current === h ? 'aria-current="page"' : ''}>${l}</a></li>`).join('');
  return `<div class="nav-wrap"><header class="nav">
  <a class="brand" href="${u('/')}" aria-label="${esc(site.name)}, home">${esc(site.shortName)}<small>${esc(site.title)}</small></a>
  <nav aria-label="Primary"><ul class="nav-links">${links}</ul></nav>
  <div class="nav-right">
    <button class="icon-btn theme-btn" type="button" aria-label="Switch colour theme"><span class="sun">${ic('sun')}</span><span class="moon">${ic('moon')}</span></button>
    <button class="icon-btn menu-btn" type="button" aria-expanded="false" aria-controls="menu" aria-label="Open menu"><span class="bar"></span><span class="bar"></span></button>
  </div>
</header></div>
<div class="menu" id="menu"><nav aria-label="Mobile"><ul>${links}</ul></nav><div class="social">${socialButtons()}</div></div>`;
}
const socialButtons = () => [['instagram-logo', site.instagram, 'Instagram'], ['x-logo', site.x, 'X'], ['facebook-logo', site.facebook, 'Facebook']]
  .map(([i, h, l]) => `<a class="icon-btn" href="${h}" rel="noopener" target="_blank" aria-label="${l}">${ic(i)}</a>`).join('');
function footer() {
  return `<footer class="footer"><div class="wrap">
  <div class="footer-grid">
    <div><a class="brand" href="${u('/')}">${esc(site.name)}<small>${esc(site.title)}</small></a><p class="measure" style="margin-top:14px;opacity:.75;max-width:40ch">${esc(site.tagline)}</p></div>
    <div><h4>Pages</h4><ul>${site.nav.map(([l, h]) => `<li><a href="${u(h)}">${l}</a></li>`).join('')}</ul></div>
    <div><h4>Follow</h4><ul><li><a href="${site.instagram}" rel="noopener">Instagram</a></li><li><a href="${site.x}" rel="noopener">X</a></li><li><a href="${site.facebook}" rel="noopener">Facebook</a></li><li><a href="${u('/feed.xml')}">RSS feed</a></li></ul></div>
    <div><h4>Office</h4><ul>${site.contact.offices.map(o => `<li>${esc(o.name)}<br><span style="opacity:.7">${o.lines.map(esc).join('<br>')}</span></li>`).join('')}</ul></div>
  </div>
  <div class="fine"><span>© ${new Date().getFullYear()} ${esc(site.name)}. Photographs and video from the Senator's official channels.</span><span>Site by <a href="${site.credit.url}" rel="noopener">${esc(site.credit.name)}</a></span></div>
</div></footer>`;
}

/* ---------- shared blocks ---------- */
const pageHead = (crumb, title, lede) => `<div class="wrap"><header class="page-head"><p class="crumb">${crumb}</p><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ''}</header></div>`;
const btn = (href, label, kind = 'primary', icon = 'arrow-up-right') => `<a class="btn btn-${kind}" href="${href}">${esc(label)}<span class="ic">${ic(icon)}</span></a>`;
const feedCard = p => {
  const m = slots(p.code)[0]; if (!m) return '';
  return `<article data-cat="${esc(p.category)}" data-year="${p.date.slice(0, 4)}">
  <a href="${postHref(p)}">${media(p.code, m.slot, { ratio: 'r-45', alt: altFor(p) })}</a>
  <div class="meta"><time datetime="${p.date}">${fmtShort(p.date)}</time><span class="cat">${esc(p.category)}</span></div>
  <p>${esc(firstSentence(p.caption) || 'Untitled')}</p>
  ${p.collab ? `<span class="collab">with @${esc(p.author)}</span>` : ''}
</article>`;
};
function nigeriaMap(states, home, activeSet) {
  const paths = Object.entries(nigeria.paths).map(([name, d]) => {
    const cls = name === home ? 'home' : states.includes(name) ? 'visited' : '';
    return `<path d="${d}" class="${cls}" data-state="${esc(name)}"><title>${esc(name)}</title></path>`;
  }).join('');
  return `<svg class="map" viewBox="${nigeria.viewBox}" role="img" aria-label="Map of Nigeria showing the states visited on the campaign trail">${paths}</svg>
  <div class="map-legend"><span style="--k:var(--accent)">Home state</span><span style="--k:var(--accent-soft)">Visited since 22 August 2026</span><span style="--k:var(--bg-2)">Not yet visited</span></div>`;
}
const stopItem = (s, withMedia = true) => `<li class="stop" data-state="${esc(s.state)}"><div><time datetime="${s.date}">${fmtShort(s.date)}</time><span class="state">${esc(s.state)}</span></div>
  <div><h3><a href="${byCode[s.code] ? postHref(byCode[s.code]) : '#'}">${esc(s.title)}</a></h3><p>${esc(s.text)}</p></div>
  ${withMedia && hasMedia(s.code) ? `<a href="${postHref(byCode[s.code])}" tabindex="-1" aria-hidden="true">${media(s.code, slots(s.code)[0].slot, { ratio: 'r-1', sizes: '120px', badge: false })}</a>` : '<span></span>'}</li>`;

/* ---------- pages ---------- */
function home() {
  const hero = manifest[site.hero.code]?.[site.hero.slot];
  const heroIsVideo = hero?.type === 'video';
  const latest = posts.slice(0, 4);
  const [n1, n2, n3, n4, n5, n6] = site.numbers;
  const money = v => esc(v).replace(/^₦/, '<span class="naira">₦</span>');
  const tile = (x, cls = 'span-4') => `<div class="tile ${cls}"><div class="big num">${money(x.value)}</div><div class="label">${esc(x.label)}</div></div>`;
  const stories = site.stories.slice(0, 3).map(c => byCode[c]).filter(Boolean);
  const body = `
<section class="hero">
  <div class="hero-media">${heroIsVideo
      ? `<img src="${poster(site.hero.code, site.hero.slot)}" alt="" fetchpriority="high"><video data-src="${mp4(site.hero.code, site.hero.slot)}" poster="${poster(site.hero.code, site.hero.slot)}" autoplay muted loop playsinline preload="none"></video>`
      : `<img src="${src(site.hero.code, site.hero.slot, 1440)}" srcset="${src(site.hero.code, site.hero.slot, 720)} 720w, ${src(site.hero.code, site.hero.slot, 1440)} 1440w" sizes="100vw" alt="" fetchpriority="high">`}</div>
  <div class="wrap on-media"><div class="hero-body">
    <p class="role rise">${esc(site.roles[0])}</p>
    <h1 class="rise">${esc(site.name)}</h1>
    <p class="lede rise">${esc(site.tagline)}</p>
    <div class="hero-actions rise">${btn(u('/activity/'), 'Latest activity')}${btn(u('/projects/'), 'Projects in Zamfara', 'ghost')}</div>
  </div></div>
  ${heroIsVideo ? `<button class="icon-btn hero-mute" type="button" aria-pressed="false" aria-label="Toggle sound"><span class="on">${ic('speaker-simple-slash')}</span><span class="off">${ic('speaker-simple-high')}</span></button>` : ''}
</section>

<section class="section"><div class="wrap now">
  <div class="now-statement rv"><span class="live">${esc(site.now.label)}</span><h2>${esc(site.now.text)}</h2>${btn(u('/campaign/'), 'Follow the campaign trail', 'plain', 'arrow-right')}</div>
  <ul class="latest rv-group">${latest.map(p => `<li><a href="${postHref(p)}">${media(p.code, slots(p.code)[0].slot, { ratio: 'r-1', sizes: '96px', badge: false })}<div><time datetime="${p.date}">${fmt(p.date)}</time><p>${esc(firstSentence(p.caption) || 'Untitled')}</p></div><span class="ic">${ic('arrow-up-right')}</span></a></li>`).join('')}</ul>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head rv"><h2>Work that reached people in Zamfara</h2><p class="lede">Food for a quarter of a million households, homes rebuilt after the floods, a bridge, scholarships and clinics. Numbers from the Senator's own record.</p></div>
  <div class="bento rv-group">
    <a class="tile media-tile span-8" href="${u('/projects/#yarifeeds')}">${refMedia(n1.media, { ratio: '', sizes: '(max-width: 960px) 100vw, 66vw', zoom: false, badge: false, alt: 'Ramadan food distribution in Talata Mafara' })}<div class="over"><div class="big num">${esc(n1.value)}</div><div class="label">${esc(n1.label)}. ${esc(n1.note)}.</div></div></a>
    ${tile(n2)}${tile(n3)}${tile(n4)}${tile(n5)}
    <a class="tile media-tile span-4 tall" href="${refHref(site.feature.media)}">${refMedia(site.feature.media, { ratio: '', sizes: '33vw', zoom: false, badge: false, alt: site.feature.alt })}<div class="over"><div class="label">${esc(site.feature.label)}</div></div></a>
    ${tile(n6)}
    <a class="tile accent span-4" href="${u('/projects/')}"><div class="big">All projects</div><div class="label">Ten programmes across food, relief, health, education and infrastructure.</div></a>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head rv"><h2>The campaign trail</h2><p class="lede">${esc(site.campaign.intro)}</p></div>
  <div class="trail">
    <div class="map-card rv">${nigeriaMap(site.campaign.states, site.campaign.home)}</div>
    <div><ol class="stops rv-group">${site.campaign.stops.slice(-7).reverse().map(s => stopItem(s)).join('')}</ol><p style="margin-top:24px">${btn(u('/campaign/'), 'Every stop since 22 August', 'plain', 'arrow-right')}</p></div>
  </div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head rv"><h2>In the Senate</h2><p class="lede">${esc(site.senate.intro)}</p></div>
  <div class="rail rv-group">${site.senate.items.slice(0, 7).map(s => `<article class="card"><a href="${byCode[s.code] ? postHref(byCode[s.code]) : u('/senate/')}">${hasMedia(s.code) ? media(s.code, slots(s.code)[0].slot, { ratio: 'r-43', sizes: '380px', alt: s.title }) : ''}</a><div><time datetime="${s.date}">${fmt(s.date)}</time><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></article>`).join('')}</div>
  <p>${btn(u('/senate/'), 'The legislative record', 'plain', 'arrow-right')}</p>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head rv"><h2>Alheri. The good you do quietly.</h2><p class="lede">Stories told by the people the work reached, filmed by <a href="https://www.instagram.com/yarialheri/" rel="noopener">@yarialheri</a>.</p></div>
  <div class="stories rv-group">${stories.map(p => `<figure class="story">${video(p.code, '0', { alt: altFor(p) })}<figcaption><p>${esc(firstSentence(p.caption))}</p></figcaption></figure>`).join('')}</div>
</div></section>

<section class="section"><div class="wrap split">
  <div class="rv">${media(site.portrait.code, site.portrait.slot, { ratio: 'r-45', sizes: '(max-width: 860px) 100vw, 40vw', alt: site.name, zoom: false, badge: false })}</div>
  <div class="text rv"><h2>${esc(site.title)}</h2><p class="lede">${esc(site.bio.lead)}</p><p class="measure muted">${esc(site.bio.paragraphs[0])}</p><div>${btn(u('/about/'), 'About the Senator', 'ghost', 'arrow-right')}</div></div>
</div></section>`;
  const jsonld = { '@context': 'https://schema.org', '@type': 'Person', name: site.name, honorificPrefix: 'Senator', jobTitle: site.roles, url: site.siteUrl, sameAs: [site.instagram, site.x, site.facebook], nationality: 'Nigerian', image: abs(`/media/${site.portrait.code}/${site.portrait.slot}-1440.jpg`) };
  return layout({ title: site.name, path: '/', body, jsonld, current: '/', bodyClass: 'home' });
}

function about() {
  const body = `${pageHead('About', esc(site.name), esc(site.bio.lead))}
<div class="wrap"><div class="split" style="align-items:start">
  <div class="rv">${media(site.portrait.code, site.portrait.slot, { ratio: 'r-45', sizes: '(max-width: 860px) 100vw, 40vw', alt: site.name, zoom: false, badge: false })}</div>
  <div class="text rv">${site.bio.paragraphs.map(p => `<p class="measure" style="font-size:1.05rem">${esc(p)}</p>`).join('')}
    <h3 style="margin-top:12px">Positions</h3>
    <dl class="kv">${site.positions.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <h3 style="margin-top:12px">Family and home</h3>
    <dl class="kv">${site.bio.family.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <p class="note">${esc(site.bio.todo)}</p>
  </div>
</div></div>
<section class="section"><div class="wrap">
  <div class="section-head rv"><h2>Committee work</h2><p class="lede">${esc(site.committees.intro)}</p></div>
  <ul class="facts rv-group" style="max-width:70ch">${site.committees.list.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
</div></section>`;
  return layout({ title: 'About', description: site.bio.lead, path: '/about/', body, current: '/about/' });
}

function projects() {
  const [a, b, ...rest] = site.projects;
  const featured = p => `<article class="project rv" id="${p.id}">
    <div class="project-media ${p.media.length > 1 && hasMedia(p.media[1]) ? 'two' : ''}">${p.media.slice(0, 2).filter(hasMedia).map(c => `<a href="${refHref(c)}">${refMedia(c, { sizes: '(max-width: 860px) 100vw, 30vw', alt: p.name, ratio: 'r-45' })}</a>`).join('')}</div>
    <div class="project-text"><span class="kicker">${esc(p.kicker)}</span><h2>${esc(p.name)}</h2><p class="lede">${esc(p.summary)}</p>${p.detail ? `<p class="measure muted">${esc(p.detail)}</p>` : ''}<ul class="facts">${p.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
  </article>`;
  const card = p => `<article class="card rv" id="${p.id}"><a href="${refHref(p.media[0])}">${hasMedia(p.media[0]) ? refMedia(p.media[0], { ratio: 'r-43', sizes: '(max-width: 760px) 100vw, 50vw', alt: p.name }) : ''}</a>
    <div><span class="kicker" style="font-size:.78rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-ink)">${esc(p.kicker)}</span><h3 style="margin-top:6px">${esc(p.name)}</h3><p>${esc(p.summary)}</p><ul class="facts" style="margin-top:12px">${p.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div></article>`;
  const body = `${pageHead('Projects', 'Projects and giving in Zamfara', 'Food, relief, health, education and infrastructure, funded personally and through the constituency office. Each figure comes from the Senator\'s own announcements.')}
<div class="wrap"><div class="projects">${featured(a)}${featured(b)}</div></div>
<section class="section"><div class="wrap"><div class="section-head rv"><h2>More programmes</h2></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:36px 24px">${rest.map(card).join('')}</div>
</div></section>`;
  return layout({ title: 'Projects', description: 'Projects and giving by Senator Abdulaziz Yari in Zamfara: YariFeeds250k, Gummi flood recovery, the Bardoki Bridge, scholarships, eye care and more.', path: '/projects/', body, current: '/projects/' });
}

function campaign() {
  const body = `${pageHead('Campaign', 'The road to January 2027', esc(site.campaign.intro))}
<div class="wrap trail">
  <div class="map-card rv">${nigeriaMap(site.campaign.states, site.campaign.home)}</div>
  <ol class="stops rv-group">${site.campaign.stops.slice().reverse().map(s => stopItem(s)).join('')}</ol>
</div>
<section class="section"><div class="wrap"><div class="section-head rv"><h2>Every campaign post</h2></div>
  <div class="feed rv-group">${posts.filter(p => p.category === 'Campaign 2027').map(feedCard).join('')}</div>
</div></section>`;
  return layout({ title: 'Campaign', description: 'Senator Yari\'s consultations as Director-General of the APC Presidential Campaign Council: every state, every stop.', path: '/campaign/', body, current: '/campaign/' });
}

function senate() {
  const body = `${pageHead('Senate', 'Zamfara West in the 10th Senate', esc(site.senate.intro))}
<div class="wrap"><ul class="ledger rv-group">${site.senate.items.map(s => `<li><time datetime="${s.date}">${fmt(s.date)}</time><div><h3><a href="${byCode[s.code] ? postHref(byCode[s.code]) : '#'}">${esc(s.title)}</a></h3><p>${esc(s.text)}</p></div>${hasMedia(s.code) ? `<a href="${postHref(byCode[s.code])}" tabindex="-1" aria-hidden="true">${media(s.code, slots(s.code)[0].slot, { ratio: 'r-32', sizes: '200px', badge: false })}</a>` : '<span></span>'}</li>`).join('')}</ul></div>
<section class="section"><div class="wrap">
  <div class="section-head rv"><h2>Committees</h2><p class="lede">${esc(site.committees.intro)}</p></div>
  <ul class="facts rv-group" style="max-width:70ch">${site.committees.list.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
</div></section>
<section class="section"><div class="wrap"><div class="section-head rv"><h2>Every Senate post</h2></div>
  <div class="feed rv-group">${posts.filter(p => p.category === 'Senate work').map(feedCard).join('')}</div>
</div></section>`;
  return layout({ title: 'Senate', description: 'Senator Yari\'s legislative record in the 10th Senate: the Water Resources committee, budget defence, confirmations and security sessions.', path: '/senate/', body, current: '/senate/' });
}

function activity() {
  const years = [...new Set(posts.map(p => p.date.slice(0, 4)))].sort().reverse();
  const body = `${pageHead('Activity', 'Everything, as it happens', 'Every post from the Senator\'s official Instagram, organised by theme. Updated from the feed.')}
<div class="wrap">
  <div class="filters" role="group" aria-label="Filter by theme">${CATS.map(c => `<button class="chip" type="button" data-cat="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}</div>
  <div class="filters" role="group" aria-label="Filter by year" style="margin-top:-20px">${years.map(y => `<button class="chip" type="button" data-year="${y}" aria-pressed="false">${y}</button>`).join('')}<span class="count">${posts.length} of ${posts.length}</span></div>
  <div class="feed rv-group">${posts.map(feedCard).join('')}</div>
  <p class="empty" hidden>Nothing matches those filters yet.</p>
</div>`;
  return layout({ title: 'Activity', description: 'Every engagement, project, visit and message from Senator Abdulaziz Yari, organised by theme.', path: '/activity/', body, current: '/activity/' });
}

function post(p, i) {
  const ss = slots(p.code);
  const slides = ss.map(m => m.type === 'video'
    ? video(p.code, m.slot, { ratio: ratioClass(m), alt: altFor(p) })
    : media(p.code, m.slot, { ratio: ratioClass(ss[0]), sizes: '(max-width: 860px) 100vw, 58vw', alt: altFor(p), zoom: false, eager: m.slot === '0' })).join('');
  const carousel = ss.length > 1 ? `<div class="carousel" tabindex="0" aria-roledescription="carousel" aria-label="${ss.length} items"><div class="track">${slides}</div>
    <div class="arrows"><button class="prev" type="button" aria-label="Previous">${ic('arrow-left')}</button><button class="next" type="button" aria-label="Next">${ic('arrow-right')}</button></div>
    <div class="dots" aria-hidden="true">${ss.map((_, j) => `<i class="${j ? '' : 'on'}"></i>`).join('')}</div></div>` : slides;
  const prev = posts[i + 1], next = posts[i - 1];
  const body = `<div class="wrap"><article class="post">
  <div class="post-media">${carousel}</div>
  <div class="post-body">
    <div class="meta"><span class="cat"><a href="${u('/activity/?cat=' + encodeURIComponent(p.category))}">${esc(p.category)}</a></span><time datetime="${p.date}">${fmt(p.date)}</time>${p.location ? `<span>${ic('map-pin')} ${esc(p.location)}</span>` : ''}${p.collab ? `<span>Posted with <a href="https://www.instagram.com/${esc(p.author)}/" rel="noopener">@${esc(p.author)}</a></span>` : ''}</div>
    <h1 style="font-size:clamp(1.6rem,2.6vw,2.2rem)">${esc(firstSentence(p.caption) || 'Untitled')}</h1>
    <p class="caption">${linkify(p.caption ? p.caption.slice(firstSentence(p.caption).length).trim() : '')}</p>
    <div class="stats"><span><b class="num">${n(p.likes)}</b> likes</span><span><b class="num">${n(p.comments)}</b> comments</span></div>
    <div>${btn(p.url, 'View on Instagram', 'ghost')}</div>
    <nav class="post-nav" aria-label="Adjacent posts">${prev ? `<a class="btn btn-plain" href="${postHref(prev)}"><span class="ic">${ic('arrow-left')}</span>Earlier</a>` : '<span></span>'}${next ? `<a class="btn btn-plain" href="${postHref(next)}">Later<span class="ic">${ic('arrow-right')}</span></a>` : ''}</nav>
  </div>
</article></div>`;
  const first = ss[0];
  const image = first ? (first.type === 'video' ? `/media/${p.code}/${first.slot}-poster.jpg` : `/media/${p.code}/${first.slot}-1440.jpg`) : null;
  const jsonld = { '@context': 'https://schema.org', '@type': 'SocialMediaPosting', headline: firstSentence(p.caption).slice(0, 110), datePublished: p.datetime_utc, author: { '@type': 'Person', name: site.name }, url: abs(`/activity/${p.code}/`), sameAs: p.url, image: image ? abs(image) : undefined };
  return layout({ title: firstSentence(p.caption).slice(0, 70) || 'Post', description: (p.caption || '').replace(/\s+/g, ' ').slice(0, 160), path: `/activity/${p.code}/`, body, image, jsonld, current: '/activity/' });
}

function gallery() {
  const items = posts.flatMap(p => slots(p.code).filter(m => m.type === 'image').map(m => ({ p, m })));
  const body = `${pageHead('Gallery', 'In pictures', `${items.length} photographs from the Senator's official channels, newest first.`)}
<div class="wrap"><div class="masonry rv-group">${items.map(({ p, m }) => `<div class="frame hover-zoom" data-full="${src(p.code, m.slot, 1440)}" data-alt="${esc(altFor(p))}" data-caption="${esc(fmt(p.date))}" role="button" tabindex="0"><div class="media" style="background-image:url(${m.lqip});aspect-ratio:${m.w}/${m.h}"><img data-lazy="${src(p.code, m.slot, 360)}" data-srcset="${src(p.code, m.slot, 360)} 360w, ${src(p.code, m.slot, 720)} 720w" sizes="(max-width: 560px) 50vw, 25vw" width="${m.w}" height="${m.h}" alt="${esc(altFor(p))}" loading="lazy" decoding="async"></div></div>`).join('')}</div></div>
<dialog class="lightbox"><figure style="margin:0"><img alt=""><figcaption></figcaption></figure><button class="icon-btn close" type="button" aria-label="Close" style="color:#fff;background:rgb(255 255 255/.12)">${ic('x')}</button></dialog>`;
  return layout({ title: 'Gallery', description: 'Photographs of Senator Abdulaziz Yari at work in Zamfara, the Senate and across Nigeria.', path: '/gallery/', body, current: '/gallery/' });
}

function contact() {
  const c = site.contact;
  const body = `${pageHead('Contact', 'Get in touch', esc(c.intro))}
<div class="wrap contact">
  <div class="offices rv-group">${c.offices.map(o => `<div class="office"><h3>${esc(o.name)}</h3>${o.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`).join('')}
    <div class="office"><h3>Follow</h3><div class="social-row" style="margin-top:8px">${[['instagram-logo', site.instagram, 'Instagram'], ['x-logo', site.x, 'X'], ['facebook-logo', site.facebook, 'Facebook']].map(([i, h, l]) => `<a class="btn btn-ghost" href="${h}" rel="noopener">${l}<span class="ic">${ic(i)}</span></a>`).join('')}</div></div>
  </div>
  <form class="form rv" data-to="${esc(c.email)}" novalidate>
    <div class="field"><label for="f-name">Your name</label><input id="f-name" name="name" type="text" autocomplete="name" required></div>
    <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" required><small>So the office can reply.</small></div>
    <div class="field"><label for="f-subject">Subject</label><input id="f-subject" name="subject" type="text"></div>
    <div class="field"><label for="f-message">Message</label><textarea id="f-message" name="message" rows="6" required></textarea></div>
    <div><button class="btn btn-primary" type="submit">Send message<span class="ic">${ic('arrow-up-right')}</span></button></div>
    ${c.email ? '' : '<p class="note">Messages open in your email app until the office confirms its public address.</p>'}
  </form>
</div>`;
  return layout({ title: 'Contact', description: 'Contact the office of Senator Abdulaziz Yari.', path: '/contact/', body, current: '/contact/' });
}

const notFound = () => layout({ title: 'Page not found', path: '/404.html', body: `${pageHead('404', 'That page is not here', 'It may have moved. The activity feed has everything that has been published.')}<div class="wrap">${btn(u('/activity/'), 'Go to the activity feed')}</div>` });

function rss() {
  const items = posts.map(p => { const f = slots(p.code)[0]; return `<item><title>${esc(firstSentence(p.caption) || 'Post')}</title><link>${abs(`/activity/${p.code}/`)}</link><guid>${abs(`/activity/${p.code}/`)}</guid><pubDate>${new Date(p.datetime_utc).toUTCString()}</pubDate><category>${esc(p.category)}</category><description>${esc((p.caption || '').slice(0, 500))}</description>${f ? `<enclosure url="${abs(f.type === 'video' ? `/media/${p.code}/${f.slot}-poster.jpg` : `/media/${p.code}/${f.slot}-720.jpg`)}" type="image/jpeg" length="0"/>` : ''}</item>`; }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(site.name)}</title><link>${site.siteUrl}</link><description>${esc(site.description)}</description><language>en</language>\n${items}\n</channel></rss>`;
}
const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', ...site.nav.map(x => x[1]), ...posts.map(p => `/activity/${p.code}/`)].map(p => `<url><loc>${abs(p)}</loc></url>`).join('')}</urlset>`;

/* ---------- write ---------- */
const write = async (p, html) => { const f = join(OUT, p); await mkdir(dirname(f), { recursive: true }); await writeFile(f, html); };
await mkdir(OUT, { recursive: true });
await write('index.html', home());
await write('about/index.html', about());
await write('projects/index.html', projects());
await write('campaign/index.html', campaign());
await write('senate/index.html', senate());
await write('activity/index.html', activity());
for (const [i, p] of posts.entries()) await write(`activity/${p.code}/index.html`, post(p, i));
await write('gallery/index.html', gallery());
await write('contact/index.html', contact());
await write('404.html', notFound());
await write('feed.xml', rss());
await write('sitemap.xml', sitemap());
await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${abs('/sitemap.xml')}\n`);
await write('manifest.webmanifest', JSON.stringify({ name: site.name, short_name: site.shortName, start_url: u('/'), display: 'standalone', background_color: '#0c1511', theme_color: '#0c1511', icons: [{ src: u('/assets/apple-touch-icon.png'), sizes: '180x180', type: 'image/png' }] }));
await write('.nojekyll', '');
// assets: css/js get the base path baked in
await mkdir(join(OUT, 'assets'), { recursive: true });
const css = (await readFile(join(SRC, 'css', 'site.css'), 'utf8')).replaceAll('url("/assets/', `url("${BASE}/assets/`);
await writeFile(join(OUT, 'assets', 'site.css'), css);
await cp(join(SRC, 'js', 'site.js'), join(OUT, 'assets', 'site.js'));
await cp(join(SRC, 'assets', 'fonts'), join(OUT, 'assets', 'fonts'), { recursive: true });
for (const f of ['favicon.svg', 'apple-touch-icon.png']) await cp(join(SRC, 'assets', f), join(OUT, 'assets', f)).catch(() => console.warn('missing asset', f));
// media: expensive copy, only when absent or forced
const mediaOut = join(OUT, 'media');
if (process.env.MEDIA || !(await stat(mediaOut).catch(() => null))) {
  await rm(mediaOut, { recursive: true, force: true });
  await cp(join(ROOT, 'media', 'web'), mediaOut, { recursive: true, filter: s => !s.endsWith('-lqip.jpg') && !s.endsWith('manifest.json') });
}
console.log(`built ${posts.length} posts + ${site.nav.length + 1} pages → site/`);
