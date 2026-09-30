/* Senator Yari · client script. Progressive enhancement only: every page works without it. */
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* theme: explicit choice wins, otherwise the OS decides */
  const themeBtn = $('.theme-btn');
  const applyTheme = t => { t ? root.setAttribute('data-theme', t) : root.removeAttribute('data-theme'); };
  try { applyTheme(localStorage.getItem('theme')); } catch {}
  themeBtn?.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('theme', next); } catch {}
  });

  /* mobile menu */
  const menuBtn = $('.menu-btn'), menu = $('.menu');
  const setMenu = open => {
    menuBtn.setAttribute('aria-expanded', open);
    open ? menu.setAttribute('data-open', '') : menu.removeAttribute('data-open');
    document.body.style.overflow = open ? 'hidden' : '';
  };
  menuBtn?.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
  menu?.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && menu?.hasAttribute('data-open')) setMenu(false); });

  /* reveal on enter */
  if (!reduced && 'IntersectionObserver' in window) {
    // threshold 0: tall groups (the 98-card feed) never reach a ratio threshold, so any visible pixel counts
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0 });
    $$('.rv, .rv-group').forEach(el => io.observe(el));
  } else $$('.rv, .rv-group').forEach(el => el.classList.add('in'));

  /* lazy images: swap in src when near the viewport; LQIP already painted as background */
  const lazy = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const img = e.target;
    img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
    if (img.dataset.srcset) img.srcset = img.dataset.srcset;
    img.src = img.dataset.lazy; img.removeAttribute('data-lazy'); lazy.unobserve(img);
  }), { rootMargin: '400px 0px' });
  $$('img[data-lazy]').forEach(img => lazy.observe(img));

  /* hero video: only load when the tab is visible and motion is allowed; mute toggle */
  const heroVideo = $('.hero-media video');
  if (heroVideo) {
    if (reduced) heroVideo.remove();
    else {
      heroVideo.src = heroVideo.dataset.src; heroVideo.removeAttribute('data-src');
      heroVideo.play().catch(() => {});
      const mute = $('.hero-mute');
      mute?.addEventListener('click', () => { heroVideo.muted = !heroVideo.muted; mute.setAttribute('aria-pressed', !heroVideo.muted); });
      const vis = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? heroVideo.play().catch(() => {}) : heroVideo.pause()));
      vis.observe(heroVideo);
    }
  }

  /* click-to-play videos (stories, feed, post pages): one at a time */
  let current = null;
  $$('.media[data-video]').forEach(box => {
    const btn = $('.play', box), video = $('video', box);
    if (!btn || !video) return;
    btn.addEventListener('click', () => {
      if (current && current !== video) { current.pause(); current.closest('.media').classList.remove('playing'); }
      if (video.dataset.src) { video.src = video.dataset.src; video.removeAttribute('data-src'); }
      video.style.display = '';
      box.classList.add('playing'); video.play(); current = video;
    });
    video.addEventListener('ended', () => { box.classList.remove('playing'); video.style.display = 'none'; });
    video.addEventListener('pause', () => { if (video.ended) return; });
  });

  /* carousel: arrows + dots driven by scroll-snap */
  $$('.carousel').forEach(c => {
    const track = $('.track', c), slides = $$(':scope > *', track), dots = $$('.dots i', c);
    if (slides.length < 2) return;
    const go = d => { const i = Math.round(track.scrollLeft / track.clientWidth) + d; track.scrollTo({ left: Math.max(0, Math.min(slides.length - 1, i)) * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' }); };
    $('.prev', c)?.addEventListener('click', () => go(-1));
    $('.next', c)?.addEventListener('click', () => go(1));
    const sync = () => { const i = Math.round(track.scrollLeft / track.clientWidth); dots.forEach((d, j) => d.classList.toggle('on', j === i)); };
    track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    c.addEventListener('keydown', e => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); });
  });

  /* activity filters: category (multi) + year (single) */
  const feed = $('.feed');
  if (feed) {
    const cards = $$('article', feed), count = $('.filters .count'), empty = $('.empty');
    const state = { cats: new Set(), year: null };
    const apply = () => {
      let n = 0;
      cards.forEach(a => { const ok = (!state.cats.size || state.cats.has(a.dataset.cat)) && (!state.year || a.dataset.year === state.year); a.hidden = !ok; if (ok) n++; });
      if (count) count.textContent = `${n} of ${cards.length}`;
      if (empty) empty.hidden = n > 0;
      const u = new URL(location); u.searchParams.delete('cat'); u.searchParams.delete('year');
      state.cats.forEach(c => u.searchParams.append('cat', c)); if (state.year) u.searchParams.set('year', state.year);
      history.replaceState(null, '', u);
    };
    $$('.chip[data-cat]').forEach(b => b.addEventListener('click', () => { const c = b.dataset.cat; state.cats.has(c) ? state.cats.delete(c) : state.cats.add(c); b.setAttribute('aria-pressed', state.cats.has(c)); apply(); }));
    $$('.chip[data-year]').forEach(b => b.addEventListener('click', () => { state.year = state.year === b.dataset.year ? null : b.dataset.year; $$('.chip[data-year]').forEach(x => x.setAttribute('aria-pressed', x.dataset.year === state.year)); apply(); }));
    const q = new URL(location).searchParams;
    q.getAll('cat').forEach(c => { const b = $(`.chip[data-cat="${CSS.escape(c)}"]`); if (b) { state.cats.add(c); b.setAttribute('aria-pressed', 'true'); } });
    if (q.get('year')) { state.year = q.get('year'); $(`.chip[data-year="${state.year}"]`)?.setAttribute('aria-pressed', 'true'); }
    apply();
  }

  /* gallery lightbox: native dialog, arrow keys */
  const lb = $('.lightbox');
  if (lb) {
    const items = $$('.masonry .frame'), img = $('img', lb), cap = $('figcaption', lb);
    let i = 0;
    const show = n => { i = (n + items.length) % items.length; const src = items[i].dataset.full; img.src = src; img.alt = items[i].dataset.alt || ''; cap.textContent = items[i].dataset.caption || ''; };
    items.forEach((el, n) => el.addEventListener('click', () => { show(n); lb.showModal(); }));
    $('.close', lb).addEventListener('click', () => lb.close());
    lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
    lb.addEventListener('keydown', e => { if (e.key === 'ArrowRight') show(i + 1); if (e.key === 'ArrowLeft') show(i - 1); });
    let x0 = 0; lb.addEventListener('touchstart', e => x0 = e.touches[0].clientX, { passive: true });
    lb.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1)); });
  }

  /* campaign map: hovering a stop lights its state */
  const map = $('.map');
  if (map) {
    $$('.stop').forEach(s => {
      const p = $(`path[data-state="${CSS.escape(s.dataset.state)}"]`, map);
      const on = () => { s.classList.add('active'); p?.classList.add('active'); };
      const off = () => { s.classList.remove('active'); p?.classList.remove('active'); };
      s.addEventListener('mouseenter', on); s.addEventListener('mouseleave', off); s.addEventListener('focusin', on); s.addEventListener('focusout', off);
    });
  }

  /* contact form: no backend yet, so compose an email */
  const form = $('.form');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const d = new FormData(form);
    const to = form.dataset.to || '';
    const body = encodeURIComponent(`${d.get('message')}\n\n${d.get('name')}\n${d.get('email')}`);
    location.href = `mailto:${to}?subject=${encodeURIComponent(d.get('subject') || 'Message from the website')}&body=${body}`;
  });
})();
