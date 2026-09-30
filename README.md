# Senator Yari · official website

Static site for Senator Abdulaziz Abubakar Yari (Marafan Sokoto). Every page is generated from his Instagram record plus a small hand-written data file, so keeping the site current is a data refresh, not a redesign.

```
research/instagram-posts.json   ← captured from @senatoraayari (98 posts, categorised)
src/data/site.json              ← copy, projects, campaign stops, senate record, contact
src/data/nigeria-paths.json     ← state outlines (geoBoundaries ADM1, projected + simplified)
src/css/site.css · src/js/site.js · src/assets/{fonts,icons}
tools/fetch-media.mjs           ← downloads originals from the CDN links in the research JSON
tools/process-media.mjs         ← ffmpeg: 1440/720/360 JPEGs, 720p MP4s, posters, 24px LQIPs → media/web + manifest
tools/build.mjs                 ← renders site/ (home, about, projects, campaign, senate, activity, 98 post pages, gallery, contact, RSS, sitemap)
site/                           ← the deployable output (GitHub Pages root)
```

## Run

```bash
npm run fetch      # media/originals (skips files already present)
npm run media      # media/web + manifest.json (idempotent, needs Homebrew ffmpeg)
npm run build      # site/ with root-relative links for local preview
npm run serve      # http://localhost:8787
npm run build:pages   # BASE=/senator-yari for project-page hosting; MEDIA=1 refreshes site/media
```

Node 20+ and ffmpeg/ffprobe at `/opt/homebrew/bin`. No npm dependencies.

## Updating the site

1. Re-capture the Instagram grid into `research/instagram-posts.json` (see `research/instagram-report.md` for the capture recipe).
2. `npm run update` downloads only the new media, transcodes only what is missing and rebuilds every page.
3. Add any new campaign stops or projects to `src/data/site.json`; the map lights states from `campaign.states`.
4. Commit `site/` and push.

## How the front end works

- Progressive enhancement: every page reads and navigates without JavaScript. `site.js` adds the theme toggle, mobile menu, reveal-on-enter, lazy images, click-to-play video, carousel arrows, feed filters (state kept in the URL), the gallery lightbox and the map hover link.
- Performance: fonts are self-hosted variable woff2 subsets; every image ships a 24px inline placeholder and `srcset` at three widths; videos never load until played; the hero is the only eagerly loaded image; cross-document view transitions are declared in CSS.
- Accessibility: skip link, landmarks, `aria-current`, focus rings, `prefers-reduced-motion` disables all motion, `prefers-reduced-transparency` removes blur, light and dark themes both meet AA contrast.
- SEO: canonical URLs, Open Graph, JSON-LD Person on the home page and SocialMediaPosting on every post, `sitemap.xml`, `feed.xml` (RSS of the activity feed), `robots.txt`.
