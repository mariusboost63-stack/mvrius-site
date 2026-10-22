/* ==========================================================================
   Agenda de Mvrius — serveur de connexion (Cloudflare Worker)

   - Connexion avec Discord : un seul compte est accepté (DISCORD_ID_AUTORISE).
   - Donne à la page mvriuus.fr/agenda/ un jeton de session signé (30 jours).
   - Sert d'intermédiaire avec le dépôt GitHub PRIVÉ « agenda-donnees » : la clé
     GitHub reste ici, jamais dans le navigateur.
   - Rappels : un Cron Trigger toutes les 5 minutes (voir le README) envoie un
     message privé Discord avant chaque rendez-vous, et le résumé du matin.

   Variables à créer dans Cloudflare (Worker › Settings › Variables and Secrets) :
     DISCORD_CLIENT_ID      texte   identifiant de l'application Discord
     DISCORD_CLIENT_SECRET  secret  secret de l'application Discord
     DISCORD_ID_AUTORISE    texte   ton identifiant Discord (le seul compte accepté)
     GITHUB_TOKEN           secret  jeton GitHub limité au dépôt agenda-donnees
                                    (Contents : Read and write)
     DISCORD_BOT_TOKEN      secret  token du bot de l'application Discord (rappels)
   Facultatif : PAGE (adresse de l'agenda, par défaut https://mvriuus.fr/agenda/)

   Changer DISCORD_CLIENT_SECRET ou GITHUB_TOKEN déconnecte tous les appareils.
   ========================================================================== */

const DEPOT = 'mariusboost63-stack/agenda-donnees';
const FICHIER = 'agenda.json';
const PAGE_PAR_DEFAUT = 'https://mvriuus.fr/agenda/';
const DUREE_SESSION = 30 * 24 * 3600; // secondes
const PERIODE = 5 * 60 * 1000; // intervalle du Cron Trigger, en millisecondes

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const page = env.PAGE || PAGE_PAR_DEFAUT;
    const origine = new URL(page).origin;
    try {
      if (url.pathname === '/connexion' && req.method === 'GET') return connexion(url, env);
      if (url.pathname === '/retour' && req.method === 'GET') return await retour(req, url, env, page);
      if (url.pathname === '/depot' || url.pathname === `/depot/contents/${FICHIER}`) {
        if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origine);
        return cors(await depot(req, url, env), origine);
      }
      if (url.pathname === '/rappels/test') {
        if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origine);
        return cors(await rappelTest(req, env, page), origine);
      }
      return new Response("Serveur de l'agenda de Mvrius.", { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch (e) {
      return cors(json({ message: 'Erreur du serveur.' }, 500), origine);
    }
  },
  // Cron Trigger : rappels dus depuis le passage précédent (le résultat apparaît dans les logs)
  async scheduled(evenement, env, ctx) {
    ctx.waitUntil(envoyerRappels(evenement.scheduledTime, env, env.PAGE || PAGE_PAR_DEFAUT)
      .then(n => console.log(`Rappels : ${n} message(s) envoyé(s)`))
      .catch(e => console.error(`Rappels : échec — ${e.message}`)));
  },
};

/* ---------- Connexion Discord ---------- */
function connexion(url, env) {
  const etat = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    scope: 'identify',
    redirect_uri: `${url.origin}/retour`,
    state: etat,
    prompt: 'none', // pas d'écran de confirmation si l'accès a déjà été donné
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://discord.com/oauth2/authorize?${params}`,
      'Set-Cookie': `etat=${etat}; Path=/retour; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store',
    },
  });
}

async function retour(req, url, env, page) {
  const vers = fragment => new Response(null, {
    status: 302,
    headers: {
      Location: `${page}#${fragment}`,
      'Set-Cookie': 'etat=; Path=/retour; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
  if (url.searchParams.get('error')) return vers('erreur=annule');
  const cookie = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)etat=([^;]+)/);
  const code = url.searchParams.get('code');
  if (!code || !cookie || cookie[1] !== url.searchParams.get('state')) return vers('erreur=etat');

  const reponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${url.origin}/retour`,
    }),
  });
  if (!reponse.ok) return vers('erreur=discord');
  const { access_token: jetonDiscord } = await reponse.json();
  const moi = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${jetonDiscord}` } });
  // Le jeton Discord ne sert qu'à lire l'identité : on le révoque tout de suite
  await fetch('https://discord.com/api/oauth2/token/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: jetonDiscord, client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET }),
  }).catch(() => {});
  if (!moi.ok) return vers('erreur=discord');
  const compte = await moi.json();
  if (!compte.id || compte.id !== String(env.DISCORD_ID_AUTORISE || '').trim()) return vers('erreur=refuse');

  const session = await signer({
    id: compte.id,
    nom: compte.global_name || compte.username,
    avatar: compte.avatar || null,
    exp: Math.floor(Date.now() / 1000) + DUREE_SESSION,
  }, env);
  return vers(`session=${session}`);
}

/* ---------- Accès au dépôt privé ---------- */
async function depot(req, url, env) {
  const session = await verifier((req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), env);
  if (!session) return json({ message: 'Session expirée.' }, 401);

  const chemin = url.pathname.slice('/depot'.length);
  let corps;
  if (req.method === 'GET') {
    corps = undefined;
  } else if (req.method === 'PUT' && chemin) {
    const recu = await req.json();
    if (typeof recu.message !== 'string' || typeof recu.content !== 'string') return json({ message: 'Requête invalide.' }, 400);
    corps = JSON.stringify({
      message: recu.message.slice(0, 200),
      content: recu.content,
      ...(recu.sha ? { sha: String(recu.sha) } : {}),
      ...(recu.branch ? { branch: String(recu.branch) } : {}),
    });
  } else {
    return json({ message: 'Méthode refusée.' }, 405);
  }
  const ref = url.searchParams.get('ref');
  const cible = `https://api.github.com/repos/${DEPOT}${chemin}${req.method === 'GET' && ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
  const rep = await fetch(cible, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'agenda-mvrius',
      ...(corps ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corps,
  });
  // 401 de GitHub : c'est la clé GitHub du serveur qui est refusée, pas la session
  if (rep.status === 401) return json({ message: 'GitHub refuse la clé GITHUB_TOKEN du serveur (expirée ?).' }, 502);
  return new Response(rep.body, { status: rep.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/* ---------- Jetons de session signés (HMAC-SHA256) ---------- */
const encodeur = new TextEncoder();
const b64url = octets => btoa(String.fromCharCode(...new Uint8Array(octets))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function cleSession(env) {
  // Dérivée des deux secrets déjà présents : pas de variable de plus à créer
  const brut = await crypto.subtle.digest('SHA-256', encodeur.encode(`agenda|${env.DISCORD_CLIENT_SECRET}|${env.GITHUB_TOKEN}`));
  return crypto.subtle.importKey('raw', brut, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signer(donnees, env) {
  const charge = b64url(encodeur.encode(JSON.stringify(donnees)));
  const signature = await crypto.subtle.sign('HMAC', await cleSession(env), encodeur.encode(charge));
  return `${charge}.${b64url(signature)}`;
}
async function verifier(jeton, env) {
  const [charge, signature] = String(jeton || '').split('.');
  if (!charge || !signature) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await cleSession(env), deB64url(signature), encodeur.encode(charge)))) return null;
    const donnees = JSON.parse(new TextDecoder().decode(deB64url(charge)));
    if (!donnees.exp || donnees.exp < Date.now() / 1000) return null;
    if (donnees.id !== String(env.DISCORD_ID_AUTORISE || '').trim()) return null;
    return donnees;
  } catch (e) {
    return null;
  }
}

/* ---------- Outils ---------- */
function json(objet, status) {
  return new Response(JSON.stringify(objet), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function cors(rep, origine) {
  const r = new Response(rep.body, rep);
  r.headers.set('Access-Control-Allow-Origin', origine);
  r.headers.set('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  r.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-GitHub-Api-Version');
  r.headers.set('Access-Control-Max-Age', '86400');
  r.headers.set('Vary', 'Origin');
  return r;
}

/* ---------- Rappels Discord ---------- */
// Rappel par défaut quand la fiche n'en précise pas : 15 min avant, ou 9:00 le jour même
// pour une journée entière. En minutes avant le début (négatif = après minuit le jour même).
const rappelDe = r => (r.rappel === undefined ? (r.journee ? -540 : 15) : Number.isFinite(r.rappel) ? r.rappel : null);

async function envoyerRappels(t, env, page) {
  const donnees = await lireAgenda(env);
  const apres = t - PERIODE;
  const auj = jourParis(t);
  const messages = [];
  for (const r of donnees.rendezvous || []) {
    const avant = rappelDe(r);
    if (avant === null || r.statut === 'annule' || !DATE.test(r.date)) continue;
    const modifie = Date.parse(r.modifie || '') || 0;
    for (const d of debuts(r, decale(auj, -2), decale(auj, 3))) {
      const debut = parisVersUtc(d, r.journee ? '00:00' : r.debut);
      const instant = debut - avant * 60000;
      if (instant > apres && instant <= t) messages.push(messageRappel(r, d, avant, donnees, page, auj));
      // Créé ou modifié après l'heure de son rappel, mais pas encore commencé : rappel tout de suite
      else if (instant <= apres && debut > t && modifie > instant && modifie > apres && modifie <= t) {
        messages.push(messageRappel(r, d, Math.max(1, Math.round((debut - t) / 60000)), donnees, page, auj));
      }
    }
  }
  // Résumé du matin
  const resume = donnees.reglages && donnees.reglages.resume;
  if (resume && resume.actif) {
    const instant = parisVersUtc(auj, HEURE.test(resume.heure) ? resume.heure : '08:00');
    if (instant > apres && instant <= t) {
      const message = messageResume(donnees, auj, page);
      if (message) messages.push(message);
    }
  }
  if (!messages.length) return 0;
  // Discord demande qu'un bot se soit connecté au Gateway avant d'envoyer des messages
  await connecterBot(env).catch(() => {});
  for (const m of messages) await envoyerMp(env, m);
  return messages.length;
}

// Prochain rappel prévu (pour le message test)
function prochainRappel(donnees, t) {
  const auj = jourParis(t);
  let prochain = null;
  for (const r of donnees.rendezvous || []) {
    const avant = rappelDe(r);
    if (avant === null || r.statut === 'annule' || !DATE.test(r.date)) continue;
    for (const d of debuts(r, auj, decale(auj, 8))) {
      const instant = parisVersUtc(d, r.journee ? '00:00' : r.debut) - avant * 60000;
      if (instant > t && (!prochain || instant < prochain.instant)) prochain = { r, instant };
    }
  }
  if (!prochain) return 'Aucun rappel prévu dans les 7 prochains jours.';
  const p = morceaux(prochain.instant);
  return `Prochain rappel : « ${prochain.r.titre || 'Rendez-vous'} », ${jourTexte(jourParis(prochain.instant))} à ${p.hour}:${p.minute}.`;
}

async function rappelTest(req, env, page) {
  if (req.method !== 'POST') return json({ message: 'Méthode refusée.' }, 405);
  const session = await verifier((req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), env);
  if (!session) return json({ message: 'Session expirée.' }, 401);
  if (!env.DISCORD_BOT_TOKEN) return json({ message: 'Ajoute le token du bot (DISCORD_BOT_TOKEN) dans Cloudflare.' }, 400);
  try {
    // Discord demande qu'un bot se soit connecté au moins une fois avant d'envoyer des messages
    await connecterBot(env);
    const prochain = prochainRappel(await lireAgenda(env), Date.now());
    await envoyerMp(env, {
      embeds: [{
        title: 'Les rappels de ton agenda fonctionnent ✅',
        description: `Tu recevras ici un message avant chaque rendez-vous.\n\n${prochain}`,
        url: page,
        color: 0x8b9bff,
      }],
    });
    return json({ ok: true, prochain }, 200);
  } catch (e) {
    return json({ message: e.message }, 502);
  }
}

async function lireAgenda(env) {
  const rep = await fetch(`https://api.github.com/repos/${DEPOT}/contents/${FICHIER}`, {
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'agenda-mvrius' },
  });
  if (rep.status === 404) return { rendezvous: [] };
  if (!rep.ok) throw new Error(`GitHub a répondu ${rep.status}`);
  const { content } = await rep.json();
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g, '')), c => c.charCodeAt(0))));
}

async function envoyerMp(env, message) {
  const entetes = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (https://mvriuus.fr/agenda/, 1.0)' };
  const salon = await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers: entetes, body: JSON.stringify({ recipient_id: String(env.DISCORD_ID_AUTORISE).trim() }) });
  if (salon.status === 401) throw new Error('Discord refuse le token du bot (DISCORD_BOT_TOKEN).');
  if (!salon.ok) throw new Error(`Discord refuse d'ouvrir la conversation privée (${salon.status}).`);
  const { id } = await salon.json();
  const rep = await fetch(`https://discord.com/api/v10/channels/${id}/messages`, { method: 'POST', headers: entetes, body: JSON.stringify(message) });
  if (!rep.ok) {
    const erreur = await rep.json().catch(() => ({}));
    if (erreur.code === 50007) throw new Error("Le bot ne peut pas t'écrire : invite-le sur un serveur où tu es, et autorise les messages privés des membres de ce serveur.");
    throw new Error(`Discord a refusé le message (${rep.status}).`);
  }
}

// Connexion au Gateway puis déconnexion (une fois suffit, mais la refaire ne gêne pas)
async function connecterBot(env) {
  const rep = await fetch('https://gateway.discord.gg/?v=10&encoding=json', { headers: { Upgrade: 'websocket' } });
  const ws = rep.webSocket;
  if (!ws) throw new Error('Connexion au Gateway Discord impossible.');
  ws.accept();
  await new Promise((ok, echec) => {
    const minuteur = setTimeout(() => { try { ws.close(); } catch (e) { /* déjà fermé */ } echec(new Error('Le Gateway Discord ne répond pas.')); }, 10000);
    const fin = (erreur) => { clearTimeout(minuteur); try { ws.close(1000, 'ok'); } catch (e) { /* déjà fermé */ } erreur ? echec(erreur) : ok(); };
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.op === 10) ws.send(JSON.stringify({ op: 2, d: { token: env.DISCORD_BOT_TOKEN, intents: 0, properties: { os: 'linux', browser: 'agenda-mvrius', device: 'agenda-mvrius' } } }));
      else if (m.op === 0 && m.t === 'READY') fin();
      else if (m.op === 9) fin(new Error('Discord refuse le token du bot (DISCORD_BOT_TOKEN).'));
    });
    ws.addEventListener('close', ev => { if (ev.code === 4004) fin(new Error('Discord refuse le token du bot (DISCORD_BOT_TOKEN).')); });
  });
}

/* ---------- Messages ---------- */
const COULEUR_PAR_DEFAUT = 0x8b9bff;
const couleurDe = (donnees, r) => {
  const c = (donnees.categories || []).find(x => x.id === r.categorie);
  return c && /^#[0-9a-f]{6}$/i.test(c.couleur) ? parseInt(c.couleur.slice(1), 16) : COULEUR_PAR_DEFAUT;
};
const jourTexte = d => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${d}T12:00:00Z`));
const dansTexte = m => (m <= 0 ? 'Maintenant' : m < 60 ? `Dans ${m} min` : m < 1440 ? `Dans ${m / 60} h` : m === 1440 ? 'Demain' : `Dans ${Math.round(m / 1440)} jours`);
const coupe = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

function horaire(r, d) {
  const dernier = decale(d, Math.max(0, ecart(r.date, DATE.test(r.dateFin) && r.dateFin > r.date ? r.dateFin : r.date)));
  if (r.journee) return dernier === d ? 'toute la journée' : `jusqu'au ${jourTexte(dernier)}`;
  return dernier === d ? `${r.debut} – ${r.fin}` : `${r.debut} → ${jourTexte(dernier)} ${r.fin}`;
}

function messageRappel(r, d, avant, donnees, page, auj) {
  const quand = r.journee
    ? (d === auj ? "Aujourd'hui" : d === decale(auj, 1) ? 'Demain' : jourTexte(d))
    : dansTexte(avant);
  const champs = [];
  if (r.avec) champs.push({ name: 'Avec', value: coupe(r.avec, 1024), inline: true });
  if (r.lieu) champs.push({ name: 'Lieu', value: coupe(r.lieu, 1024), inline: true });
  if (r.notes) champs.push({ name: 'Notes', value: coupe(r.notes, 1024) });
  return {
    embeds: [{
      title: coupe(`⏰ ${r.titre || 'Rendez-vous'}`, 256),
      description: `**${quand}** · ${jourTexte(d)}, ${horaire(r, d)}`,
      url: page,
      color: couleurDe(donnees, r),
      fields: champs,
    }],
  };
}

function messageResume(donnees, auj, page) {
  const lignes = [];
  for (const r of donnees.rendezvous || []) {
    if (r.statut === 'annule' || !DATE.test(r.date)) continue;
    const etendue = Math.max(0, ecart(r.date, DATE.test(r.dateFin) && r.dateFin > r.date ? r.dateFin : r.date));
    for (const d of debuts(r, decale(auj, -etendue), auj)) {
      lignes.push({ cle: r.journee ? '' : d < auj ? '' : r.debut, texte: `${r.journee || d < auj ? '🗓️ Toute la journée' : `**${r.debut}**`} · ${r.titre || 'Rendez-vous'}${r.avec ? ` (avec ${r.avec})` : ''}` });
    }
  }
  if (!lignes.length) return null;
  lignes.sort((a, b) => a.cle.localeCompare(b.cle));
  return {
    embeds: [{
      title: `☀️ Ta journée du ${jourTexte(auj)}`,
      description: coupe(lignes.map(l => l.texte).join('\n'), 4000),
      url: page,
      color: COULEUR_PAR_DEFAUT,
      footer: { text: `${lignes.length} rendez-vous` },
    }],
  };
}

/* ---------- Dates (heure de Paris) ---------- */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;
const PAS = { jour: 1, semaine: 7, '2semaines': 14 };
const versDate = s => { const [a, m, j] = s.split('-').map(Number); return new Date(Date.UTC(a, m - 1, j)); };
const versTexte = d => d.toISOString().slice(0, 10);
const decale = (s, n) => { const d = versDate(s); d.setUTCDate(d.getUTCDate() + n); return versTexte(d); };
const ecart = (a, b) => Math.round((versDate(b) - versDate(a)) / 864e5);
const parisFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const morceaux = t => Object.fromEntries(parisFormat.formatToParts(new Date(t)).map(p => [p.type, p.value]));
const jourParis = t => { const p = morceaux(t); return `${p.year}-${p.month}-${p.day}`; };
function decalageParis(t) {
  const p = morceaux(t);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}
// « 2026-10-22 » + « 14:00 » à Paris → instant UTC (gère l'heure d'été)
function parisVersUtc(date, h) {
  const [a, m, j] = date.split('-').map(Number);
  const [hh, mm] = h.split(':').map(Number);
  const local = Date.UTC(a, m - 1, j, hh, mm);
  const t = local - decalageParis(local);
  return local - decalageParis(t);
}
// Jours de début des occurrences d'un rendez-vous entre « de » et « a » (inclus)
function debuts(r, de, a) {
  const rep = r.repetition;
  if (!rep || !rep.frequence) return r.date >= de && r.date <= a ? [r.date] : [];
  const limite = DATE.test(rep.jusquau) && rep.jusquau < a ? rep.jusquau : a;
  const sauf = new Set(r.exceptions || []);
  const res = [];
  if (PAS[rep.frequence]) {
    const pas = PAS[rep.frequence];
    const k = Math.max(0, Math.floor(ecart(r.date, de) / pas));
    for (let d = decale(r.date, k * pas); d <= limite; d = decale(d, pas)) if (d >= de && !sauf.has(d)) res.push(d);
  } else if (rep.frequence === 'mois') {
    const [a0, m0, j0] = r.date.split('-').map(Number);
    for (let m = 0; m < 1200; m++) {
      const dt = new Date(Date.UTC(a0, m0 - 1 + m, j0));
      if (dt.getUTCDate() !== j0) continue; // pas de 31 ce mois-ci
      const d = versTexte(dt);
      if (d > limite) break;
      if (d >= de && !sauf.has(d)) res.push(d);
    }
  }
  return res;
}
