/* ==========================================================================
   Agenda de Mvrius — serveur de connexion (Cloudflare Worker)

   - Connexion avec Discord : un seul compte est accepté (DISCORD_ID_AUTORISE).
   - Donne à la page mvriuus.fr/agenda/ un jeton de session signé (30 jours).
   - Sert d'intermédiaire avec le dépôt GitHub PRIVÉ « agenda-donnees » : la clé
     GitHub reste ici, jamais dans le navigateur.

   Variables à créer dans Cloudflare (Worker › Settings › Variables and Secrets) :
     DISCORD_CLIENT_ID      texte   identifiant de l'application Discord
     DISCORD_CLIENT_SECRET  secret  secret de l'application Discord
     DISCORD_ID_AUTORISE    texte   ton identifiant Discord (le seul compte accepté)
     GITHUB_TOKEN           secret  jeton GitHub limité au dépôt agenda-donnees
                                    (Contents : Read and write)
   Facultatif : PAGE (adresse de l'agenda, par défaut https://mvriuus.fr/agenda/)

   Changer DISCORD_CLIENT_SECRET ou GITHUB_TOKEN déconnecte tous les appareils.
   ========================================================================== */

const DEPOT = 'mariusboost63-stack/agenda-donnees';
const FICHIER = 'agenda.json';
const PAGE_PAR_DEFAUT = 'https://mvriuus.fr/agenda/';
const DUREE_SESSION = 30 * 24 * 3600; // secondes

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
      return new Response("Serveur de l'agenda de Mvrius.", { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch (e) {
      return cors(json({ message: 'Erreur du serveur.' }, 500), origine);
    }
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
  r.headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  r.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-GitHub-Api-Version');
  r.headers.set('Access-Control-Max-Age', '86400');
  r.headers.set('Vary', 'Origin');
  return r;
}
