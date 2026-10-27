/* ==========================================================================
   Agenda de Mvrius — serveur (Cloudflare Worker)

   - Connexion avec Discord : un seul compte est accepté (DISCORD_ID_AUTORISE).
   - Donne à la page mvriuus.fr/agenda/ un jeton de session signé (30 jours).
   - Sert d'intermédiaire avec le dépôt GitHub PRIVÉ « agenda-donnees » : la clé
     GitHub reste ici, jamais dans le navigateur.
   - Rappels : un Cron Trigger toutes les 5 minutes (voir le README) envoie un
     message privé Discord avant chaque rendez-vous (avec des boutons), et le
     résumé du matin.
   - Commandes Discord (/rdv, /tache, /aujourdhui…) : adresse /interactions,
     à coller dans l'application Discord (« Interactions Endpoint URL »).
   - Réservation d'appels : créneaux libres et demandes pour mvriuus.fr/rendez-vous/.
   - Historique : liste des versions de l'agenda (commits du dépôt privé).
   - Résumé de la semaine, le dimanche soir (réglage dans l'agenda).

   Variables à créer dans Cloudflare (Worker › Settings › Variables and Secrets) :
     DISCORD_CLIENT_ID      texte   identifiant de l'application Discord
     DISCORD_CLIENT_SECRET  secret  secret de l'application Discord
     DISCORD_ID_AUTORISE    texte   ton identifiant Discord (le seul compte accepté)
     GITHUB_TOKEN           secret  jeton GitHub limité au dépôt agenda-donnees
                                    (Contents : Read and write)
     DISCORD_BOT_TOKEN      secret  token du bot de l'application Discord
     DISCORD_PUBLIC_KEY     texte   « Public Key » de l'application Discord (commandes)
   Facultatif : PAGE (adresse de l'agenda, par défaut https://mvriuus.fr/agenda/)

   Changer DISCORD_CLIENT_SECRET ou GITHUB_TOKEN déconnecte tous les appareils.
   ========================================================================== */

const DEPOT = 'mariusboost63-stack/agenda-donnees';
const FICHIER = 'agenda.json';
const PAGE_PAR_DEFAUT = 'https://mvriuus.fr/agenda/';
const DUREE_SESSION = 30 * 24 * 3600; // secondes
const PERIODE = 5 * 60 * 1000; // intervalle du Cron Trigger, en millisecondes
const MAX_DEMANDES = 5; // demandes de réservation en attente en même temps, au plus
const RESA_DEFAUT = {
  actif: false, duree: 30, pause: 10, delai: 24, horizon: 14, feries: true, message: '',
  plages: { 1: [['10:00', '12:00'], ['14:00', '18:00']], 2: [['10:00', '12:00'], ['14:00', '18:00']], 3: [['10:00', '12:00'], ['14:00', '18:00']], 4: [['10:00', '12:00'], ['14:00', '18:00']], 5: [['10:00', '12:00'], ['14:00', '18:00']] },
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const page = env.PAGE || PAGE_PAR_DEFAUT;
    const origine = new URL(page).origin;
    const avecCors = async action => cors(req.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await action(), origine);
    try {
      const chemin = url.pathname;
      if (chemin === '/connexion' && req.method === 'GET') return connexion(url, env);
      if (chemin === '/retour' && req.method === 'GET') return await retour(req, url, env, page);
      if (chemin === '/depot' || chemin === `/depot/contents/${FICHIER}`) return await avecCors(() => depot(req, url, env));
      if (chemin === '/depot/commits') return await avecCors(() => versions(req, url, env));
      if (chemin === '/rappels/test') return await avecCors(() => rappelTest(req, env, page));
      if (chemin === '/commandes/installer') return await avecCors(() => installerCommandes(req, env));
      if (chemin === '/reservation/creneaux') return await avecCors(() => creneauxPublics(req, env));
      if (chemin === '/reservation') return await avecCors(() => reserver(req, env, page, ctx));
      if (chemin === '/interactions' && req.method === 'POST') return await interactions(req, env, ctx, page);
      return new Response("Serveur de l'agenda de Mvrius.", { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch (e) {
      console.error(e);
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
  if (!compte.id || compte.id !== proprietaire(env)) return vers('erreur=refuse');

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
  if (!(await sessionDe(req, env))) return json({ message: 'Session expirée.' }, 401);
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
  const rep = await fetch(cible, { method: req.method, headers: { ...enteteGithub(env), ...(corps ? { 'Content-Type': 'application/json' } : {}) }, body: corps });
  // 401 de GitHub : c'est la clé GitHub du serveur qui est refusée, pas la session
  if (rep.status === 401) return json({ message: 'GitHub refuse la clé GITHUB_TOKEN du serveur (expirée ?).' }, 502);
  return new Response(rep.body, { status: rep.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// Versions de l'agenda : les commits qui ont modifié agenda.json, 30 par page
async function versions(req, url, env) {
  if (req.method !== 'GET') return json({ message: 'Méthode refusée.' }, 405);
  if (!(await sessionDe(req, env))) return json({ message: 'Session expirée.' }, 401);
  const page = Math.max(1, Math.min(100, parseInt(url.searchParams.get('page'), 10) || 1));
  const rep = await fetch(`https://api.github.com/repos/${DEPOT}/commits?path=${encodeURIComponent(FICHIER)}&per_page=30&page=${page}`, { headers: enteteGithub(env) });
  if (rep.status === 401) return json({ message: 'GitHub refuse la clé GITHUB_TOKEN du serveur (expirée ?).' }, 502);
  if (!rep.ok) return json({ message: `GitHub a répondu ${rep.status}.` }, rep.status === 404 ? 502 : rep.status);
  const liste = await rep.json();
  return json(liste.map(c => ({ sha: c.sha, message: String((c.commit && c.commit.message) || '').split('\n')[0].slice(0, 200), date: c.commit && (c.commit.committer || c.commit.author || {}).date })), 200);
}

const enteteGithub = env => ({ Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'agenda-mvrius' });

async function lireAgendaSha(env) {
  const rep = await fetch(`https://api.github.com/repos/${DEPOT}/contents/${FICHIER}?ref=main`, { headers: enteteGithub(env) });
  if (rep.status === 404) return { donnees: { rendezvous: [], taches: [] }, sha: null };
  if (!rep.ok) throw new Error(`GitHub a répondu ${rep.status}.`);
  const { content, sha } = await rep.json();
  return { donnees: JSON.parse(texteDeBase64(content)), sha };
}
const lireAgenda = async env => (await lireAgendaSha(env)).donnees;

// Lit le fichier, applique « changer » puis l'écrit ; recommence si l'agenda a bougé entre-temps.
// « changer » renvoie false pour ne rien écrire.
async function modifierAgenda(env, message, changer) {
  for (let essai = 0; essai < 4; essai++) {
    const { donnees, sha } = await lireAgendaSha(env);
    donnees.rendezvous = donnees.rendezvous || [];
    donnees.taches = donnees.taches || [];
    const resultat = changer(donnees);
    if (resultat === false) return { resultat: null };
    const corps = { message: message.slice(0, 200), content: base64DeTexte(`${JSON.stringify(donnees, null, 2)}\n`), ...(sha ? { sha, branch: 'main' } : {}) };
    const rep = await fetch(`https://api.github.com/repos/${DEPOT}/contents/${FICHIER}`, { method: 'PUT', headers: { ...enteteGithub(env), 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    if (rep.ok) return { resultat: resultat === undefined ? true : resultat, donnees };
    if (rep.status !== 409 && rep.status !== 422) throw new Error(`GitHub a refusé l'écriture (${rep.status}).`);
  }
  throw new Error("L'agenda a été modifié plusieurs fois en même temps. Réessaie.");
}

/* ---------- Jetons de session signés (HMAC-SHA256) ---------- */
const encodeur = new TextEncoder();
const b64url = octets => btoa(String.fromCharCode(...new Uint8Array(octets))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const texteDeBase64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)));
function base64DeTexte(s) {
  const o = encodeur.encode(s);
  let b = '';
  for (let i = 0; i < o.length; i += 0x8000) b += String.fromCharCode(...o.subarray(i, i + 0x8000));
  return btoa(b);
}
const proprietaire = env => String(env.DISCORD_ID_AUTORISE || '').trim();

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
    if (donnees.id !== proprietaire(env)) return null;
    return donnees;
  } catch (e) {
    return null;
  }
}
const sessionDe = (req, env) => verifier((req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), env);

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
const nouvelId = () => Date.now().toString(36) + crypto.randomUUID().replace(/-/g, '').slice(0, 4);
const sansAccents = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const coupe = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

/* ---------- Rappels Discord ---------- */
// Minutes avant le début (négatif = après minuit le jour même, pour une journée entière).
// Sans réglage : 15 min avant, ou 9:00 le jour même pour une journée entière.
const rappelsDe = r => (Array.isArray(r.rappels) ? r.rappels.filter(Number.isFinite)
  : r.rappel === undefined ? [r.journee ? -540 : 15] : Number.isFinite(r.rappel) ? [r.rappel] : []);

async function envoyerRappels(t, env, page) {
  const donnees = await lireAgenda(env);
  const apres = t - PERIODE;
  const auj = jourParis(t);
  const messages = [];
  const deja = new Set();
  const ajouter = (r, d, dans) => {
    if (deja.has(`${r.id}|${d}`)) return;
    deja.add(`${r.id}|${d}`);
    messages.push(messageRappel(r, d, dans, donnees, page, auj));
  };
  for (const r of donnees.rendezvous || []) {
    if (r.statut === 'annule' || !DATE.test(r.date)) continue;
    const modifie = Date.parse(r.modifie || '') || 0;
    const rappels = rappelsDe(r);
    for (const d of debuts(r, decale(auj, -2), decale(auj, 3))) {
      const debut = parisVersUtc(d, r.journee ? '00:00' : r.debut);
      const instants = rappels.map(a => debut - a * 60000);
      const dus = rappels.filter((a, k) => instants[k] > apres && instants[k] <= t);
      if (dus.length) ajouter(r, d, Math.min(...dus));
      // Créé ou modifié après l'heure de ses rappels, mais pas encore commencé : rappel tout de suite
      else if (rappels.length && debut > t && modifie > apres && modifie <= t && !instants.some(x => x > t)) {
        ajouter(r, d, Math.max(1, Math.round((debut - t) / 60000)));
      }
    }
    // « Rappelle-moi dans 5 min » (bouton d'un rappel)
    const relance = r.relance && Date.parse(r.relance.instant);
    if (relance > apres && relance <= t && DATE.test(r.relance.date)) {
      const debut = parisVersUtc(r.relance.date, r.journee ? '00:00' : r.debut);
      ajouter(r, r.relance.date, Math.max(0, Math.round((debut - t) / 60000)));
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
  // Résumé de la semaine, le dimanche soir
  const semaine = donnees.reglages && donnees.reglages.resumeSemaine;
  if (semaine && semaine.actif && jourDeLaSemaine(auj) === 7) {
    const instant = parisVersUtc(auj, HEURE.test(semaine.heure) ? semaine.heure : '19:00');
    if (instant > apres && instant <= t) messages.push(messageSemaine(donnees, decale(auj, 1), page));
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
    if (r.statut === 'annule' || !DATE.test(r.date)) continue;
    for (const d of debuts(r, auj, decale(auj, 8))) {
      for (const a of rappelsDe(r)) {
        const instant = parisVersUtc(d, r.journee ? '00:00' : r.debut) - a * 60000;
        if (instant > t && (!prochain || instant < prochain.instant)) prochain = { r, instant };
      }
    }
  }
  if (!prochain) return 'Aucun rappel prévu dans les 7 prochains jours.';
  return `Prochain rappel : « ${prochain.r.titre || 'Rendez-vous'} », ${jourTexte(jourParis(prochain.instant))} à ${heureParis(prochain.instant)}.`;
}

async function rappelTest(req, env, page) {
  if (req.method !== 'POST') return json({ message: 'Méthode refusée.' }, 405);
  if (!(await sessionDe(req, env))) return json({ message: 'Session expirée.' }, 401);
  if (!env.DISCORD_BOT_TOKEN) return json({ message: 'Ajoute le token du bot (DISCORD_BOT_TOKEN) dans Cloudflare.' }, 400);
  try {
    // Discord demande qu'un bot se soit connecté au moins une fois avant d'envoyer des messages
    await connecterBot(env);
    const prochain = prochainRappel(await lireAgenda(env), Date.now());
    await envoyerMp(env, {
      embeds: [{ title: 'Les rappels de ton agenda fonctionnent ✅', description: `Tu recevras ici un message avant chaque rendez-vous.\n\n${prochain}`, url: page, color: 0xe8b46a }],
    });
    return json({ ok: true, prochain }, 200);
  } catch (e) {
    return json({ message: e.message }, 502);
  }
}

/* ---------- API Discord ---------- */
const enteteBot = env => ({ Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (https://mvriuus.fr/agenda/, 1.0)' });

async function envoyerMp(env, message) {
  const salon = await fetch('https://discord.com/api/v10/users/@me/channels', { method: 'POST', headers: enteteBot(env), body: JSON.stringify({ recipient_id: proprietaire(env) }) });
  if (salon.status === 401) throw new Error('Discord refuse le token du bot (DISCORD_BOT_TOKEN).');
  if (!salon.ok) throw new Error(`Discord refuse d'ouvrir la conversation privée (${salon.status}).`);
  const { id } = await salon.json();
  const rep = await fetch(`https://discord.com/api/v10/channels/${id}/messages`, { method: 'POST', headers: enteteBot(env), body: JSON.stringify(message) });
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

// Même format que l'agenda (app.js) : restaurable 30 jours depuis la corbeille
function mettreALaCorbeille(donnees, type, element) {
  const le = new Date().toISOString();
  const limite = new Date(Date.now() - 30 * 864e5).toISOString();
  donnees.corbeille = [{ cid: nouvelId(), type, element: JSON.parse(JSON.stringify(element)), le }, ...(donnees.corbeille || []).filter(c => String(c.le) >= limite)].slice(0, 200);
}

/* ---------- Messages ---------- */
const COULEUR_PAR_DEFAUT = 0xe8b46a;
const couleurDe = (donnees, r) => {
  const c = (donnees.categories || []).find(x => x.id === r.categorie);
  return c && /^#[0-9a-f]{6}$/i.test(c.couleur) ? parseInt(c.couleur.slice(1), 16) : COULEUR_PAR_DEFAUT;
};
const jourTexte = d => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${d}T12:00:00Z`));
const jourRelatif = (d, auj) => (d === auj ? "aujourd'hui" : d === decale(auj, 1) ? 'demain' : jourTexte(d));
const majuscule = s => s.charAt(0).toUpperCase() + s.slice(1);
const dansTexte = m => (m <= 0 ? 'Maintenant' : m < 60 ? `Dans ${m} min` : m < 1440 ? `Dans ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : m < 2880 ? 'Demain' : `Dans ${Math.round(m / 1440)} jours`);
const dernierJourDe = (r, d) => decale(d, etendueDe(r));
const etendueDe = r => Math.max(0, ecart(r.date, DATE.test(r.dateFin) && r.dateFin > r.date ? r.dateFin : r.date));
const lienAgenda = page => ({ type: 1, components: [{ type: 2, style: 5, label: "Ouvrir l'agenda", url: page }] });

function horaire(r, d) {
  const dernier = dernierJourDe(r, d);
  if (r.journee) return dernier === d ? 'toute la journée' : `jusqu'au ${jourTexte(dernier)}`;
  return dernier === d ? `${r.debut} – ${r.fin}` : `${r.debut} → ${jourTexte(dernier)} ${r.fin}`;
}

function messageRappel(r, d, dans, donnees, page, auj) {
  const quand = r.journee ? majuscule(jourRelatif(d, auj)) : dansTexte(dans);
  const champs = [];
  if (r.avec) champs.push({ name: 'Avec', value: coupe(r.avec, 1024), inline: true });
  if (r.lieu) champs.push({ name: 'Lieu', value: coupe(r.lieu, 1024), inline: true });
  if (r.notes) champs.push({ name: 'Notes', value: coupe(r.notes, 1024) });
  if (Array.isArray(r.checklist) && r.checklist.length) {
    champs.push({ name: 'Liste', value: coupe(r.checklist.map(x => `${x.fait ? '☑' : '☐'} ${x.t}`).join('\n'), 1024) });
  }
  const cle = `${r.id}|${d}`;
  const boutons = [{ type: 2, style: 2, label: 'Rappel dans 5 min', emoji: { name: '⏰' }, custom_id: `relance|${cle}` }];
  if (!r.journee) boutons.push({ type: 2, style: 1, label: 'Décaler de 15 min', custom_id: `decaler|${cle}` });
  boutons.push({ type: 2, style: 4, label: 'Annuler', custom_id: `annuler|${cle}` });
  boutons.push({ type: 2, style: 5, label: "Ouvrir l'agenda", url: page });
  return {
    embeds: [{
      title: coupe(`⏰ ${r.titre || 'Rendez-vous'}`, 256),
      description: `**${quand}** · ${jourTexte(d)}, ${horaire(r, d)}`,
      url: page,
      color: couleurDe(donnees, r),
      fields: champs,
    }],
    components: [{ type: 1, components: boutons }],
  };
}

// Rendez-vous d'un jour (y compris ceux commencés avant et qui durent plusieurs jours)
function rendezvousDu(donnees, d) {
  const liste = [];
  for (const r of donnees.rendezvous || []) {
    if (r.statut === 'annule' || !DATE.test(r.date)) continue;
    for (const debut of debuts(r, decale(d, -etendueDe(r)), d)) liste.push({ r, debut, continue: debut < d });
  }
  return liste.sort((a, b) => (a.r.journee || a.continue ? '' : a.r.debut).localeCompare(b.r.journee || b.continue ? '' : b.r.debut));
}
const ligneRdv = x => `${x.r.journee || x.continue ? '🗓️' : `**${x.r.debut}**`} · ${x.r.titre || 'Rendez-vous'}${x.r.avec ? ` (avec ${x.r.avec})` : ''}${x.r.statut === 'attente' ? ' · *en attente*' : ''}`;
// Tâches du jour : prévues aujourd'hui ou en retard, et celles sans jour dont l'échéance est arrivée
const tachesEnCours = (donnees, auj) => (donnees.taches || []).filter(t => !t.fait && ((DATE.test(t.date) && t.date <= auj) || (!t.date && DATE.test(t.echeance) && t.echeance <= auj)));
const jourCourtTexte = d => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00:00Z`));
const ligneTache = (t, auj) => `${Number(t.priorite) === 2 ? '🔴' : Number(t.priorite) === 1 ? '🟠' : '☐'} ${t.titre}`
  + `${t.date && t.date < auj ? ` *(depuis le ${jourCourtTexte(t.date)})*` : ''}${DATE.test(t.echeance) ? ` · ⏳ ${t.echeance <= auj ? '**échéance dépassée ou aujourd\'hui**' : jourCourtTexte(t.echeance)}` : ''}`;

function messageResume(donnees, auj, page) {
  const rdv = rendezvousDu(donnees, auj);
  const taches = tachesEnCours(donnees, auj);
  if (!rdv.length && !taches.length) return null;
  const parties = [];
  if ((donnees.reglages || {}).feries !== false && ferieDe(auj)) parties.push(`🇫🇷 Jour férié : **${ferieDe(auj)}**`);
  if (rdv.length) parties.push(rdv.map(ligneRdv).join('\n'));
  if (taches.length) parties.push(`**Tâches**\n${taches.map(t => ligneTache(t, auj)).join('\n')}`);
  return {
    embeds: [{
      title: `☀️ Ta journée du ${jourTexte(auj)}`,
      description: coupe(parties.join('\n\n'), 4000),
      url: page,
      color: COULEUR_PAR_DEFAUT,
      footer: { text: [rdv.length && `${rdv.length} rendez-vous`, taches.length && `${taches.length} tâche${taches.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ') },
    }],
    components: [lienAgenda(page)],
  };
}

// Résumé du dimanche soir : la semaine qui commence le lendemain
function messageSemaine(donnees, lundi, page) {
  const dimanche = decale(lundi, 6);
  const feries = (donnees.reglages || {}).feries !== false;
  const jours = [];
  let nbRdv = 0;
  let minutesRdv = 0;
  for (let d = lundi; d <= dimanche; d = decale(d, 1)) {
    const rdv = rendezvousDu(donnees, d);
    nbRdv += rdv.filter(x => !x.continue).length;
    rdv.forEach(x => { if (!x.continue && !x.r.journee && x.r.statut !== 'attente') minutesRdv += Math.max(0, ((minutesDe(x.r.fin) || 1440) - minutesDe(x.r.debut)) + etendueDe(x.r) * 1440); });
    const ferie = feries ? ferieDe(d) : '';
    if (!rdv.length && !ferie) continue;
    jours.push(`**${majuscule(jourTexte(d))}**${ferie ? ` · 🇫🇷 ${ferie}` : ''}\n${rdv.map(ligneRdv).join('\n') || '*Jour férié*'}`);
  }
  const taches = (donnees.taches || []).filter(t => !t.fait && DATE.test(t.date) && t.date >= lundi && t.date <= dimanche);
  const echeances = (donnees.taches || []).filter(t => !t.fait && DATE.test(t.echeance) && t.echeance <= dimanche).sort((a, b) => a.echeance.localeCompare(b.echeance));
  const attente = (donnees.rendezvous || []).filter(r => r.statut === 'attente' && DATE.test(r.date) && r.date >= decale(lundi, -1));
  const champs = [];
  if (taches.length) champs.push({ name: `Tâches prévues (${taches.length})`, value: coupe(taches.slice(0, 12).map(t => `${ligneTache(t, lundi)} · ${jourCourtTexte(t.date)}`).join('\n'), 1024) });
  if (echeances.length) champs.push({ name: `Échéances (${echeances.length})`, value: coupe(echeances.slice(0, 12).map(t => `⏳ ${t.titre} · ${t.echeance < lundi ? '**en retard**' : jourCourtTexte(t.echeance)}`).join('\n'), 1024) });
  if (attente.length) champs.push({ name: `Demandes en attente (${attente.length})`, value: coupe(attente.map(r => `📅 ${r.titre} · ${jourCourtTexte(r.date)} ${r.debut || ''}`).join('\n'), 1024) });
  const heures = Math.floor(minutesRdv / 60);
  return {
    embeds: [{
      title: `🗓️ Ta semaine du ${jourTexte(lundi)} au ${jourTexte(dimanche)}`,
      description: coupe(jours.join('\n\n') || 'Aucun rendez-vous prévu cette semaine.', 4000),
      url: page,
      color: COULEUR_PAR_DEFAUT,
      fields: champs,
      footer: { text: `${nbRdv} rendez-vous${minutesRdv ? ` · ${heures} h${minutesRdv % 60 ? ` ${deux(minutesRdv % 60)}` : ''} de rendez-vous` : ''}` },
    }],
    components: [lienAgenda(page)],
  };
}

/* ---------- Commandes et boutons Discord (interactions) ---------- */
const hexVersOctets = h => Uint8Array.from(String(h).match(/[0-9a-f]{2}/gi) || [], x => parseInt(x, 16));
async function signatureValide(req, corps, env) {
  const signature = req.headers.get('X-Signature-Ed25519');
  const horodatage = req.headers.get('X-Signature-Timestamp');
  if (!signature || !horodatage || !env.DISCORD_PUBLIC_KEY) return false;
  try {
    let cle;
    try {
      cle = await crypto.subtle.importKey('raw', hexVersOctets(env.DISCORD_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
    } catch (e) { // anciens environnements Cloudflare
      cle = await crypto.subtle.importKey('raw', hexVersOctets(env.DISCORD_PUBLIC_KEY), { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' }, false, ['verify']);
    }
    return await crypto.subtle.verify({ name: cle.algorithm.name }, cle, hexVersOctets(signature), encodeur.encode(horodatage + corps));
  } catch (e) {
    return false;
  }
}

async function interactions(req, env, ctx, page) {
  const corps = await req.text();
  if (!(await signatureValide(req, corps, env))) return new Response('Signature invalide.', { status: 401 });
  const i = JSON.parse(corps);
  if (i.type === 1) return json({ type: 1 }, 200); // vérification de l'adresse par Discord
  const auteur = (i.member && i.member.user) || i.user || {};
  if (auteur.id !== proprietaire(env)) return json({ type: 4, data: { content: '🔒 Cet agenda est privé.', flags: 64 } }, 200);
  const webhook = `https://discord.com/api/v10/webhooks/${i.application_id}/${i.token}`;
  const modifierMessage = contenu => fetch(`${webhook}/messages/@original`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contenu) });
  const repondreAPart = contenu => fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...contenu, flags: 64 }) });
  if (i.type === 2) {
    // Réponse différée (Discord laisse 3 s) : le résultat arrive dès que l'agenda est lu ou écrit
    ctx.waitUntil(commande(i, env, page).then(modifierMessage).catch(e => modifierMessage({ content: `⚠️ ${e.message}` })));
    return json({ type: 5, data: { flags: 64 } }, 200);
  }
  if (i.type === 3) {
    ctx.waitUntil(bouton(i, env, page).then(modifierMessage).catch(e => repondreAPart({ content: `⚠️ ${e.message}` })));
    return json({ type: 6 }, 200);
  }
  return json({ type: 4, data: { content: 'Interaction inconnue.', flags: 64 } }, 200);
}

async function commande(i, env, page) {
  const o = Object.fromEntries(((i.data && i.data.options) || []).map(x => [x.name, x.value]));
  const t = Date.now();
  const auj = jourParis(t);
  switch (i.data.name) {
    case 'rdv': return commandeRdv(o, env, page, t);
    case 'tache': return commandeTache(o, env, t);
    case 'aujourdhui': return programme(env, auj, 0, "Aujourd'hui", page, t);
    case 'demain': return programme(env, decale(auj, 1), 0, 'Demain', page, t);
    case 'semaine': return programme(env, auj, 6, 'Tes 7 prochains jours', page, t);
    case 'prochain': return prochains(env, page, t);
    default: return { content: 'Commande inconnue.' };
  }
}

const EXEMPLES = '`demain 14h`, `lundi 9h30`, `25/10 18h`, `dans 2h`, `samedi` (toute la journée)';
async function commandeRdv(o, env, page, t) {
  const quand = analyserQuand(o.quand, t);
  if (!quand) return { content: `❓ Je n'ai pas compris « ${coupe(o.quand || '', 60)} ». Exemples : ${EXEMPLES}.` };
  const duree = Number(o.duree) || 60;
  const journee = !quand.heure;
  const instant = new Date(t).toISOString();
  let rdv;
  await modifierAgenda(env, `Ajout depuis Discord : ${coupe(o.titre, 80)}`, d => {
    const cats = d.categories || [];
    const cat = cats.find(c => c.id === o.categorie) || cats.find(c => c.id === 'client') || cats[0];
    const total = journee ? 0 : minutesDe(quand.heure) + duree;
    rdv = {
      id: nouvelId(), titre: coupe(o.titre, 120), categorie: cat ? cat.id : 'client',
      date: quand.date, journee,
      debut: journee ? null : quand.heure,
      fin: journee ? null : heureDe(total % 1440),
      dateFin: journee ? quand.date : decale(quand.date, Math.floor((total - 1) / 1440)),
      repetition: null, exceptions: [],
      rappels: o.rappel === undefined ? [journee ? -540 : 15] : o.rappel < 0 ? [] : [o.rappel],
      statut: 'confirme', avec: o.avec ? coupe(o.avec, 120) : '', lieu: '', notes: '', checklist: [],
      source: 'discord', cree: instant, modifie: instant,
    };
    d.rendezvous.push(rdv);
  });
  return {
    embeds: [{ title: '✅ Ajouté à ton agenda', description: `**${rdv.titre}**\n${majuscule(jourTexte(rdv.date))}, ${horaire(rdv, rdv.date)}${rdv.avec ? `\nAvec ${rdv.avec}` : ''}`, color: 0x3ddc84, url: page }],
    components: [{ type: 1, components: [
      { type: 2, style: 4, label: 'Annuler', custom_id: `supprimer|${rdv.id}|${rdv.date}` },
      { type: 2, style: 5, label: "Ouvrir l'agenda", url: page },
    ] }],
  };
}

async function commandeTache(o, env, t) {
  const auj = jourParis(t);
  const quand = o.quand ? analyserQuand(o.quand, t) : { date: auj };
  if (!quand) return { content: `❓ Je n'ai pas compris « ${coupe(o.quand, 60)} ». Exemples : \`demain\`, \`vendredi\`, \`25/10\`.` };
  const titre = coupe(o.texte, 200);
  await modifierAgenda(env, `Tâche ajoutée depuis Discord : ${coupe(titre, 80)}`, d => {
    d.taches.push({ id: nouvelId(), titre, date: quand.date, fait: false, faitLe: null, cree: new Date(t).toISOString() });
  });
  return { content: `✅ Tâche ajoutée pour ${jourRelatif(quand.date, auj)} : **${titre}**` };
}

async function programme(env, de, jours, titre, page, t) {
  const donnees = await lireAgenda(env);
  const auj = jourParis(t);
  const parties = [];
  for (let k = 0; k <= jours; k++) {
    const d = decale(de, k);
    const rdv = rendezvousDu(donnees, d);
    if (jours && !rdv.length) continue;
    const lignes = rdv.length ? rdv.map(ligneRdv).join('\n') : 'Rien de prévu 🎉';
    parties.push(jours ? `__${majuscule(jourRelatif(d, auj))}__${d === auj || d === decale(auj, 1) ? ` · ${jourTexte(d)}` : ''}\n${lignes}` : lignes);
  }
  if (de === auj) {
    const taches = tachesEnCours(donnees, auj);
    if (taches.length) parties.push(`**Tâches**\n${taches.map(x => ligneTache(x, auj)).join('\n')}`);
  }
  return {
    embeds: [{ title: `📅 ${titre}${jours ? '' : ` · ${jourTexte(de)}`}`, description: coupe(parties.join('\n\n') || 'Rien de prévu 🎉', 4000), color: COULEUR_PAR_DEFAUT, url: page }],
    components: [lienAgenda(page)],
  };
}

async function prochains(env, page, t) {
  const donnees = await lireAgenda(env);
  const auj = jourParis(t);
  const liste = [];
  for (const r of donnees.rendezvous || []) {
    if (r.statut === 'annule' || !DATE.test(r.date)) continue;
    for (const d of debuts(r, decale(auj, -etendueDe(r)), decale(auj, 30))) {
      const fin = r.journee ? parisVersUtc(decale(dernierJourDe(r, d), 1), '00:00') : parisVersUtc(dernierJourDe(r, d), r.fin);
      if (fin > t) liste.push({ r, d, debut: parisVersUtc(d, r.journee ? '00:00' : r.debut) });
    }
  }
  liste.sort((a, b) => a.debut - b.debut);
  const lignes = liste.slice(0, 6).map(x => `**${majuscule(jourRelatif(x.d, auj))}**${x.r.journee ? '' : ` à ${x.r.debut}`} · ${x.r.titre || 'Rendez-vous'}${x.r.avec ? ` (avec ${x.r.avec})` : ''}`);
  return {
    embeds: [{ title: '⏭️ Tes prochains rendez-vous', description: lignes.join('\n') || 'Rien de prévu dans les 30 prochains jours 🎉', color: COULEUR_PAR_DEFAUT, url: page }],
    components: [lienAgenda(page)],
  };
}

// Boutons des messages : rappel, décaler, annuler, confirmer ou refuser une demande…
async function bouton(i, env, page) {
  const [action, id, d] = String(i.data.custom_id || '').split('|');
  const t = Date.now();
  const instant = new Date(t).toISOString();
  const original = ((i.message && i.message.embeds) || [])[0] || {};
  const embed = { title: original.title, description: original.description, url: original.url, color: original.color, fields: original.fields };
  const fini = (ligne, couleur) => ({
    embeds: [{ ...embed, description: `${embed.description || ''}\n\n${ligne}`.trim(), ...(couleur !== undefined ? { color: couleur } : {}) }],
    components: [lienAgenda(page)],
  });
  const trouver = donnees => donnees.rendezvous.find(r => r.id === id);
  const absent = fini("⚠️ Ce rendez-vous n'est plus dans l'agenda.");

  if (action === 'relance') {
    // Prochain passage du Cron Trigger dans au moins 5 minutes
    const quand = Math.ceil((t + 5 * 60000) / PERIODE) * PERIODE;
    const { resultat } = await modifierAgenda(env, 'Rappel reporté de 5 min', donnees => {
      const r = trouver(donnees);
      if (!r) return false;
      r.relance = { date: d, instant: new Date(quand).toISOString() }; // sans toucher « modifie »
      return r;
    });
    return resultat ? fini(`⏰ Je te le rappelle à ${heureParis(quand)}.`) : absent;
  }
  if (action === 'decaler') {
    let nouveau;
    const { resultat } = await modifierAgenda(env, 'Rendez-vous décalé de 15 min', donnees => {
      const r = trouver(donnees);
      if (!r || r.journee) return false;
      const debut = ecart(BASE, d) * 1440 + minutesDe(r.debut) + 15;
      const fin = ecart(BASE, dernierJourDe(r, d)) * 1440 + (minutesDe(r.fin) || 1440) + 15;
      const jFin = Math.ceil(fin / 1440) - 1;
      nouveau = { date: decale(BASE, Math.floor(debut / 1440)), debut: heureDe(debut % 1440), dateFin: decale(BASE, jFin), fin: heureDe(fin - jFin * 1440) };
      if (r.repetition) {
        // Une occurrence d'une série décalée devient un rendez-vous à part
        r.exceptions = [...new Set([...(r.exceptions || []), d])].sort();
        const copie = { ...JSON.parse(JSON.stringify(r)), id: nouvelId(), ...nouveau, repetition: null, exceptions: [], cree: instant, modifie: instant };
        delete copie.relance;
        donnees.rendezvous.push(copie);
        return copie;
      }
      Object.assign(r, nouveau, { modifie: instant });
      delete r.relance;
      return r;
    });
    return resultat ? fini(`➡️ Décalé à ${nouveau.debut}${nouveau.date !== d ? ` (${jourTexte(nouveau.date)})` : ''}.`) : absent;
  }
  if (action === 'annuler' || action === 'supprimer' || action === 'resa-non') {
    const { resultat } = await modifierAgenda(env, action === 'resa-non' ? 'Demande de rendez-vous refusée' : 'Rendez-vous annulé depuis Discord', donnees => {
      const r = trouver(donnees);
      if (!r) return false;
      if (action === 'annuler' && r.repetition) {
        if (!(r.exceptions || []).includes(d)) mettreALaCorbeille(donnees, 'occurrence', { id: r.id, date: d, titre: r.titre });
        r.exceptions = [...new Set([...(r.exceptions || []), d])].sort();
      } else if (action === 'annuler') { r.statut = 'annule'; r.modifie = instant; delete r.relance; }
      else {
        donnees.rendezvous.splice(donnees.rendezvous.indexOf(r), 1);
        mettreALaCorbeille(donnees, 'rdv', r);
      }
      return r;
    });
    if (!resultat) return absent;
    if (action === 'resa-non') return fini('❌ Demande refusée : le créneau est de nouveau libre.', 0x646b80);
    return fini(action === 'supprimer' ? "🗑️ Retiré de ton agenda." : '❌ Rendez-vous annulé.', 0x646b80);
  }
  if (action === 'resa-ok') {
    let donneesConfirmees = null;
    const { resultat } = await modifierAgenda(env, 'Demande de rendez-vous confirmée', donnees => {
      donneesConfirmees = donnees;
      const r = trouver(donnees);
      if (!r) return false;
      r.statut = 'confirme';
      r.modifie = instant;
      return r;
    });
    if (!resultat) return absent;
    const dm = resultat.demande || {};
    const contact = [dm.email, dm.discord && `Discord : ${dm.discord}`].filter(Boolean).join(' · ');
    const texte = messageConfirmation(reglagesResa(donneesConfirmees || {}), resultat);
    return fini(`✅ Confirmé. Envoie ce message à ${dm.nom || 'la personne'}${contact ? ` (${contact})` : ''} :\n\`\`\`\n${texte.replace(/`/g, "'")}\n\`\`\``, 0x3ddc84);
  }
  return fini('Action inconnue.');
}

// Enregistre les commandes auprès de Discord (bouton « Installer les commandes » des réglages)
async function installerCommandes(req, env) {
  if (req.method !== 'POST') return json({ message: 'Méthode refusée.' }, 405);
  if (!(await sessionDe(req, env))) return json({ message: 'Session expirée.' }, 401);
  if (!env.DISCORD_BOT_TOKEN) return json({ message: 'Ajoute le token du bot (DISCORD_BOT_TOKEN) dans Cloudflare.' }, 400);
  if (!env.DISCORD_PUBLIC_KEY) return json({ message: "Ajoute la « Public Key » de l'application Discord (DISCORD_PUBLIC_KEY) dans Cloudflare." }, 400);
  const donnees = await lireAgenda(env);
  const categories = (donnees.categories || []).slice(0, 25).map(c => ({ name: coupe(c.nom || c.id, 100), value: String(c.id).slice(0, 100) }));
  const rep = await fetch(`https://discord.com/api/v10/applications/${env.DISCORD_CLIENT_ID}/commands`, { method: 'PUT', headers: enteteBot(env), body: JSON.stringify(definitionsCommandes(categories)) });
  if (!rep.ok) {
    const erreur = await rep.json().catch(() => ({}));
    return json({ message: `Discord a refusé les commandes (${rep.status})${erreur.message ? ` : ${erreur.message}` : ''}.` }, 502);
  }
  return json({ ok: true, commandes: (await rep.json()).length }, 200);
}

function definitionsCommandes(categories) {
  const partout = { contexts: [0, 1], integration_types: [0] }; // serveurs et conversation privée avec le bot
  const quand = (requis, description) => ({ type: 3, name: 'quand', description, required: requis, max_length: 60 });
  const durees = [15, 30, 45, 60, 90, 120, 180].map(m => ({ name: m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`, value: m }));
  return [
    { ...partout, name: 'rdv', description: 'Ajouter un rendez-vous à ton agenda', options: [
      { type: 3, name: 'titre', description: 'Titre du rendez-vous', required: true, max_length: 120 },
      quand(true, 'Quand ? ex. demain 14h, lundi 9h30, 25/10 18h, dans 2h, samedi'),
      { type: 4, name: 'duree', description: 'Durée (1 h par défaut)', choices: durees },
      { type: 3, name: 'avec', description: 'Avec qui ?', max_length: 120 },
      ...(categories.length ? [{ type: 3, name: 'categorie', description: 'Catégorie', choices: categories }] : []),
      { type: 4, name: 'rappel', description: 'Rappel (15 min avant par défaut)', choices: [
        { name: 'Pas de rappel', value: -1 }, { name: "À l'heure", value: 0 }, { name: '5 min avant', value: 5 }, { name: '15 min avant', value: 15 },
        { name: '30 min avant', value: 30 }, { name: '1 h avant', value: 60 }, { name: '1 jour avant', value: 1440 },
      ] },
    ] },
    { ...partout, name: 'tache', description: 'Ajouter une tâche à ton agenda', options: [
      { type: 3, name: 'texte', description: 'La tâche', required: true, max_length: 200 },
      quand(false, "Pour quand ? (aujourd'hui par défaut) ex. demain, vendredi, 25/10"),
    ] },
    { ...partout, name: 'aujourdhui', description: "Ton programme d'aujourd'hui" },
    { ...partout, name: 'demain', description: 'Ton programme de demain' },
    { ...partout, name: 'semaine', description: 'Tes 7 prochains jours' },
    { ...partout, name: 'prochain', description: 'Tes prochains rendez-vous' },
  ];
}

/* ---------- Dates écrites en français : « demain 14h », « lundi 9h30 », « 25/10 18h »… ---------- */
const MOIS = { janvier: 1, janv: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, avril: 4, avr: 4, mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9, octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12 };
const NOMS_JOURS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 7 };
function analyserQuand(brut, t) {
  let s = ` ${sansAccents(brut).replace(/['’]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const auj = jourParis(t);
  const p = morceaux(t);
  const maintenant = +p.hour * 60 + +p.minute;
  let date = null;
  let heure = null;
  let m;
  // « dans 2 h », « dans 30 min », « dans 3 jours »
  if ((m = s.match(/ dans (\d+) ?(minutes?|min|heures?|h|jours?|j)(?= )/))) {
    const n = Number(m[1]);
    if (m[2].startsWith('j')) date = decale(auj, n);
    else {
      const total = Math.ceil((maintenant + (m[2].startsWith('m') ? n : n * 60)) / 5) * 5;
      return { date: decale(auj, Math.floor(total / 1440)), heure: heureDe(total % 1440) };
    }
    s = s.replace(m[0], ' ');
  }
  // Heure : 14h, 14h30, 14:30, 9 h, midi, minuit
  if ((m = s.match(/ (?:a )?(\d{1,2}) ?(?:h|:) ?(\d{2})?(?= )/)) && Number(m[1]) < 24 && Number(m[2] || 0) < 60) {
    heure = heureDe(Number(m[1]) * 60 + Number(m[2] || 0));
    s = s.replace(m[0], ' ');
  } else if (/ midi /.test(s)) heure = '12:00';
  else if (/ minuit /.test(s)) heure = '00:00';
  // Date
  const construire = (j, mo, a) => {
    if (!(mo >= 1 && mo <= 12 && j >= 1 && j <= 31)) return null;
    let annee = a ? Number(a.length === 2 ? `20${a}` : a) : Number(auj.slice(0, 4));
    const texte = an => `${an}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
    if (!a && texte(annee) < decale(auj, -1)) annee += 1; // « 3 janvier » en décembre : l'an prochain
    const d = texte(annee);
    return versTexte(versDate(d)) === d ? d : null; // refuse le 31 novembre
  };
  if ((m = s.match(/ (\d{4})-(\d{2})-(\d{2}) /))) date = construire(Number(m[3]), Number(m[2]), m[1]);
  else if ((m = s.match(/ (\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))? /))) date = construire(Number(m[1]), Number(m[2]), m[3]);
  else if ((m = s.match(new RegExp(` (\\d{1,2}|1er) (${Object.keys(MOIS).join('|')})\\.?(?: (\\d{4}))? `)))) date = construire(parseInt(m[1], 10), MOIS[m[2]], m[3]);
  else if (/ apres[- ]demain /.test(s)) date = decale(auj, 2);
  else if (/ demain /.test(s)) date = decale(auj, 1);
  else if (/ (aujourd ?hui|auj|ce soir|ce matin|cet apres[- ]midi) /.test(s)) date = auj;
  else if ((m = s.match(/ (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) /))) {
    let n = (NOMS_JOURS[m[1]] - jourDeLaSemaine(auj) + 7) % 7;
    if (n === 0 && (/ prochain /.test(s) || !heure || minutesDe(heure) <= maintenant)) n = 7;
    date = decale(auj, n);
  }
  if (!date && heure) date = minutesDe(heure) > maintenant ? auj : decale(auj, 1);
  if (!date) return null;
  return { date, heure };
}

/* ---------- Réservation d'appels (mvriuus.fr/rendez-vous/) ---------- */
const reglagesResa = donnees => ({ ...RESA_DEFAUT, ...((donnees.reglages || {}).reservation || {}) });

// Moments occupés (en millisecondes, heure universelle) entre deux jours
function occupations(donnees, de, a) {
  const res = [];
  for (const r of donnees.rendezvous || []) {
    if (r.statut === 'annule' || !DATE.test(r.date)) continue;
    for (const d of debuts(r, decale(de, -etendueDe(r)), a)) {
      const dernier = dernierJourDe(r, d);
      if (r.journee) res.push([parisVersUtc(d, '00:00'), parisVersUtc(decale(dernier, 1), '00:00')]);
      else res.push([parisVersUtc(d, r.debut), minutesDe(r.fin) === 0 ? parisVersUtc(decale(dernier, 1), '00:00') : parisVersUtc(dernier, r.fin)]);
    }
  }
  return res;
}

function creneauxLibres(donnees, t) {
  const c = reglagesResa(donnees);
  if (!c.actif) return { actif: false, jours: [] };
  const auj = jourParis(t);
  const fin = decale(auj, Number(c.horizon) || 14);
  const occupe = occupations(donnees, auj, fin);
  const duree = Number(c.duree) || 30;
  const pause = (Number(c.pause) || 0) * 60000;
  const minimum = t + (Number(c.delai) || 0) * 3600000;
  const jours = [];
  for (let d = auj; d <= fin; d = decale(d, 1)) {
    if (c.feries !== false && ferieDe(d)) continue; // pas de réservation les jours fériés
    const creneaux = [];
    for (const [a, b] of (c.plages || {})[jourDeLaSemaine(d)] || []) {
      if (!HEURE.test(a) || !HEURE.test(b)) continue;
      for (let m = minutesDe(a); m + duree <= (minutesDe(b) || 1440); m += duree) {
        const debut = parisVersUtc(d, heureDe(m));
        const finCreneau = debut + duree * 60000;
        if (debut < minimum) continue;
        if (occupe.some(([x, y]) => debut < y + pause && finCreneau + pause > x)) continue;
        creneaux.push(heureDe(m));
      }
    }
    if (creneaux.length) jours.push({ date: d, creneaux: [...new Set(creneaux)].sort() });
  }
  return { actif: true, duree, jours };
}

async function creneauxPublics(req, env) {
  if (req.method !== 'GET') return json({ message: 'Méthode refusée.' }, 405);
  return json(creneauxLibres(await lireAgenda(env), Date.now()), 200);
}

async function reserver(req, env, page, ctx) {
  if (req.method !== 'POST') return json({ message: 'Méthode refusée.' }, 405);
  let c;
  try { c = await req.json(); } catch (e) { return json({ message: 'Requête invalide.' }, 400); }
  const texte = (v, n) => String(v || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);
  const nom = texte(c.nom, 80);
  const email = texte(c.email, 120);
  const discord = texte(c.discord, 60);
  const sujet = texte(c.sujet, 80);
  const message = String(c.message || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, 1500);
  // Pot de miel et formulaire rempli en moins de 3 s (mesuré par la page) : un robot.
  // On fait comme si tout allait bien.
  if (c.site || (c.rempli !== undefined && !(Number(c.rempli) >= 3000))) return json({ ok: true }, 200);
  if (!nom) return json({ message: 'Indiquez votre nom ou votre pseudo.' }, 400);
  if (!email && !discord) return json({ message: 'Indiquez une adresse e-mail ou un pseudo Discord pour que je puisse vous contacter.' }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ message: "Cette adresse e-mail n'a pas l'air valide." }, 400);
  if (!DATE.test(c.date) || !HEURE.test(c.heure)) return json({ message: 'Choisissez un créneau.' }, 400);
  const t = Date.now();
  let raison = '';
  const { resultat } = await modifierAgenda(env, `Demande de rendez-vous : ${nom}`, donnees => {
    raison = '';
    const libres = creneauxLibres(donnees, t);
    if (!libres.actif) { raison = 'ferme'; return false; }
    const jour = libres.jours.find(j => j.date === c.date);
    if (!jour || !jour.creneaux.includes(c.heure)) { raison = 'pris'; return false; }
    const enAttente = donnees.rendezvous.filter(r => r.source === 'reservation' && r.statut === 'attente' && r.date >= jourParis(t)).length;
    if (enAttente >= MAX_DEMANDES) { raison = 'plein'; return false; }
    const categories = donnees.categories || [];
    const cat = categories.find(x => x.id === 'client') || categories[0];
    const total = minutesDe(c.heure) + libres.duree;
    const maintenant = new Date(t).toISOString();
    const rdv = {
      id: nouvelId(), titre: `Appel avec ${nom}`, categorie: cat ? cat.id : 'client',
      date: c.date, dateFin: c.date, journee: false, debut: c.heure, fin: heureDe(total % 1440),
      repetition: null, exceptions: [], rappels: [15], statut: 'attente',
      avec: discord ? `${nom} (${discord})` : nom, lieu: '',
      notes: [sujet && `Sujet : ${sujet}`, message].filter(Boolean).join('\n\n'), checklist: [],
      source: 'reservation', demande: { nom, email, discord, sujet, recue: maintenant },
      cree: maintenant, modifie: maintenant,
    };
    donnees.rendezvous.push(rdv);
    return rdv;
  });
  if (!resultat) {
    const messages = {
      ferme: "Je n'ai pas de disponibilités pour le moment. Écrivez-moi via le formulaire de contact.",
      pris: "Ce créneau vient d'être pris ou n'est plus disponible. Choisissez-en un autre.",
      plein: 'Beaucoup de demandes sont déjà en attente. Écrivez-moi via le formulaire de contact.',
    };
    return json({ message: messages[raison] || 'La demande n\'a pas pu être enregistrée.' }, 409);
  }
  // Prévenir le propriétaire en MP, avec les boutons Confirmer / Refuser
  if (env.DISCORD_BOT_TOKEN) {
    ctx.waitUntil(connecterBot(env).catch(() => {}).then(() => envoyerMp(env, messageDemande(resultat, page))).catch(e => console.error(`Demande : MP non envoyé — ${e.message}`)));
  }
  return json({ ok: true, date: resultat.date, heure: resultat.debut, fin: resultat.fin }, 200);
}

// « 10:00 » → « 10 h », « 10:30 » → « 10 h 30 »
const heureParlee = h => { const [a, b] = String(h).split(':'); return b === '00' ? `${Number(a)} h` : `${Number(a)} h ${b}`; };
const MESSAGE_CONFIRMATION = "Bonjour {nom} ! C'est validé pour notre appel du {date} à {heure} ({duree} min) sur Discord. À très vite, Mvrius";
function messageConfirmation(resa, r) {
  const d = r.demande || {};
  const duree = Math.max(0, (minutesDe(r.fin) || 1440) - minutesDe(r.debut));
  const valeurs = { nom: d.nom || '', date: jourTexte(r.date), heure: heureParlee(r.debut), fin: heureParlee(r.fin), duree: String(duree), sujet: d.sujet || '' };
  return (String(resa.message || '').trim() || MESSAGE_CONFIRMATION).replace(/\{(nom|date|heure|fin|duree|sujet)\}/g, (_, k) => valeurs[k]);
}

function messageDemande(r, page) {
  const d = r.demande;
  const champs = [];
  if (d.email) champs.push({ name: 'E-mail', value: d.email, inline: true });
  if (d.discord) champs.push({ name: 'Discord', value: d.discord, inline: true });
  if (d.sujet) champs.push({ name: 'Sujet', value: d.sujet, inline: true });
  const message = r.notes.replace(/^Sujet : .*(\n\n)?/, '');
  if (message) champs.push({ name: 'Message', value: coupe(message, 1024) });
  return {
    embeds: [{ title: coupe(`📅 Nouvelle demande de rendez-vous : ${d.nom}`, 256), description: `**${majuscule(jourTexte(r.date))}, ${r.debut} – ${r.fin}**\nEn attente de ta réponse.`, color: 0x3ddc84, url: page, fields: champs }],
    components: [{ type: 1, components: [
      { type: 2, style: 3, label: 'Confirmer', custom_id: `resa-ok|${r.id}|${r.date}` },
      { type: 2, style: 4, label: 'Refuser', custom_id: `resa-non|${r.id}|${r.date}` },
      { type: 2, style: 5, label: "Ouvrir l'agenda", url: page },
    ] }],
  };
}

/* ---------- Jours fériés (France métropolitaine) ---------- */
const feriesCache = new Map();
function feriesDe(a) {
  if (feriesCache.has(a)) return feriesCache.get(a);
  const b = a % 19, c = Math.floor(a / 100), e = a % 100, f = Math.floor(c / 4), g = c % 4;
  const h = (19 * b + c - f - Math.floor((c - Math.floor((c + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * g + 2 * Math.floor(e / 4) - h - (e % 4)) % 7;
  const m = Math.floor((b + 11 * h + 22 * l) / 451);
  const paques = `${a}-${deux(Math.floor((h + l - 7 * m + 114) / 31))}-${deux(((h + l - 7 * m + 114) % 31) + 1)}`;
  const liste = new Map([
    [`${a}-01-01`, "Jour de l'an"], [decale(paques, 1), 'Lundi de Pâques'], [`${a}-05-01`, 'Fête du Travail'],
    [`${a}-05-08`, 'Victoire 1945'], [decale(paques, 39), 'Ascension'], [decale(paques, 50), 'Lundi de Pentecôte'],
    [`${a}-07-14`, 'Fête nationale'], [`${a}-08-15`, 'Assomption'], [`${a}-11-01`, 'Toussaint'],
    [`${a}-11-11`, 'Armistice 1918'], [`${a}-12-25`, 'Noël'],
  ]);
  feriesCache.set(a, liste);
  return liste;
}
const ferieDe = d => feriesDe(Number(d.slice(0, 4))).get(d) || '';

/* ---------- Dates (heure de Paris) ---------- */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;
const PAS = { jour: 1, semaine: 7, '2semaines': 14 };
const BASE = '2000-01-01';
const deux = n => String(n).padStart(2, '0');
const minutesDe = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
const heureDe = m => `${deux(Math.floor(m / 60) % 24)}:${deux(m % 60)}`;
const versDate = s => { const [a, m, j] = s.split('-').map(Number); return new Date(Date.UTC(a, m - 1, j)); };
const versTexte = d => d.toISOString().slice(0, 10);
const decale = (s, n) => { const d = versDate(s); d.setUTCDate(d.getUTCDate() + n); return versTexte(d); };
const ecart = (a, b) => Math.round((versDate(b) - versDate(a)) / 864e5);
const jourDeLaSemaine = d => versDate(d).getUTCDay() || 7; // 1 = lundi … 7 = dimanche
const parisFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const morceaux = t => Object.fromEntries(parisFormat.formatToParts(new Date(t)).map(p => [p.type, p.value]));
const jourParis = t => { const p = morceaux(t); return `${p.year}-${p.month}-${p.day}`; };
const heureParis = t => { const p = morceaux(t); return `${p.hour}:${p.minute}`; };
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
