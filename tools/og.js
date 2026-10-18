#!/usr/bin/env node
/*
 * Génère les images d'aperçu des articles « Conseils » (assets/img/og/<article>.jpg, 1200 × 630),
 * affichées quand un article est partagé sur Discord, X, WhatsApp…
 *
 * Usage : node tools/og.js            (toutes les images)
 *         node tools/og.js <article>  (une seule)
 * Nécessite Playwright (npm i -D playwright). Relancer ensuite python3 tools/build.py.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'http://og.local/';
const OUT = path.join(ROOT, 'assets', 'img', 'og');
const TYPES = { '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };

const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const icon = id => {
  const m = home.match(new RegExp(`<symbol id="${id}" viewBox="([^"]+)">(.*?)</symbol>`));
  return m ? `<svg viewBox="${m[1]}">${m[2]}</svg>` : '';
};
const typo = text => text.replace(/ ([:;?!])/g, '&nbsp;$1');

function readArticle(file) {
  const raw = fs.readFileSync(path.join(ROOT, 'tools', 'articles', file), 'utf8');
  return JSON.parse(raw.match(/<!--([\s\S]*?)-->/)[1]);
}

function page(meta) {
  const avatars = (meta.og_avatars || []).map(src => `<img src="${ORIGIN}${src}" alt="">`).join('');
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<style>
@font-face { font-family: "Bricolage"; src: url("${ORIGIN}assets/fonts/bricolage.woff2") format("woff2"); font-weight: 200 800; }
@font-face { font-family: "Inter"; src: url("${ORIGIN}assets/fonts/inter.woff2") format("woff2"); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body { position: relative; background: #07080c; color: #eef0f8; font-family: Inter, sans-serif; }
.blob { position: absolute; border-radius: 50%; }
.b1 { width: 900px; height: 900px; left: -380px; top: -520px; background: radial-gradient(closest-side, rgba(139,155,255,.42), transparent); }
.b2 { width: 800px; height: 800px; right: -300px; top: -260px; background: radial-gradient(closest-side, rgba(195,166,255,.28), transparent); }
.b3 { width: 760px; height: 760px; right: 80px; bottom: -560px; background: radial-gradient(closest-side, rgba(110,231,255,.18), transparent); }
.grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px); background-size: 60px 60px; -webkit-mask-image: radial-gradient(ellipse 75% 75% at 30% 35%, #000 20%, transparent 80%); }
.wrap { position: absolute; inset: 0; padding: 60px 72px 58px; display: flex; flex-direction: column; }
.head { display: flex; align-items: center; gap: 16px; }
.av { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,.25); }
.name { font-family: Bricolage; font-weight: 700; font-size: 28px; letter-spacing: -.02em; }
.pill { margin-left: 6px; padding: 8px 16px; border-radius: 999px; border: 1px solid rgba(139,155,255,.4); background: rgba(139,155,255,.1); font-size: 15px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #8b9bff; }
.bots { margin-left: auto; display: flex; }
.bots img { width: 64px; height: 64px; border-radius: 50%; border: 4px solid #07080c; margin-left: -14px; object-fit: cover; }
h1 { position: relative; margin-top: auto; font-family: Bricolage; font-weight: 700; font-size: 66px; line-height: 1.03; letter-spacing: -.04em; max-width: 860px; text-wrap: balance; }
.deco { position: absolute; right: 64px; top: 190px; width: 230px; height: 230px; color: #8b9bff; opacity: .16; transform: rotate(-8deg); }
.deco svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.foot { margin-top: 44px; display: flex; align-items: center; gap: 18px; font-size: 21px; color: #9ba3ba; }
.ico { width: 60px; height: 60px; border-radius: 18px; display: grid; place-items: center; color: #8b9bff; background: rgba(139,155,255,.1); border: 1px solid rgba(139,155,255,.3); }
.ico svg { width: 28px; height: 28px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.foot b { color: #eef0f8; font-weight: 600; }
.url { margin-left: auto; font-weight: 600; background: linear-gradient(110deg, #8b9bff, #c3a6ff 50%, #6ee7ff); -webkit-background-clip: text; color: transparent; }
</style></head>
<body>
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="grid"></div>
  <div class="deco">${icon(meta.icon)}</div>
  <div class="wrap">
    <div class="head">
      <img class="av" src="${ORIGIN}assets/img/profile.jpg" alt="">
      <span class="name">Mvrius</span>
      <span class="pill">Conseils</span>
      ${avatars ? `<span class="bots">${avatars}</span>` : ''}
    </div>
    <h1>${typo(meta.title)}</h1>
    <div class="foot">
      <span class="ico">${icon(meta.icon)}</span>
      <span><b>${meta.tag}</b> · ${meta.read} de lecture</span>
      <span class="url">mvriuus.fr/conseils</span>
    </div>
  </div>
</body></html>`;
}

(async () => {
  const only = process.argv[2];
  const files = fs.readdirSync(path.join(ROOT, 'tools', 'articles'))
    .filter(f => f.endsWith('.html') && (!only || f === `${only}.html`));
  if (!files.length) throw new Error(`Article introuvable : ${only}`);
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  let html = '';
  // Le site est servi depuis une fausse adresse pour que les polices et images se chargent
  await p.route(`${ORIGIN}**`, route => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    if (rel === '__og.html') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    route.fulfill({ contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  for (const file of files) {
    const slug = file.replace(/\.html$/, '');
    html = page(readArticle(file));
    await p.goto(`${ORIGIN}__og.html`);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(OUT, `${slug}.jpg`), type: 'jpeg', quality: 86 });
    console.log(`assets/img/og/${slug}.jpg`);
  }
  await browser.close();
})();
