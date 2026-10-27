/* ==========================================================================
   Agenda de Mvrius — ouverture sans réseau (service worker)
   La page et ses fichiers (styles, scripts, icônes, polices) sont gardés sur
   l'appareil. Les rendez-vous, eux, sont déjà gardés par app.js (stockage
   local) et les changements faits hors ligne partent au retour du réseau.
   Rien d'autre n'est intercepté : le serveur de l'agenda (workers.dev) et
   GitHub passent toujours directement par le réseau.
   ========================================================================== */
const CACHE = 'agenda-hors-ligne-1';
const PAGE = new URL('./', self.location).href;

// Fichiers du même site chargés par la page (<link href="…">, <script src="…">), pas les simples liens
function fichiersDe(html) {
  const liens = [...html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)="([^"#]+)"/g)].map(m => new URL(m[1], PAGE));
  return [...new Set(liens.filter(u => u.origin === self.location.origin && !u.pathname.endsWith('/agenda/')).map(u => u.href))];
}

// Garde la page et tous ses fichiers ; retire les anciennes versions des fichiers (même fichier, autre ?v=…)
async function garder(rep) {
  const cache = await caches.open(CACHE);
  const html = await rep.clone().text();
  await cache.put(PAGE, rep.clone());
  const fichiers = fichiersDe(html);
  await Promise.all(fichiers.map(async url => {
    if (await cache.match(url)) return;
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (r.ok) await cache.put(url, r);
    } catch (e) { /* hors ligne : on réessaiera à la prochaine ouverture */ }
  }));
  const voulus = new Set([PAGE, ...fichiers]);
  const chemins = new Set(fichiers.map(u => new URL(u).pathname));
  for (const req of await cache.keys()) if (!voulus.has(req.url) && chemins.has(new URL(req.url).pathname)) await cache.delete(req);
}

self.addEventListener('install', e => {
  e.waitUntil(fetch(PAGE, { cache: 'no-cache' }).then(r => (r.ok ? garder(r) : null)).catch(() => null).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const nom of await caches.keys()) if (nom !== CACHE) await caches.delete(nom);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // serveur de l'agenda, Discord… : toujours le réseau

  // La page : le réseau d'abord (dernière version), sinon la copie gardée
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const rep = await fetch(req);
        if (rep.ok && url.pathname.replace(/index\.html$/, '') === new URL(PAGE).pathname) e.waitUntil(garder(rep.clone()));
        return rep;
      } catch (err) {
        return (await caches.match(PAGE)) || Response.error();
      }
    })());
    return;
  }

  // Les fichiers : la copie gardée tout de suite (ils changent de nom à chaque version), sinon le réseau
  e.respondWith((async () => {
    const garde = await caches.match(req);
    if (garde) return garde;
    const rep = await fetch(req);
    if (rep.ok) {
      const copie = rep.clone();
      e.waitUntil(caches.open(CACHE).then(c => c.put(req, copie)));
    }
    return rep;
  })());
});
