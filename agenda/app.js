/* ==========================================================================
   Agenda privé de Mvrius — mvriuus.fr/agenda/
   Les rendez-vous sont dans le fichier agenda.json du dépôt GitHub PRIVÉ
   « agenda-donnees ». Cette page ne contient aucune donnée. Elle passe par le
   serveur de connexion (tools/agenda-worker.js, sur Cloudflare) : connexion
   avec Discord, un seul compte accepté, et la clé GitHub reste sur le serveur.
   Chaque changement devient un commit : tout l'historique reste sur GitHub.
   ========================================================================== */
(() => {
  'use strict';

  const DEPOT = { nom: 'agenda-donnees', fichier: 'agenda.json', branche: 'main' };
  const SERVEUR = String(window.AGENDA_SERVEUR || '').replace(/\/+$/, '');
  const API = `${SERVEUR}/depot`;
  const STOCK = { session: 'agenda-session', cache: 'agenda-cache', attente: 'agenda-attente', vue: 'agenda-vue', masquees: 'agenda-masquees' };

  const CATEGORIES = [
    { id: 'client', nom: 'Client', couleur: '#8b9bff' },
    { id: 'appel', nom: 'Appel', couleur: '#6ee7ff' },
    { id: 'discord', nom: 'Discord', couleur: '#c3a6ff' },
    { id: 'perso', nom: 'Perso', couleur: '#3ddc84' },
    { id: 'important', nom: 'Important', couleur: '#ff6b8b' },
    { id: 'autre', nom: 'Autre', couleur: '#f5b971' },
  ];
  const COULEURS = ['#8b9bff', '#6ee7ff', '#c3a6ff', '#3ddc84', '#ff6b8b', '#f5b971', '#ffd166', '#f78fd8', '#9ba3ba'];
  const REPETITIONS = [['', 'Ne se répète pas'], ['jour', 'Chaque jour'], ['semaine', 'Chaque semaine'], ['2semaines', 'Toutes les 2 semaines'], ['mois', 'Chaque mois']];
  const STATUTS = [['confirme', 'Confirmé'], ['attente', 'En attente'], ['annule', 'Annulé']];
  // Rappels Discord, en minutes avant le début (pour une journée entière, le début est minuit).
  // Plusieurs rappels possibles par rendez-vous ; sans réglage : 15 min avant (9:00 pour une journée).
  const RAPPELS = [['0', "À l'heure"], ['5', '5 min'], ['15', '15 min'], ['30', '30 min'], ['60', '1 h'], ['120', '2 h'], ['1440', '1 jour'], ['2880', '2 jours']];
  const RAPPELS_JOURNEE = [['-480', 'Le jour même à 8:00'], ['-540', 'Le jour même à 9:00'], ['360', 'La veille à 18:00'], ['2340', '2 jours avant à 9:00']];
  const rappelDefaut = journee => (journee ? -540 : 15);
  const rappelsDe = r => (Array.isArray(r.rappels) ? r.rappels.filter(Number.isFinite)
    : r.rappel === undefined ? [rappelDefaut(r.journee)] : Number.isFinite(r.rappel) ? [r.rappel] : []);
  const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const TRAVAIL_DEFAUT = { jours: [1, 2, 3, 4, 5], debut: '09:00', fin: '18:00', griser: true, semaineTravail: false };
  const RESA_DEFAUT = {
    actif: false, duree: 30, pause: 10, delai: 24, horizon: 14,
    plages: { 1: [['10:00', '12:00'], ['14:00', '18:00']], 2: [['10:00', '12:00'], ['14:00', '18:00']], 3: [['10:00', '12:00'], ['14:00', '18:00']], 4: [['10:00', '12:00'], ['14:00', '18:00']], 5: [['10:00', '12:00'], ['14:00', '18:00']] },
  };
  const PAS = { jour: 1, semaine: 7, '2semaines': 14 };
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const HEURE = /^\d{2}:\d{2}$/;

  /* ---------- Outils ---------- */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const sansAccents = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const couleurSure = c => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#9ba3ba');
  const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const icone = (nom, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${nom}"/></svg>`;
  const stock = {
    lire(cle, defaut) { try { const v = localStorage.getItem(cle); return v === null ? defaut : JSON.parse(v); } catch (e) { return defaut; } },
    ecrire(cle, valeur) { try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) { /* stockage plein ou bloqué */ } },
    effacer(cle) { try { localStorage.removeItem(cle); } catch (e) { /* rien à faire */ } },
  };

  // Dates « AAAA-MM-JJ » et heures « HH:MM », toujours en heure locale (pas de fuseau dans le fichier)
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const jour = s => { const [a, m, j] = s.split('-').map(Number); return new Date(a, m - 1, j); };
  const decale = (s, n) => { const d = jour(s); return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
  const ecart = (a, b) => Math.round((jour(b) - jour(a)) / 864e5);
  const lundiDe = s => decale(s, -((jour(s).getDay() + 6) % 7));
  const aujourdhui = () => iso(new Date());
  const minutes = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
  const heure = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  const maintenant = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const fmt = (s, o) => new Intl.DateTimeFormat('fr-FR', o).format(typeof s === 'string' ? jour(s) : s);
  const maj1 = s => s.charAt(0).toUpperCase() + s.slice(1);
  const quand = d => {
    const auj = aujourdhui();
    if (d === auj) return "Aujourd'hui";
    if (d === decale(auj, 1)) return 'Demain';
    if (d === decale(auj, -1)) return 'Hier';
    return fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
  };
  function semaineIso(s) {
    const d = jour(s);
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
  }

  /* ---------- État ---------- */
  // Session donnée par le serveur après la connexion Discord : « charge.signature »
  function lireSession(jeton) {
    try {
      const charge = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(jeton.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
      return charge.exp * 1000 > Date.now() ? { jeton, ...charge } : null;
    } catch (e) {
      return null;
    }
  }
  // Retour de Discord : #session=… ou #erreur=…
  const fragment = new URLSearchParams(location.hash.slice(1));
  let messageConnexion = '';
  if (fragment.has('session') || fragment.has('erreur')) {
    if (fragment.get('session')) stock.ecrire(STOCK.session, fragment.get('session'));
    messageConnexion = {
      refuse: "Ce compte Discord n'a pas accès à cet agenda.",
      annule: 'Connexion annulée.',
      etat: 'La connexion a pris trop de temps. Réessaie.',
      discord: "Discord n'a pas répondu. Réessaie dans un instant.",
    }[fragment.get('erreur')] || '';
    history.replaceState(null, '', location.pathname + location.search);
  }

  const petit = matchMedia('(max-width: 720px)');
  const etat = {
    session: lireSession(stock.lire(STOCK.session, '') || ''),
    distant: null, // { donnees, sha } : dernière version lue ou écrite sur GitHub
    attente: stock.lire(STOCK.attente, []), // changements pas encore envoyés
    vue: stock.lire(STOCK.vue, petit.matches ? 'liste' : 'semaine'),
    curseur: aujourdhui(),
    mini: null,
    masquees: new Set(stock.lire(STOCK.masquees, [])),
    recherche: '',
  };
  if (!['jour', 'semaine', 'mois', 'liste'].includes(etat.vue)) etat.vue = 'semaine';
  // Sur téléphone, la semaine devient une vue de 3 jours
  const vueEffective = () => (petit.matches && etat.vue === 'semaine' ? 'trois' : etat.vue);

  /* ---------- Données ---------- */
  const vide = () => ({ format: 1, categories: clone(CATEGORIES), rendezvous: [], taches: [], reglages: {} });
  function normaliser(d) {
    d = d && typeof d === 'object' ? d : {};
    const cats = Array.isArray(d.categories) && d.categories.length
      ? d.categories.filter(c => c && c.id).map(c => ({ id: String(c.id), nom: String(c.nom || c.id), couleur: couleurSure(c.couleur) }))
      : clone(CATEGORIES);
    const rdv = (Array.isArray(d.rendezvous) ? d.rendezvous : [])
      .filter(r => r && r.id && DATE.test(r.date) && (r.journee || (HEURE.test(r.debut) && HEURE.test(r.fin))));
    const taches = (Array.isArray(d.taches) ? d.taches : []).filter(t => t && t.id && typeof t.titre === 'string' && DATE.test(t.date));
    const reglages = d.reglages && typeof d.reglages === 'object' && !Array.isArray(d.reglages) ? d.reglages : {};
    return { format: 1, categories: cats, rendezvous: rdv, taches, reglages };
  }
  // Un changement = une opération rejouable : en cas de conflit avec un autre appareil,
  // on relit le fichier sur GitHub et on rejoue les opérations par-dessus.
  function appliquer(d, op) {
    if (op.type === 'tache' || op.type === 'supprimerTache') {
      d.taches = d.taches || [];
      const k = d.taches.findIndex(t => t.id === (op.tache ? op.tache.id : op.id));
      if (op.type === 'supprimerTache') { if (k >= 0) d.taches.splice(k, 1); }
      else if (k >= 0) d.taches[k] = clone(op.tache);
      else d.taches.push(clone(op.tache));
      return;
    }
    const i = d.rendezvous.findIndex(r => r.id === (op.rdv ? op.rdv.id : op.id));
    if (op.type === 'enregistrer') {
      if (i >= 0) d.rendezvous[i] = clone(op.rdv);
      else d.rendezvous.push(clone(op.rdv));
    } else if (op.type === 'supprimer') {
      if (i >= 0) d.rendezvous.splice(i, 1);
    } else if (op.type === 'sauter') {
      if (i >= 0) { const r = d.rendezvous[i]; r.exceptions = [...new Set([...(r.exceptions || []), op.date])].sort(); }
    } else if (op.type === 'categories') {
      d.categories = clone(op.categories);
    } else if (op.type === 'reglages') {
      d.reglages = { ...d.reglages, ...clone(op.reglages) };
    }
  }
  let cacheDonnees = null;
  const donnees = () => {
    if (!cacheDonnees) {
      cacheDonnees = clone(etat.distant.donnees);
      etat.attente.forEach(op => appliquer(cacheDonnees, op));
    }
    return cacheDonnees;
  };
  const invalider = () => { cacheDonnees = null; };
  const categories = () => donnees().categories;
  const categorie = id => categories().find(c => c.id === id) || { id, nom: 'Sans catégorie', couleur: '#9ba3ba' };
  const trouver = id => donnees().rendezvous.find(r => r.id === id);
  const travail = () => ({ ...TRAVAIL_DEFAUT, ...((donnees().reglages || {}).travail || {}) });
  const reservation = () => ({ ...RESA_DEFAUT, ...((donnees().reglages || {}).reservation || {}) });
  const jourIso = d => jour(d).getDay() || 7; // 1 = lundi … 7 = dimanche

  // Dernier jour d'un rendez-vous : il peut durer plusieurs jours (journées entières ou horaires)
  const jourDeFin = r => (DATE.test(r.dateFin) && r.dateFin > r.date ? r.dateFin : r.date);
  const etendue = r => ecart(r.date, jourDeFin(r));
  // Instants en minutes : une fin à « 00:00 » veut dire minuit, à la fin de ce jour-là
  const BASE = '2000-01-01';
  const instantDebut = (d, h) => ecart(BASE, d) * 1440 + minutes(h);
  const instantFin = (d, h) => ecart(BASE, d) * 1440 + (minutes(h) || 1440);
  const finDepuis = total => { const j = Math.ceil(total / 1440) - 1; return [decale(BASE, j), heure(total - j * 1440)]; };

  // Dates des occurrences d'un rendez-vous entre « de » et « a » (inclus)
  function occurrences(r, de, a) {
    const duree = etendue(r);
    const res = [];
    const garder = d => { if (d <= a && decale(d, duree) >= de) res.push(d); };
    const rep = r.repetition;
    if (!rep || !rep.frequence) { garder(r.date); return res; }
    const limite = DATE.test(rep.jusquau) && rep.jusquau < a ? rep.jusquau : a;
    const sauf = new Set(r.exceptions || []);
    if (PAS[rep.frequence]) {
      const pas = PAS[rep.frequence];
      const k = Math.max(0, Math.floor((ecart(r.date, de) - duree) / pas));
      for (let d = decale(r.date, k * pas); d <= limite; d = decale(d, pas)) if (!sauf.has(d)) garder(d);
    } else if (rep.frequence === 'mois') {
      const debut = jour(r.date);
      const j = debut.getDate();
      const deD = jour(de);
      let m = Math.max(0, (deD.getFullYear() - debut.getFullYear()) * 12 + deD.getMonth() - debut.getMonth() - 1);
      for (let n = 0; n < 600; n++, m++) {
        const dt = new Date(debut.getFullYear(), debut.getMonth() + m, j);
        if (dt.getDate() !== j) { // pas de 31 ce mois-ci
          if (iso(new Date(debut.getFullYear(), debut.getMonth() + m, 1)) > limite) break;
          continue;
        }
        const d = iso(dt);
        if (d > limite) break;
        if (!sauf.has(d)) garder(d);
      }
    }
    return res;
  }
  function inst(r, d) {
    const dernier = decale(d, etendue(r));
    if (r.journee) return { r, date: d, fin: dernier, debut: -1, finM: 1440 };
    const debut = minutes(r.debut);
    const fin = minutes(r.fin) || 1440; // « 00:00 » en fin = minuit
    // Sur plusieurs jours : « longue » s'il dure 24 h ou plus (affiché avec les journées entières)
    if (dernier !== d) return { r, date: d, fin: dernier, debut, finM: fin, plusieurs: true, longue: etendue(r) * 1440 + fin - debut >= 1440 };
    return { r, date: d, fin: d, debut, finM: fin > debut ? fin : debut + 30 };
  }
  // Pas encore terminé (liste et « À venir »)
  function pasFini(i) {
    const auj = aujourdhui();
    if (i.fin !== auj) return i.fin > auj;
    return i.r.journee || i.finM > maintenant();
  }
  function instances(de, a, toutes = false) {
    const res = [];
    for (const r of donnees().rendezvous) {
      if (!toutes && etat.masquees.has(r.categorie)) continue;
      for (const d of occurrences(r, de, a)) res.push(inst(r, d));
    }
    return res.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.debut - y.debut || String(x.r.titre).localeCompare(String(y.r.titre), 'fr')));
  }

  /* ---------- GitHub ---------- */
  class ErreurAgenda extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const b64 = {
    encoder(s) {
      const o = new TextEncoder().encode(s);
      let b = '';
      for (let i = 0; i < o.length; i += 0x8000) b += String.fromCharCode(...o.subarray(i, i + 0x8000));
      return btoa(b);
    },
    decoder: s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0))),
  };
  async function gh(chemin, options = {}) {
    try {
      return await fetch(API + chemin, {
        ...options,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${etat.session ? etat.session.jeton : ''}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch (e) {
      throw new ErreurAgenda('reseau', "Impossible de joindre le serveur de l'agenda. Vérifie ta connexion.");
    }
  }
  async function erreurGh(rep, ecriture) {
    const brut = (await rep.json().catch(() => ({}))).message || '';
    const message = brut.toLowerCase();
    if (rep.status === 401) return new ErreurAgenda('session', 'Ta session a expiré. Reconnecte-toi avec Discord.');
    if (rep.status === 502) return new ErreurAgenda('acces', brut);
    if (rep.status === 403 && message.includes('rate limit')) return new ErreurAgenda('reseau', 'GitHub limite les demandes pour le moment. Nouvel essai dans un instant.');
    if (rep.status === 403 || rep.status === 404) {
      return new ErreurAgenda('acces', ecriture
        ? "Le serveur peut lire l'agenda mais pas l'écrire : donne au jeton GITHUB_TOKEN la permission « Contents : Read and write »."
        : `Le serveur n'a pas accès au dépôt « ${DEPOT.nom} ». Vérifie le jeton GITHUB_TOKEN dans Cloudflare.`);
    }
    return new ErreurAgenda('reseau', `Le serveur a répondu une erreur (${rep.status}). Nouvel essai dans un instant.`);
  }
  async function lireDistant() {
    const rep = await gh(`/contents/${DEPOT.fichier}?ref=${DEPOT.branche}`);
    if (rep.status === 404) {
      const depot = await gh('');
      if (!depot.ok) throw await erreurGh(depot, false);
      return { donnees: vide(), sha: null }; // dépôt accessible mais encore vide
    }
    if (!rep.ok) throw await erreurGh(rep, false);
    const json = await rep.json();
    let contenu;
    try { contenu = JSON.parse(b64.decoder(json.content)); } catch (e) { throw new ErreurAgenda('fichier', `Le fichier ${DEPOT.fichier} n'est pas un JSON valide. Corrige-le sur GitHub.`); }
    return { donnees: normaliser(contenu), sha: json.sha };
  }
  async function ecrireDistant(donneesAEcrire, sha, message) {
    const corps = { message, content: b64.encoder(JSON.stringify(donneesAEcrire, null, 2) + '\n') };
    // Création du fichier : branche par défaut (le dépôt peut encore être vide)
    if (sha) Object.assign(corps, { sha, branch: DEPOT.branche });
    const rep = await gh(`/contents/${DEPOT.fichier}`, { method: 'PUT', body: JSON.stringify(corps) });
    if (rep.status === 409 || (rep.status === 422 && !sha)) return { conflit: true };
    if (!rep.ok) throw await erreurGh(rep, true);
    return { sha: (await rep.json()).content.sha };
  }
  function messageCommit(ops) {
    if (ops.length !== 1) return `Agenda : ${ops.length} changements`;
    const op = ops[0];
    const r = op.rdv;
    const date = r ? ` (${fmt(r.date, { day: 'numeric', month: 'short' })}${r.journee ? '' : ` ${r.debut}`})` : '';
    if (op.type === 'enregistrer') return `${op.nouveau ? 'Ajout' : 'Modification'} : ${r.titre}${date}`;
    if (op.type === 'supprimer') return `Suppression : ${op.titre || 'rendez-vous'}`;
    if (op.type === 'sauter') return `Occurrence retirée : ${op.titre || 'rendez-vous'} (${op.date})`;
    if (op.type === 'reglages') return 'Réglages mis à jour';
    if (op.type === 'tache') return `${op.nouveau ? 'Tâche ajoutée' : op.tache.fait ? 'Tâche faite' : 'Tâche modifiée'} : ${op.tache.titre}`;
    if (op.type === 'supprimerTache') return `Tâche supprimée : ${op.titre || ''}`;
    return 'Catégories mises à jour';
  }

  /* ---------- Synchronisation ---------- */
  let synchroEnCours = false;
  let synchroEncore = false;
  let relance = null;
  function statut(s, detail) {
    const el = $('#synchro');
    el.dataset.etat = s;
    $('span', el).textContent = { ok: 'À jour', envoi: 'Enregistrement…', 'hors-ligne': 'Hors ligne', erreur: 'Erreur' }[s];
    const titre = detail || {
      ok: 'Tout est enregistré dans ton dépôt privé.',
      envoi: 'Enregistrement sur GitHub…',
      'hors-ligne': 'Pas de connexion : tes changements seront envoyés dès le retour du réseau.',
      erreur: "L'enregistrement a échoué. Clique pour réessayer.",
    }[s];
    el.title = titre;
    el.setAttribute('aria-label', `Synchronisation : ${titre}`);
  }
  function operation(ops) {
    etat.attente.push(...[].concat(ops));
    stock.ecrire(STOCK.attente, etat.attente);
    invalider();
    rendre();
    synchroniser();
  }
  async function synchroniser() {
    if (!etat.session || !etat.distant) return;
    if (synchroEnCours) { synchroEncore = true; return; }
    clearTimeout(relance);
    if (!etat.attente.length) { statut('ok'); return; }
    synchroEnCours = true;
    statut('envoi');
    let relu = false;
    try {
      while (etat.attente.length) {
        const ops = etat.attente.slice();
        for (let essai = 0; ; essai++) {
          const base = clone(etat.distant.donnees);
          ops.forEach(op => appliquer(base, op));
          const res = await ecrireDistant(base, etat.distant.sha, messageCommit(ops));
          if (res.conflit) {
            // Un autre appareil a écrit entre-temps : on relit et on rejoue nos changements
            if (essai >= 3) throw new ErreurAgenda('reseau', 'Conflit avec un autre appareil. Nouvel essai dans un instant.');
            etat.distant = await lireDistant();
            relu = true;
            continue;
          }
          etat.distant = { donnees: base, sha: res.sha };
          etat.attente.splice(0, ops.length);
          stock.ecrire(STOCK.attente, etat.attente);
          stock.ecrire(STOCK.cache, etat.distant);
          invalider();
          break;
        }
      }
      statut('ok');
      if (relu && !glisse) rendre();
    } catch (err) {
      gererErreur(err);
    } finally {
      synchroEnCours = false;
      if (synchroEncore) { synchroEncore = false; synchroniser(); }
    }
  }
  function gererErreur(err) {
    if (err.code === 'session' || err.code === 'acces') {
      statut('erreur', err.message);
      if (err.code === 'session') { etat.session = null; stock.effacer(STOCK.session); stock.effacer(STOCK.cache); }
      montrerConnexion(err.message);
      return;
    }
    statut(err.code === 'reseau' ? 'hors-ligne' : 'erreur', err.message);
    clearTimeout(relance);
    relance = setTimeout(synchroniser, 20000);
  }
  // Récupère les changements faits depuis un autre appareil
  async function rafraichir() {
    if (!etat.session || !etat.distant || synchroEnCours || etat.attente.length || document.hidden || glisse) return;
    try {
      const d = await lireDistant();
      if (d.sha && d.sha !== etat.distant.sha && !etat.attente.length && !synchroEnCours) {
        etat.distant = d;
        stock.ecrire(STOCK.cache, d);
        invalider();
        rendre();
      }
      statut('ok');
    } catch (err) {
      if (err.code === 'reseau') statut('hors-ligne', err.message);
      else gererErreur(err);
    }
  }

  /* ---------- Connexion ---------- */
  const ecranConnexion = $('#connexion');
  const app = $('#app');
  function montrerConnexion(message = '', chargement = false) {
    ecranConnexion.hidden = false;
    ecranConnexion.classList.toggle('is-chargement', chargement);
    $('#c-erreur').textContent = message;
  }
  function demarrer() {
    ecranConnexion.hidden = true;
    app.hidden = false;
    invalider();
    rendreCompte();
    rendre();
    synchroniser();
  }
  async function ouvrir() {
    if (!SERVEUR) {
      $('#c-discord').hidden = true;
      montrerConnexion("La connexion Discord n'est pas encore configurée.");
      return;
    }
    $('#c-discord').href = `${SERVEUR}/connexion`;
    if (!etat.session) { montrerConnexion(messageConnexion); return; }
    const cache = stock.lire(STOCK.cache, null);
    if (cache && cache.donnees) {
      etat.distant = { donnees: normaliser(cache.donnees), sha: cache.sha || null };
      demarrer();
    } else {
      montrerConnexion('', true);
    }
    try {
      let d = await lireDistant();
      if (!d.sha) d = { donnees: d.donnees, sha: (await ecrireDistant(d.donnees, null, "Création de l'agenda")).sha };
      if (!etat.distant || d.sha !== etat.distant.sha) {
        etat.distant = d;
        stock.ecrire(STOCK.cache, d);
        invalider();
      }
      if (app.hidden || !ecranConnexion.hidden) demarrer();
      else { rendre(); synchroniser(); }
    } catch (err) {
      if (err.code === 'session') { etat.session = null; stock.effacer(STOCK.session); stock.effacer(STOCK.cache); montrerConnexion(err.message); }
      else if (err.code === 'acces' || err.code === 'fichier' || !etat.distant) montrerConnexion(err.message);
      else statut('hors-ligne', err.message);
    }
  }
  $('#c-discord').addEventListener('click', () => ecranConnexion.classList.add('is-chargement'));
  // Retour arrière depuis Discord : la page revient de la mémoire du navigateur
  window.addEventListener('pageshow', e => { if (e.persisted) ecranConnexion.classList.remove('is-chargement'); });
  function rendreCompte() {
    const s = etat.session;
    if (!s) return;
    const avatar = s.avatar && /^[\w]+$/.test(s.avatar) && /^\d+$/.test(s.id)
      ? `<img src="https://cdn.discordapp.com/avatars/${s.id}/${s.avatar}.png?size=64" alt="" width="34" height="34">`
      : `<span>${esc(String(s.nom || '?').charAt(0).toUpperCase())}</span>`;
    $('#menu-compte').innerHTML = `${avatar}<div><small>Connecté avec Discord</small><b>${esc(s.nom || 'Mvrius')}</b></div>`;
    $('#menu').innerHTML = avatar; // ta photo Discord sert de bouton de menu
  }
  function deconnecter() {
    if (etat.attente.length && !confirm("Des changements ne sont pas encore enregistrés et seront perdus. Te déconnecter quand même ?")) return;
    Object.values(STOCK).forEach(cle => stock.effacer(cle));
    location.reload();
  }

  /* ---------- Rendu général ---------- */
  const vueEl = $('#vue');
  const defil = { cle: null, haut: 0 };
  function rendre(sens = 0) {
    if (!etat.distant || app.hidden) return;
    const v = etat.recherche ? 'liste' : vueEffective();
    $('#periode').innerHTML = titrePeriode(v);
    $$('.b-vues button').forEach(b => b.setAttribute('aria-pressed', String(!etat.recherche && b.dataset.vue === etat.vue)));
    $('#b-nav').classList.toggle('sans-fleches', v === 'liste');

    const ancienne = $('.grille', vueEl);
    if (ancienne) defil.haut = ancienne.scrollTop;
    const ancienneListe = $('.liste, .mois', vueEl);
    const hautListe = ancienneListe && vueEl.dataset.vue === v && !sens ? ancienneListe.scrollTop : 0;
    let html;
    if (v === 'jour') html = rendreGrille([etat.curseur]);
    else if (v === 'semaine') html = rendreGrille(joursSemaine());
    else if (v === 'trois') html = rendreGrille([0, 1, 2].map(k => decale(etat.curseur, k)));
    else if (v === 'mois') html = rendreMois();
    else html = rendreListe();
    vueEl.innerHTML = html;
    vueEl.dataset.vue = v;

    const grille = $('.grille', vueEl);
    if (grille) {
      const cle = `${v}|${v === 'semaine' ? lundiDe(etat.curseur) : etat.curseur}`;
      if (cle === defil.cle) grille.scrollTop = defil.haut;
      else { grille.scrollTop = defilementInitial(grille); defil.cle = cle; }
    } else {
      const liste = $('.liste, .mois', vueEl);
      if (liste) liste.scrollTop = hautListe;
    }
    if (sens) {
      vueEl.dataset.sens = sens > 0 ? 'suiv' : 'prec';
      vueEl.classList.remove('anim');
      void vueEl.offsetWidth;
      vueEl.classList.add('anim');
    }
    rendreCote();
  }
  function titrePeriode(v) {
    if (etat.recherche) return `Recherche <small>«&nbsp;${esc(etat.recherche)}&nbsp;»</small>`;
    const c = etat.curseur;
    if (v === 'jour') return `${esc(maj1(fmt(c, { weekday: 'long', day: 'numeric', month: 'long' })))} <small>${jour(c).getFullYear()}</small>`;
    if (v === 'semaine') {
      const l = lundiDe(c);
      const d = decale(l, 6);
      const a = jour(l);
      const b = jour(d);
      const txt = a.getMonth() === b.getMonth()
        ? `${a.getDate()} – ${b.getDate()} ${fmt(d, { month: 'long' })}`
        : `${fmt(l, { day: 'numeric', month: 'short' })} – ${fmt(d, { day: 'numeric', month: 'short' })}`;
      return `${esc(txt)} <small>sem. ${semaineIso(l)}</small>`;
    }
    if (v === 'trois') {
      const d = decale(c, 2);
      const txt = jour(c).getMonth() === jour(d).getMonth()
        ? `${jour(c).getDate()} – ${jour(d).getDate()} ${fmt(d, { month: 'short' })}`
        : `${fmt(c, { day: 'numeric', month: 'short' })} – ${fmt(d, { day: 'numeric', month: 'short' })}`;
      return esc(txt);
    }
    if (v === 'mois') return `${esc(maj1(fmt(c, { month: 'long' })))} <small>${jour(c).getFullYear()}</small>`;
    return 'À venir';
  }
  const hauteurHeure = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--h')) || 52;
  function defilementInitial(grille) {
    const H = hauteurHeure();
    const jours = $$('.g-col', grille).map(c => c.dataset.date);
    let m;
    if (jours.includes(aujourdhui())) m = maintenant() - 90;
    else {
      const premiers = $$('.ev', grille).map(e => Number(e.style.getPropertyValue('--d')));
      m = Math.min(...premiers, minutes(travail().debut)) - 30;
    }
    return Math.max(0, m) * H / 60;
  }

  /* ---------- Vues Jour et Semaine ---------- */
  // Jours de la semaine affichée (seulement les jours travaillés si le réglage est activé)
  function joursSemaine() {
    const l = lundiDe(etat.curseur);
    const tous = Array.from({ length: 7 }, (_, k) => decale(l, k));
    const t = travail();
    const ouvres = t.semaineTravail ? tous.filter(d => t.jours.includes(jourIso(d))) : tous;
    return ouvres.length ? ouvres : tous;
  }
  function placer(liste) {
    // Rendez-vous qui se chevauchent : côte à côte, en colonnes
    const tries = liste.slice().sort((a, b) => a.debut - b.debut || b.finM - a.finM);
    let groupe = [];
    let colonnes = [];
    let finGroupe = -1;
    const fermer = () => { groupe.forEach(i => { i.total = colonnes.length; }); groupe = []; colonnes = []; };
    for (const i of tries) {
      const fin = Math.max(i.finM, i.debut + 20);
      if (i.debut >= finGroupe) { fermer(); finGroupe = -1; }
      let c = colonnes.findIndex(f => f <= i.debut);
      if (c < 0) { c = colonnes.length; colonnes.push(fin); } else colonnes[c] = fin;
      i.col = c;
      groupe.push(i);
      finGroupe = Math.max(finGroupe, fin);
    }
    fermer();
    return tries;
  }
  const jourCourt = d => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
  function libelleHoraire(i) {
    const r = i.r;
    if (r.journee) return i.fin === i.date ? 'Toute la journée' : `Du ${jourCourt(i.date)} au ${jourCourt(i.fin)}`;
    return i.fin === i.date ? `${r.debut} – ${r.fin}` : `${jourCourt(i.date)} ${r.debut} → ${jourCourt(i.fin)} ${r.fin}`;
  }
  function blocEv(i) {
    const c = categorie(i.r.categorie);
    const duree = i.finM - i.debut;
    const label = `${libelleHoraire(i)}, ${i.r.titre}${i.r.avec ? `, avec ${i.r.avec}` : ''}`;
    return `<button type="button" class="ev statut-${esc(i.r.statut || 'confirme')}${duree < 45 ? ' ev--court' : ''}${i.plusieurs ? ' ev--plusieurs' : ''}" data-id="${esc(i.r.id)}" data-date="${i.date}" style="--c:${couleurSure(c.couleur)};--d:${i.debut};--l:${duree};--col:${i.col};--tot:${i.total}" aria-label="${esc(label)}">`
      + `<span class="ev-titre">${i.r.repetition ? icone('repete') : ''}${esc(i.r.titre)}</span>`
      + `<span class="ev-heure">${i.r.debut} ${i.plusieurs ? '→' : '–'} ${i.r.fin}${i.r.avec ? ` · ${esc(i.r.avec)}` : ''}</span>`
      + '<span class="ev-poignee" aria-hidden="true"></span></button>';
  }
  // d : jour où la pastille est affichée (heure de début le premier jour, heure de fin le dernier)
  function puce(i, avecHeure, d) {
    const c = categorie(i.r.categorie);
    let h = '';
    if (avecHeure && !i.r.journee) h = !i.plusieurs || !d || d === i.date ? i.r.debut : d === i.fin ? `→ ${i.r.fin}` : '';
    return `<button type="button" class="puce${i.r.journee || i.plusieurs ? ' puce--jour' : ''} statut-${esc(i.r.statut || 'confirme')}" data-id="${esc(i.r.id)}" data-date="${i.date}" style="--c:${couleurSure(c.couleur)}" aria-label="${esc(`${libelleHoraire(i)}, ${i.r.titre}`)}">`
      + `${h ? `<time>${h}</time>` : ''}<span>${esc(i.r.titre)}</span></button>`;
  }
  function rendreGrille(jours) {
    const de = jours[0];
    const a = jours[jours.length - 1];
    const auj = aujourdhui();
    const liste = instances(de, a);
    const t = travail();
    const repos = d => !t.jours.includes(jourIso(d));
    // Heures hors travail grisées (journée entière grisée les jours de repos)
    const horaires = d => (t.griser ? ` a-horaires" style="--td:${repos(d) ? 1440 : minutes(t.debut)};--tf:${repos(d) ? 1440 : minutes(t.fin) || 1440}` : '');
    const tete = jours.map(d => `<button type="button" class="g-jour${d === auj ? ' is-auj' : ''}${t.griser && repos(d) ? ' is-repos' : ''}" data-aller="${d}" aria-label="${esc(maj1(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })))}"><span>${esc(fmt(d, { weekday: 'short' }).replace('.', ''))}</span><b>${jour(d).getDate()}</b></button>`).join('');
    // En haut : journées entières et rendez-vous de 24 h ou plus ; dans la grille : le reste,
    // découpé jour par jour s'il passe minuit (ex. 22:00 → 02:00)
    const enHaut = i => i.r.journee || i.longue;
    const journee = jours.map(d => `<div class="g-jt" data-date="${d}">${liste.filter(i => enHaut(i) && i.date <= d && i.fin >= d).map(i => puce(i, true, d)).join('')}</div>`).join('');
    const morceaux = d => liste.filter(i => !enHaut(i) && i.date <= d && i.fin >= d)
      .map(i => (i.plusieurs ? { ...i, debut: i.date === d ? i.debut : 0, finM: i.fin === d ? i.finM : 1440 } : i));
    const heures = Array.from({ length: 23 }, (_, h) => `<span style="--d:${(h + 1) * 60}">${pad(h + 1)}:00</span>`).join('');
    const colonnes = jours.map(d => `<div class="g-col${d === auj ? ' is-auj' : ''}${horaires(d)}" data-date="${d}">${placer(morceaux(d)).map(blocEv).join('')}${d === auj ? `<div class="maintenant" style="--d:${maintenant()}"></div>` : ''}</div>`).join('');
    return `<div class="grille" style="--n:${jours.length}">`
      + `<div class="g-tete"><div class="g-coin"></div>${tete}<div class="g-coin g-coin--jt">Journée</div>${journee}</div>`
      + `<div class="g-corps"><div class="g-heures" aria-hidden="true">${heures}</div>${colonnes}</div></div>`;
  }

  /* ---------- Vue Mois ---------- */
  function rendreMois() {
    const c = jour(etat.curseur);
    const premier = new Date(c.getFullYear(), c.getMonth(), 1);
    const de = lundiDe(iso(premier));
    const nbJours = new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate();
    const semaines = Math.ceil((ecart(de, iso(premier)) + nbJours) / 7);
    const a = decale(de, semaines * 7 - 1);
    const liste = instances(de, a);
    const auj = aujourdhui();
    let cases = '';
    for (let k = 0; k < semaines * 7; k++) {
      const d = decale(de, k);
      const ici = liste.filter(i => i.date <= d && i.fin >= d);
      const hors = jour(d).getMonth() !== c.getMonth();
      const nom = maj1(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }));
      cases += `<div class="m-case${hors ? ' is-hors' : ''}${d === auj ? ' is-auj' : ''}${d === etat.curseur ? ' is-choisi' : ''}" data-date="${d}">`
        + `<button type="button" class="m-num" data-aller="${d}" aria-label="${esc(nom)}${ici.length ? `, ${ici.length} rendez-vous` : ''}">${jour(d).getDate()}</button>`
        + `<div class="m-evs">${ici.slice(0, 3).map(i => puce(i, true, d)).join('')}${ici.length > 3 ? `<button type="button" class="m-plus" data-aller="${d}">+${ici.length - 3} autre${ici.length > 4 ? 's' : ''}</button>` : ''}</div>`
        + `<div class="m-points" aria-hidden="true">${ici.slice(0, 4).map(i => `<i style="--c:${couleurSure(categorie(i.r.categorie).couleur)}"></i>`).join('')}</div></div>`;
    }
    const tete = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(j => `<span>${j}</span>`).join('');
    // Sur mobile, les rendez-vous du jour choisi s'affichent sous le mois
    const choisis = liste.filter(i => i.date <= etat.curseur && i.fin >= etat.curseur);
    const detail = `<section class="m-detail"><h3 class="l-date">${esc(maj1(fmt(etat.curseur, { weekday: 'long', day: 'numeric', month: 'long' })))}${etat.curseur === auj ? " <small>Aujourd'hui</small>" : ''}</h3>`
      + `${choisis.length ? `<div class="l-items">${choisis.map(ligne).join('')}</div>` : '<p class="av-vide">Rien de prévu ce jour-là.</p>'}`
      + `<button type="button" class="btn btn--ghost btn--petit" data-nouveau="${etat.curseur}">${icone('plus')}Ajouter ce jour-là</button></section>`;
    return `<div class="mois"><div class="m-tete" aria-hidden="true">${tete}</div><div class="m-grille" style="--semaines:${semaines}">${cases}</div>${detail}</div>`;
  }

  /* ---------- Vue Liste ---------- */
  function ligne(i) {
    const r = i.r;
    const c = categorie(r.categorie);
    const infos = [
      r.avec && `<span>${icone('personne')}${esc(r.avec)}</span>`,
      r.lieu && `<span>${icone('lieu')}${esc(r.lieu)}</span>`,
      r.repetition && `<span>${icone('repete')}${esc((REPETITIONS.find(x => x[0] === r.repetition.frequence) || ['', ''])[1])}</span>`,
      Array.isArray(r.checklist) && r.checklist.length && `<span>${icone('coche')}${r.checklist.filter(x => x.fait).length}/${r.checklist.length}</span>`,
      r.source === 'reservation' && `<span>${icone('calendrier')}Réservé en ligne</span>`,
      !r.avec && !r.lieu && !r.repetition && `<span>${esc(c.nom)}</span>`,
    ].filter(Boolean).join('');
    const finCourte = esc(fmt(i.fin, { day: 'numeric', month: 'short' }));
    const heureTxt = r.journee
      ? `Journée${i.fin !== i.date ? `<small>→ ${finCourte}</small>` : ''}`
      : i.plusieurs ? `${r.debut}<small>→ ${finCourte} ${r.fin}</small>` : `${r.debut}<small>${r.fin}</small>`;
    const badge = r.statut === 'attente' ? '<span class="l-badge l-badge--attente">En attente</span>' : r.statut === 'annule' ? '<span class="l-badge l-badge--annule">Annulé</span>' : '';
    return `<button type="button" class="l-ev statut-${esc(r.statut || 'confirme')}" data-id="${esc(r.id)}" data-date="${i.date}" style="--c:${couleurSure(c.couleur)}">`
      + `<span class="l-heure">${heureTxt}</span><span class="l-barre"></span>`
      + `<span class="l-txt"><b>${esc(r.titre)}</b><small>${infos}</small></span>${badge}</button>`;
  }
  function rendreListe() {
    const q = sansAccents(etat.recherche);
    const auj = aujourdhui();
    const de = q ? decale(auj, -730) : auj;
    const a = decale(auj, q ? 730 : 180);
    let liste = instances(de, a, !!q);
    if (q) liste = liste.filter(i => sansAccents(`${i.r.titre} ${i.r.avec} ${i.r.lieu} ${i.r.notes} ${categorie(i.r.categorie).nom}`).includes(q));
    else liste = liste.filter(pasFini);
    const taches = q ? '' : `<section class="l-jour l-taches"><h3 class="l-date">Tâches du jour</h3>${blocTaches(auj)}</section>`;
    if (!liste.length) {
      if (!q) return `<div class="liste">${taches}<div class="vide"><span class="vide-icone">${icone('calendrier')}</span><h3>Rien de prévu</h3><p>Ton agenda est libre pour les six prochains mois. Ajoute ton premier rendez-vous&nbsp;!</p><button type="button" class="btn btn--primaire" data-nouveau="${auj}">${icone('plus')}Nouveau rendez-vous</button></div></div>`;
      return q
        ? `<div class="liste"><div class="vide"><span class="vide-icone">${icone('loupe')}</span><h3>Aucun résultat</h3><p>Aucun rendez-vous ne correspond à «&nbsp;${esc(etat.recherche)}&nbsp;».</p></div></div>`
        : `<div class="liste"><div class="vide"><span class="vide-icone">${icone('calendrier')}</span><h3>Rien de prévu</h3><p>Ton agenda est libre pour les six prochains mois. Ajoute ton premier rendez-vous&nbsp;!</p><button type="button" class="btn btn--primaire" data-nouveau="${auj}">${icone('plus')}Nouveau rendez-vous</button></div></div>`;
    }
    const MAX = 150;
    const groupes = new Map();
    liste.slice(0, MAX).forEach(i => {
      const d = !q && i.date < auj ? auj : i.date;
      if (!groupes.has(d)) groupes.set(d, []);
      groupes.get(d).push(i);
    });
    let html = taches;
    for (const [d, items] of groupes) {
      const rel = d === auj ? "Aujourd'hui" : d === decale(auj, 1) ? 'Demain' : '';
      const annee = jour(d).getFullYear() !== jour(auj).getFullYear() ? ` ${jour(d).getFullYear()}` : '';
      html += `<section class="l-jour"><h3 class="l-date">${esc(maj1(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })))}${annee}${rel ? ` <small>${rel}</small>` : ''}</h3><div class="l-items">${items.map(ligne).join('')}</div></section>`;
    }
    if (liste.length > MAX) html += `<p class="l-suite">… et ${liste.length - MAX} autres. Précise ta recherche.</p>`;
    return `<div class="liste">${html}</div>`;
  }

  /* ---------- Colonne de gauche ---------- */
  function rendreCote() {
    rendreMini();
    rendreAvenir();
    $('#taches-quand').textContent = `· ${etat.curseur === aujourdhui() ? "aujourd'hui" : fmt(etat.curseur, { weekday: 'short', day: 'numeric', month: 'short' })}`;
    $('#taches-cote').innerHTML = blocTaches(etat.curseur);
    rendreFiltres();
  }

  /* ---------- Tâches ---------- */
  // Tâches d'un jour ; aujourd'hui, celles des jours passés pas encore faites sont reportées
  function tachesDu(d) {
    const auj = aujourdhui();
    const toutes = donnees().taches || [];
    const liste = toutes.filter(t => t.date === d || (d === auj && !t.fait && t.date < auj));
    return liste.sort((a, b) => Number(a.fait) - Number(b.fait) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || String(a.cree).localeCompare(String(b.cree)));
  }
  function blocTaches(d) {
    const items = tachesDu(d).map(t => `<li class="t-item${t.fait ? ' is-fait' : ''}">`
      + `<label class="t-coche"><input type="checkbox" data-tache-coche="${esc(t.id)}"${t.fait ? ' checked' : ''}><span class="t-case" aria-hidden="true"></span><span class="t-texte">${esc(t.titre)}</span>`
      + `${!t.fait && t.date < d ? `<small class="t-retard">${esc(fmt(t.date, { day: 'numeric', month: 'short' }))}</small>` : ''}</label>`
      + `<button type="button" class="t-suppr" data-tache-suppr="${esc(t.id)}" aria-label="Supprimer la tâche ${esc(t.titre)}">${icone('fermer')}</button></li>`).join('');
    return `<div class="taches"><ul class="t-liste">${items}</ul>`
      + `<form class="t-ajout" data-tache-ajout="${d}"><input type="text" maxlength="200" placeholder="Ajouter une tâche…" aria-label="Ajouter une tâche" autocomplete="off"></form></div>`;
  }
  document.addEventListener('change', e => {
    const c = e.target.closest('[data-tache-coche]');
    if (!c) return;
    const t = (donnees().taches || []).find(x => x.id === c.dataset.tacheCoche);
    if (!t) return;
    // Une tâche reportée qu'on coche passe à aujourd'hui (elle reste visible, barrée)
    const date = c.checked && t.date < aujourdhui() ? aujourdhui() : t.date;
    operation({ type: 'tache', tache: { ...clone(t), date, fait: c.checked, faitLe: c.checked ? new Date().toISOString() : null } });
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-tache-suppr]');
    if (!b) return;
    const t = (donnees().taches || []).find(x => x.id === b.dataset.tacheSuppr);
    if (!t) return;
    const avant = clone(t);
    operation({ type: 'supprimerTache', id: t.id, titre: t.titre });
    toast('Tâche supprimée', { texte: 'Annuler', faire: () => operation({ type: 'tache', tache: avant }) });
  });
  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-tache-ajout]');
    if (!f) return;
    e.preventDefault();
    const champ = $('input', f);
    const titre = champ.value.trim();
    if (!titre) return;
    const dans = f.closest('#cote') ? '#cote' : '#vue';
    operation({ type: 'tache', nouveau: true, tache: { id: nouvelId(), titre, date: f.dataset.tacheAjout, fait: false, faitLe: null, cree: new Date().toISOString() } });
    const nouveau = $(`${dans} [data-tache-ajout="${f.dataset.tacheAjout}"] input`);
    if (nouveau) nouveau.focus();
  });
  function rendreMini() {
    const base = jour(etat.mini || etat.curseur);
    const premier = new Date(base.getFullYear(), base.getMonth(), 1);
    const de = lundiDe(iso(premier));
    const a = decale(de, 41);
    const avecRdv = new Set();
    instances(de, a).forEach(i => { for (let d = i.date < de ? de : i.date; d <= i.fin && d <= a; d = decale(d, 1)) avecRdv.add(d); });
    const v = vueEffective();
    const selDe = v === 'semaine' ? lundiDe(etat.curseur) : etat.curseur;
    const selA = v === 'semaine' ? decale(selDe, 6) : v === 'trois' ? decale(selDe, 2) : etat.curseur;
    const auj = aujourdhui();
    let jours = '';
    for (let k = 0; k < 42; k++) {
      const d = decale(de, k);
      const cls = ['mini-jour', jour(d).getMonth() !== premier.getMonth() && 'is-hors', d === auj && 'is-auj', d >= selDe && d <= selA && etat.vue !== 'liste' && 'is-sel', avecRdv.has(d) && 'a-rdv'].filter(Boolean).join(' ');
      jours += `<button type="button" class="${cls}" data-mini-jour="${d}" aria-label="${esc(maj1(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })))}${avecRdv.has(d) ? ', rendez-vous prévus' : ''}">${jour(d).getDate()}</button>`;
    }
    $('#mini').innerHTML = `<div class="mini-tete"><b>${esc(maj1(fmt(premier, { month: 'long', year: 'numeric' })))}</b>`
      + `<button type="button" class="icone-btn" data-mini="-1" aria-label="Mois précédent">${icone('gauche')}</button>`
      + `<button type="button" class="icone-btn" data-mini="1" aria-label="Mois suivant">${icone('droite')}</button></div>`
      + `<div class="mini-grille"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span>${jours}</div>`;
  }
  function rendreAvenir() {
    if (!etat.distant) return;
    const auj = aujourdhui();
    const liste = instances(auj, decale(auj, 60)).filter(i => i.r.statut !== 'annule' && pasFini(i)).slice(0, 5);
    const libelle = i => (i.date < auj
      ? `En cours · fin ${quand(i.fin).toLowerCase()}${i.r.journee ? '' : ` à ${i.r.fin}`}`
      : `${quand(i.date)}${i.r.journee ? '' : ` · ${i.r.debut}`}`);
    $('#avenir').innerHTML = liste.length
      ? liste.map(i => `<li><button type="button" class="av" data-id="${esc(i.r.id)}" data-date="${i.date}" style="--c:${couleurSure(categorie(i.r.categorie).couleur)}"><span><small>${esc(libelle(i))}</small><b>${esc(i.r.titre)}</b></span></button></li>`).join('')
      : '<li class="av-vide">Rien de prévu pour l\'instant.</li>';
  }
  function rendreFiltres() {
    const compte = id => donnees().rendezvous.filter(r => r.categorie === id).length;
    $('#filtres').innerHTML = categories().map(c => `<li><label class="filtre" style="--c:${couleurSure(c.couleur)}"><input type="checkbox" data-filtre="${esc(c.id)}"${etat.masquees.has(c.id) ? '' : ' checked'}><span class="filtre-coche" aria-hidden="true"></span><span class="filtre-nom">${esc(c.nom)}</span><span class="filtre-compte">${compte(c.id) || ''}</span></label></li>`).join('');
  }

  /* ---------- Navigation ---------- */
  function changerVue(v) {
    etat.vue = v;
    stock.ecrire(STOCK.vue, v);
    if (etat.recherche) viderRecherche();
    rendre();
  }
  function naviguer(sens) {
    const v = vueEffective();
    if (v === 'liste' || etat.recherche) return;
    if (v === 'jour') etat.curseur = decale(etat.curseur, sens);
    else if (v === 'semaine') etat.curseur = decale(etat.curseur, 7 * sens);
    else if (v === 'trois') etat.curseur = decale(etat.curseur, 3 * sens);
    else {
      const d = jour(etat.curseur);
      const dernier = new Date(d.getFullYear(), d.getMonth() + sens + 1, 0).getDate();
      etat.curseur = iso(new Date(d.getFullYear(), d.getMonth() + sens, Math.min(d.getDate(), dernier)));
    }
    etat.mini = null;
    rendre(sens);
  }
  function allerAujourdhui() {
    if (etat.recherche) viderRecherche();
    const avant = etat.curseur;
    etat.curseur = aujourdhui();
    etat.mini = null;
    defil.cle = null;
    rendre(avant === etat.curseur ? 0 : avant < etat.curseur ? 1 : -1);
  }
  function allerA(d, versJour = true) {
    if (etat.recherche) viderRecherche();
    etat.curseur = d;
    etat.mini = null;
    if (versJour) { etat.vue = 'jour'; stock.ecrire(STOCK.vue, 'jour'); }
    rendre();
  }
  function viderRecherche() {
    etat.recherche = '';
    $('#recherche').value = '';
    $('#barre').classList.remove('cherche');
  }
  function visible(d) {
    const v = vueEffective();
    if (v === 'jour') return d === etat.curseur;
    if (v === 'semaine') { const l = lundiDe(etat.curseur); return d >= l && d <= decale(l, 6); }
    if (v === 'trois') return d >= etat.curseur && d <= decale(etat.curseur, 2);
    if (v === 'mois') return d.slice(0, 7) === etat.curseur.slice(0, 7);
    return d >= aujourdhui();
  }

  /* ---------- Fiche d'un rendez-vous ---------- */
  const fiche = $('#fiche');
  const form = $('#fiche-form');
  const champs = form.elements;
  let ficheEtat = null; // { r: copie du rendez-vous (ou null si nouveau), occurrence: date cliquée }
  $('select[name="frequence"]', form).innerHTML = REPETITIONS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  $('#f-statut').insertAdjacentHTML('beforeend', STATUTS.map(([v, t]) => `<label class="choix" style="--c:${{ confirme: '#3ddc84', attente: '#f5b971', annule: '#ff6b8b' }[v]}"><input type="radio" name="statut" value="${v}"><span>${t}</span></label>`).join(''));

  function prochaineHeure() {
    const m = Math.min(Math.ceil((maintenant() + 1) / 60) * 60, 22 * 60);
    return [heure(m), heure(m + 60)];
  }
  function ouvrirFiche({ id, date, nouveau }) {
    const r = id ? trouver(id) : null;
    if (id && !r) return;
    ficheEtat = { r: r ? clone(r) : null, occurrence: date || (r && r.date) };
    let v = r;
    if (!v) {
      const d = (nouveau && nouveau.date) || etat.curseur;
      const [h1, h2] = d === aujourdhui() ? prochaineHeure() : ['09:00', '10:00'];
      v = {
        titre: '', categorie: categories()[0].id, date: d, journee: !!(nouveau && nouveau.journee),
        debut: (nouveau && nouveau.debut) || h1, fin: (nouveau && nouveau.fin) || h2, dateFin: d,
        repetition: null, statut: 'confirme', avec: '', lieu: '', notes: '',
      };
    }
    $('#fiche-titre').textContent = r ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous';
    champs.titre.value = v.titre || '';
    $('#f-cats').innerHTML = '<legend class="sr">Catégorie</legend>' + categories().map(c => `<label class="choix" style="--c:${couleurSure(c.couleur)}"><input type="radio" name="categorie" value="${esc(c.id)}"${c.id === v.categorie ? ' checked' : ''}><span>${esc(c.nom)}</span></label>`).join('');
    if (!$('#f-cats input:checked')) $('#f-cats input').checked = true;
    champs.date.value = v.date;
    champs.journee.checked = !!v.journee;
    champs.debut.value = v.journee ? '09:00' : v.debut;
    champs.fin.value = v.journee ? '10:00' : v.fin;
    champs.dateFin.value = v.dateFin || v.date;
    remplirRappels(!!v.journee, r ? rappelsDe(r) : [rappelDefaut(!!v.journee)]);
    ficheEtat.checklist = clone(Array.isArray(v.checklist) ? v.checklist : []);
    rendreChecklist();
    rendreDemande(r);
    champs.frequence.value = (v.repetition && v.repetition.frequence) || '';
    champs.jusquau.value = (v.repetition && v.repetition.jusquau) || '';
    (form.querySelector(`input[name="statut"][value="${v.statut || 'confirme'}"]`) || form.querySelector('input[name="statut"]')).checked = true;
    champs.avec.value = v.avec || '';
    champs.lieu.value = v.lieu || '';
    champs.notes.value = v.notes || '';
    form.dataset.debut = champs.debut.value;
    form.dataset.date = champs.date.value;
    $('[data-serie]', form).hidden = !(r && r.repetition);
    $$('[data-action]', form).forEach(b => { b.hidden = !r; });
    $('#f-erreur').textContent = '';
    majFiche();
    fiche.showModal();
    if (!r) champs.titre.focus();
  }
  // Rappels : pastilles à cocher (aucune cochée = pas de rappel)
  function remplirRappels(journee, valeurs) {
    const liste = journee ? RAPPELS_JOURNEE : RAPPELS;
    const zone = $('#f-rappels');
    zone.innerHTML = `<legend class="f-legende">Rappels sur Discord${journee ? '' : ' <small>avant le début</small>'}</legend>`
      + liste.map(([v, t]) => `<label class="choix" style="--c:#8b9bff"><input type="checkbox" name="rappels" value="${v}"${valeurs.includes(Number(v)) ? ' checked' : ''}><span>${t}</span></label>`).join('');
    zone.dataset.journee = String(journee);
  }
  // Liste à cocher (ordre du jour)
  function rendreChecklist() {
    $('#f-check').innerHTML = ficheEtat.checklist.map((x, k) => `<li class="t-item${x.fait ? ' is-fait' : ''}"><label class="t-coche"><input type="checkbox" data-check="${k}"${x.fait ? ' checked' : ''}><span class="t-case" aria-hidden="true"></span><span class="t-texte">${esc(x.t)}</span></label><button type="button" class="t-suppr" data-check-suppr="${k}" aria-label="Retirer « ${esc(x.t)} »">${icone('fermer')}</button></li>`).join('');
  }
  $('#f-check-ajout').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const t = e.target.value.trim();
    if (!t) return;
    ficheEtat.checklist.push({ t, fait: false });
    e.target.value = '';
    rendreChecklist();
  });
  $('#f-check').addEventListener('change', e => {
    const c = e.target.closest('[data-check]');
    if (c) { ficheEtat.checklist[Number(c.dataset.check)].fait = c.checked; rendreChecklist(); }
  });
  $('#f-check').addEventListener('click', e => {
    const b = e.target.closest('[data-check-suppr]');
    if (b) { ficheEtat.checklist.splice(Number(b.dataset.checkSuppr), 1); rendreChecklist(); }
  });
  // Demande arrivée par la page de réservation : coordonnées de la personne
  function rendreDemande(r) {
    const zone = $('#f-demande');
    const d = r && r.demande;
    zone.hidden = !d;
    if (!d) return;
    const recue = Date.parse(d.recue) ? new Date(d.recue).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email || '') ? `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : '';
    zone.innerHTML = `${icone('calendrier')}<div><b>Réservé en ligne par ${esc(d.nom || '?')}</b>${recue ? ` <small>le ${esc(recue)}</small>` : ''}`
      + `<span>${[email, d.discord && `Discord : ${esc(d.discord)}`, d.sujet && esc(d.sujet)].filter(Boolean).join(' · ')}</span>`
      + `${r.statut === 'attente' ? '<small>Passe le statut à « Confirmé », puis préviens la personne.</small>' : ''}</div>`;
  }
  function majFiche() {
    const journee = champs.journee.checked;
    if ($('#f-rappels').dataset.journee !== String(journee)) remplirRappels(journee, [rappelDefaut(journee)]);
    $$('[data-horaire]', form).forEach(el => { el.hidden = journee; });
    $('[data-l-debut]', form).textContent = journee ? 'Du' : 'Début';
    $('[data-l-fin]', form).textContent = journee ? 'Au' : 'Fin';
    $('[data-jusquau]', form).hidden = !champs.frequence.value;
    const lieu = champs.lieu.value.trim();
    const lien = $('#f-lien');
    lien.hidden = !/^https?:\/\/\S+$/i.test(lieu);
    if (!lien.hidden) lien.href = lieu;
  }
  form.addEventListener('input', majFiche);
  form.addEventListener('change', e => {
    // Changer le début (date ou heure) décale la fin d'autant : la durée reste la même
    if (e.target === champs.date || e.target === champs.debut) {
      const [dAvant, hAvant] = [form.dataset.date, form.dataset.debut];
      const [d, h] = [champs.date.value, champs.debut.value];
      if (DATE.test(dAvant) && DATE.test(d) && DATE.test(champs.dateFin.value)) {
        if (!champs.journee.checked && HEURE.test(hAvant) && HEURE.test(h) && HEURE.test(champs.fin.value)) {
          const duree = instantFin(champs.dateFin.value, champs.fin.value) - instantDebut(dAvant, hAvant);
          if (duree > 0) [champs.dateFin.value, champs.fin.value] = finDepuis(instantDebut(d, h) + duree);
        } else if (d !== dAvant) {
          champs.dateFin.value = decale(champs.dateFin.value, ecart(dAvant, d));
        }
      }
      form.dataset.date = d;
      form.dataset.debut = h;
    }
    if (DATE.test(champs.date.value) && champs.dateFin.value < champs.date.value) champs.dateFin.value = champs.date.value;
    majFiche();
  });
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const titre = champs.titre.value.trim();
    const journee = champs.journee.checked;
    const date = champs.date.value;
    let dateFin = DATE.test(champs.dateFin.value) ? champs.dateFin.value : date;
    let erreur = '';
    let fautif = null;
    if (!titre) { erreur = 'Donne un titre au rendez-vous.'; fautif = champs.titre; }
    else if (!DATE.test(date)) { erreur = 'Choisis une date.'; fautif = champs.date; }
    else if (dateFin < date) { erreur = 'La date de fin doit être après la date de début.'; fautif = champs.dateFin; }
    else if (!journee && (!HEURE.test(champs.debut.value) || !HEURE.test(champs.fin.value))) { erreur = 'Indique une heure de début et de fin.'; fautif = champs.debut; }
    else if (!journee && instantFin(dateFin, champs.fin.value) <= instantDebut(date, champs.debut.value)) { erreur = 'La fin doit être après le début.'; fautif = champs.fin; }
    else if (champs.frequence.value && champs.jusquau.value && champs.jusquau.value < date) { erreur = 'La fin de la répétition doit être après la date du rendez-vous.'; fautif = champs.jusquau; }
    $('#f-erreur').textContent = erreur;
    if (erreur) { fautif.focus(); return; }

    // Fin à minuit pile le lendemain : c'est la fin du jour d'avant (« 00:00 » = minuit)
    if (!journee && champs.fin.value === '00:00' && dateFin > date) dateFin = decale(dateFin, -1);
    const avant = ficheEtat.r;
    const instant = new Date().toISOString();
    const rdv = {
      ...(avant || {}), // garde les champs ajoutés par le serveur (demande de réservation, relance…)
      id: avant ? avant.id : nouvelId(),
      titre,
      categorie: (form.querySelector('input[name="categorie"]:checked') || {}).value || categories()[0].id,
      date,
      journee,
      debut: journee ? null : champs.debut.value,
      fin: journee ? null : champs.fin.value,
      dateFin,
      repetition: champs.frequence.value ? { frequence: champs.frequence.value, jusquau: champs.jusquau.value || null } : null,
      exceptions: champs.frequence.value && avant && avant.repetition ? (avant.exceptions || []) : [],
      rappels: $$('#f-rappels input:checked').map(c => Number(c.value)).sort((a, b) => b - a),
      checklist: ficheEtat.checklist.filter(x => x.t),
      statut: (form.querySelector('input[name="statut"]:checked') || {}).value || 'confirme',
      avec: champs.avec.value.trim(),
      lieu: champs.lieu.value.trim(),
      notes: champs.notes.value.trim(),
      cree: avant ? avant.cree : instant,
      modifie: instant,
    };
    delete rdv.rappel; // ancien réglage à un seul rappel
    if (avant && (avant.date !== rdv.date || avant.debut !== rdv.debut)) delete rdv.relance;
    fiche.close();
    if (!avant && !visible(rdv.date)) { etat.curseur = rdv.date; etat.mini = null; }
    operation({ type: 'enregistrer', rdv, nouveau: !avant });
    toast(avant ? 'Rendez-vous modifié' : 'Rendez-vous ajouté', {
      texte: 'Annuler',
      faire: () => operation(avant ? { type: 'enregistrer', rdv: avant } : { type: 'supprimer', id: rdv.id, titre: rdv.titre }),
    });
  });
  form.addEventListener('click', e => {
    const action = e.target.closest('[data-action]');
    if (!action || !ficheEtat.r) return;
    const r = ficheEtat.r;
    if (action.dataset.action === 'supprimer') { fiche.close(); supprimer(r, ficheEtat.occurrence); }
    else if (action.dataset.action === 'dupliquer') {
      ficheEtat = { r: null, occurrence: null, checklist: ficheEtat.checklist.map(x => ({ t: x.t, fait: false })) };
      rendreChecklist();
      rendreDemande(null);
      $('#fiche-titre').textContent = 'Nouveau rendez-vous (copie)';
      $('[data-serie]', form).hidden = true;
      $$('[data-action]', form).forEach(b => { b.hidden = true; });
      champs.titre.focus();
      champs.titre.select();
    } else if (action.dataset.action === 'ics') {
      telecharger(`${nomFichier(r.titre)}.ics`, ics([r]), 'text/calendar;charset=utf-8');
    }
  });
  async function supprimer(r, occurrence) {
    if (r.repetition) {
      const choix = await demanderSerie(occurrence);
      if (choix === 'une') {
        operation({ type: 'sauter', id: r.id, date: occurrence, titre: r.titre });
        toast(`Rendez-vous du ${fmt(occurrence, { day: 'numeric', month: 'long' })} supprimé`, { texte: 'Annuler', faire: () => operation({ type: 'enregistrer', rdv: r }) });
      } else if (choix === 'serie') {
        operation({ type: 'supprimer', id: r.id, titre: r.titre });
        toast('Série supprimée', { texte: 'Annuler', faire: () => operation({ type: 'enregistrer', rdv: r }) });
      }
      return;
    }
    operation({ type: 'supprimer', id: r.id, titre: r.titre });
    toast('Rendez-vous supprimé', { texte: 'Annuler', faire: () => operation({ type: 'enregistrer', rdv: r }) });
  }
  function demanderSerie(occurrence) {
    const d = $('#serie');
    $('#serie-texte').textContent = 'Veux-tu supprimer uniquement ce rendez-vous ou toute la série ?';
    $('#serie-une').textContent = `Seulement celui du ${fmt(occurrence, { weekday: 'long', day: 'numeric', month: 'long' })}`;
    d.returnValue = '';
    d.showModal();
    return new Promise(resolve => d.addEventListener('close', () => resolve(d.returnValue), { once: true }));
  }
  // Fermer les fenêtres : bouton, ou clic à côté
  document.addEventListener('click', e => {
    const fermer = e.target.closest('[data-fermer]');
    if (fermer) { fermer.closest('dialog').close(); return; }
    if (e.target.matches('dialog.dialogue')) e.target.close();
  });

  /* ---------- Glisser-déposer (souris) ---------- */
  let glisse = null;
  let ignorerClic = false;
  let balayage = null;
  const caleSur = (m, pas) => Math.round(m / pas) * pas;
  vueEl.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') {
      if ($('.grille, .mois', vueEl)) balayage = { x: e.clientX, y: e.clientY, t: Date.now() };
      return;
    }
    if (e.button !== 0) return;
    const col = e.target.closest('.g-col');
    if (!col) return;
    const H = hauteurHeure();
    const minA = (y, c) => clamp(caleSur((y - c.getBoundingClientRect().top) / H * 60, 15), 0, 1440);
    const evEl = e.target.closest('.ev');
    if (evEl) {
      const r = trouver(evEl.dataset.id);
      if (!r || etendue(r) > 0) return;
      const i = inst(r, evEl.dataset.date);
      glisse = {
        mode: e.target.closest('.ev-poignee') ? 'taille' : 'deplacer',
        r, i, el: evEl, col, minA, x0: e.clientX, y0: e.clientY, actif: false,
        date: i.date, debut: i.debut, fin: i.finM, prise: minA(e.clientY, col) - i.debut,
      };
    } else {
      const depart = clamp(Math.floor((e.clientY - col.getBoundingClientRect().top) / H * 4) * 15, 0, 1425);
      glisse = { mode: 'creer', col, minA, date: col.dataset.date, depart, debut: depart, fin: depart + 15, x0: e.clientX, y0: e.clientY, actif: false };
    }
  });
  function demarrerGlisse(g, pointeur) {
    g.actif = true;
    if (pointeur !== undefined) vueEl.setPointerCapture(pointeur);
    document.body.classList.add(`glisse-${g.mode}`);
    if (g.el) g.el.classList.add('is-glisse');
    else {
      g.fantome = document.createElement('div');
      g.fantome.className = 'fantome';
      g.col.append(g.fantome);
    }
  }
  function bougerGlisse(g, x, y) {
    if (g.mode === 'deplacer') {
      const cible = $$('.g-col', vueEl).find(c => { const b = c.getBoundingClientRect(); return x >= b.left && x < b.right; }) || g.col;
      const duree = g.i.finM - g.i.debut;
      g.debut = clamp(g.minA(y, cible) - g.prise, 0, 1440 - duree);
      g.fin = g.debut + duree;
      g.date = cible.dataset.date;
      if (g.el.parentNode !== cible) cible.append(g.el);
      g.el.style.setProperty('--d', g.debut);
      g.el.style.setProperty('--col', 0);
      g.el.style.setProperty('--tot', 1);
    } else if (g.mode === 'taille') {
      g.fin = clamp(g.minA(y, g.col), g.i.debut + 15, 1440);
      g.el.style.setProperty('--l', g.fin - g.i.debut);
    } else {
      const m = g.minA(y, g.col);
      g.debut = Math.min(g.depart, m);
      g.fin = Math.max(g.depart + 15, m, g.debut + 15);
      g.fantome.style.setProperty('--d', g.debut);
      g.fantome.style.setProperty('--l', g.fin - g.debut);
      g.fantome.textContent = `${heure(g.debut)} – ${heure(g.fin)}`;
      return;
    }
    $('.ev-heure', g.el).textContent = `${heure(g.debut)} – ${heure(g.fin)}`;
  }
  function finirGlisse(g) {
    document.body.classList.remove('glisse-deplacer', 'glisse-taille', 'glisse-creer');
    if (!g.actif) return; // simple clic : géré par l'événement « click »
    ignorerClic = true;
    setTimeout(() => { ignorerClic = false; }, 0);
    if (g.mode === 'creer') {
      g.fantome.remove();
      ouvrirFiche({ nouveau: { date: g.date, debut: heure(g.debut), fin: heure(g.fin) } });
      return;
    }
    if (g.date === g.i.date && g.debut === g.i.debut && g.fin === g.i.finM) { rendre(); return; }
    deplacer(g.r, g.i.date, g.date, g.debut, g.fin);
  }
  vueEl.addEventListener('pointermove', e => {
    const g = glisse;
    if (!g || g.tactile) return;
    if (!g.actif) {
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 5) return;
      demarrerGlisse(g, e.pointerId);
    }
    bougerGlisse(g, e.clientX, e.clientY);
  });
  vueEl.addEventListener('pointerup', e => {
    if (glisse && glisse.tactile) return;
    if (balayage) {
      const dx = e.clientX - balayage.x;
      const dy = e.clientY - balayage.y;
      const rapide = Date.now() - balayage.t < 600;
      balayage = null;
      if (rapide && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        ignorerClic = true;
        setTimeout(() => { ignorerClic = false; }, 0);
        naviguer(dx < 0 ? 1 : -1);
      }
      return;
    }
    const g = glisse;
    glisse = null;
    if (g) finirGlisse(g);
  });
  vueEl.addEventListener('pointercancel', () => {
    balayage = null;
    if (!glisse || glisse.tactile) return;
    glisse = null;
    document.body.classList.remove('glisse-deplacer', 'glisse-taille', 'glisse-creer');
    rendre();
  });
  // Au doigt : appui long (0,45 s) sur un rendez-vous, puis glisser pour le déplacer
  let appui = null;
  const annulerAppui = () => { if (appui) { clearTimeout(appui.minuteur); appui = null; } };
  vueEl.addEventListener('touchstart', e => {
    annulerAppui();
    const evEl = e.touches.length === 1 && e.target.closest('.ev');
    if (!evEl) return;
    const r = trouver(evEl.dataset.id);
    if (!r || etendue(r) > 0) return;
    const col = evEl.closest('.g-col');
    const t = e.touches[0];
    const depart = { x: t.clientX, y: t.clientY };
    appui = {
      ...depart,
      minuteur: setTimeout(() => {
        const H = hauteurHeure();
        const minA = (y, c) => clamp(caleSur((y - c.getBoundingClientRect().top) / H * 60, 15), 0, 1440);
        const i = inst(r, evEl.dataset.date);
        glisse = { mode: 'deplacer', tactile: true, r, i, el: evEl, col, minA, x0: depart.x, y0: depart.y, actif: false, date: i.date, debut: i.debut, fin: i.finM, prise: minA(depart.y, col) - i.debut };
        balayage = null;
        demarrerGlisse(glisse);
        if (navigator.vibrate) navigator.vibrate(12);
      }, 450),
    };
  }, { passive: true });
  vueEl.addEventListener('touchmove', e => {
    if (!appui) return;
    const t = e.touches[0];
    if (glisse && glisse.tactile) {
      e.preventDefault(); // pas de défilement pendant le déplacement
      bougerGlisse(glisse, t.clientX, t.clientY);
    } else if (Math.hypot(t.clientX - appui.x, t.clientY - appui.y) > 10) annulerAppui();
  }, { passive: false });
  vueEl.addEventListener('touchend', e => {
    annulerAppui();
    if (!glisse || !glisse.tactile) return;
    e.preventDefault();
    const g = glisse;
    glisse = null;
    finirGlisse(g);
  });
  vueEl.addEventListener('touchcancel', () => {
    annulerAppui();
    if (!glisse || !glisse.tactile) return;
    glisse = null;
    document.body.classList.remove('glisse-deplacer');
    rendre();
  });
  vueEl.addEventListener('contextmenu', e => { if (e.target.closest('.ev')) e.preventDefault(); });
  function deplacer(r, ancienneDate, date, debut, fin) {
    const avant = clone(r);
    const instant = new Date().toISOString();
    const quandTxt = `${quand(date).toLowerCase() === "aujourd'hui" ? "aujourd'hui" : `le ${fmt(date, { weekday: 'short', day: 'numeric', month: 'short' })}`} à ${heure(debut)}`;
    if (r.repetition) {
      // Une occurrence d'une série déplacée devient un rendez-vous à part
      const copie = { ...clone(r), id: nouvelId(), date, dateFin: date, debut: heure(debut), fin: heure(fin), repetition: null, exceptions: [], cree: instant, modifie: instant };
      operation([{ type: 'sauter', id: r.id, date: ancienneDate, titre: r.titre }, { type: 'enregistrer', rdv: copie, nouveau: true }]);
      toast(`Cette occurrence est déplacée ${quandTxt}`, { texte: 'Annuler', faire: () => operation([{ type: 'supprimer', id: copie.id, titre: copie.titre }, { type: 'enregistrer', rdv: avant }]) });
    } else {
      operation({ type: 'enregistrer', rdv: { ...clone(r), date, dateFin: date, debut: heure(debut), fin: heure(fin), modifie: instant } });
      toast(`Déplacé ${quandTxt}`, { texte: 'Annuler', faire: () => operation({ type: 'enregistrer', rdv: avant }) });
    }
  }

  /* ---------- Clics ---------- */
  document.addEventListener('click', e => {
    if (ignorerClic) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  vueEl.addEventListener('click', e => {
    const ev = e.target.closest('.ev, .puce, .l-ev');
    if (ev) { ouvrirFiche({ id: ev.dataset.id, date: ev.dataset.date }); return; }
    const nouv = e.target.closest('[data-nouveau]');
    if (nouv) { ouvrirFiche({ nouveau: { date: nouv.dataset.nouveau } }); return; }
    const aller = e.target.closest('[data-aller]');
    if (aller) {
      if (vueEffective() === 'mois' && petit.matches) { etat.curseur = aller.dataset.aller; rendre(); }
      else allerA(aller.dataset.aller);
      return;
    }
    const col = e.target.closest('.g-col');
    if (col) {
      const m = clamp(Math.floor((e.clientY - col.getBoundingClientRect().top) / hauteurHeure() * 2) * 30, 0, 1380);
      ouvrirFiche({ nouveau: { date: col.dataset.date, debut: heure(m), fin: heure(m + 60) } });
      return;
    }
    const jt = e.target.closest('.g-jt');
    if (jt) { ouvrirFiche({ nouveau: { date: jt.dataset.date, journee: true } }); return; }
    const cas = e.target.closest('.m-case');
    if (cas) {
      if (petit.matches) { etat.curseur = cas.dataset.date; rendre(); }
      else ouvrirFiche({ nouveau: { date: cas.dataset.date } });
    }
  });
  $('#cote').addEventListener('click', e => {
    const av = e.target.closest('.av');
    if (av) { fermerCote(); ouvrirFiche({ id: av.dataset.id, date: av.dataset.date }); return; }
    const mj = e.target.closest('[data-mini-jour]');
    if (mj) { fermerCote(); allerA(mj.dataset.miniJour, etat.vue === 'liste'); return; }
    const mm = e.target.closest('[data-mini]');
    if (mm) {
      const b = jour(etat.mini || etat.curseur);
      etat.mini = iso(new Date(b.getFullYear(), b.getMonth() + Number(mm.dataset.mini), 1));
      rendreMini();
    }
  });
  $('#cote').addEventListener('change', e => {
    const f = e.target.closest('[data-filtre]');
    if (!f) return;
    if (f.checked) etat.masquees.delete(f.dataset.filtre); else etat.masquees.add(f.dataset.filtre);
    stock.ecrire(STOCK.masquees, [...etat.masquees]);
    rendre();
  });

  /* ---------- Barre du haut ---------- */
  const fermerCote = () => { app.classList.remove('cote-ouverte'); $('#ouvrir-cote').setAttribute('aria-expanded', 'false'); };
  $('#ouvrir-cote').addEventListener('click', () => {
    const ouvert = app.classList.toggle('cote-ouverte');
    $('#ouvrir-cote').setAttribute('aria-expanded', String(ouvert));
  });
  $('#voile').addEventListener('click', fermerCote);
  $('#aujourdhui').addEventListener('click', allerAujourdhui);
  $('#prec').addEventListener('click', () => naviguer(-1));
  $('#suiv').addEventListener('click', () => naviguer(1));
  $$('.b-vues button').forEach(b => b.addEventListener('click', () => changerVue(b.dataset.vue)));
  $('#nouveau').addEventListener('click', () => ouvrirFiche({ nouveau: { date: etat.curseur } }));
  $('#fab').addEventListener('click', () => ouvrirFiche({ nouveau: { date: etat.curseur } }));
  $('#synchro').addEventListener('click', () => (etat.attente.length ? synchroniser() : rafraichir()));
  const recherche = $('#recherche');
  recherche.addEventListener('input', () => { etat.recherche = recherche.value.trim(); rendre(); });
  recherche.addEventListener('keydown', e => { if (e.key === 'Escape') { viderRecherche(); rendre(); recherche.blur(); } });
  $('#loupe').addEventListener('click', () => {
    const barre = $('#barre');
    if (barre.classList.toggle('cherche')) recherche.focus();
    else { viderRecherche(); rendre(); }
  });
  const menuBtn = $('#menu');
  const menuListe = $('#menu-liste');
  const basculerMenu = ouvrir => { menuListe.hidden = !ouvrir; menuBtn.setAttribute('aria-expanded', String(ouvrir)); };
  menuBtn.addEventListener('click', () => basculerMenu(menuListe.hidden));
  document.addEventListener('click', e => {
    if (!menuListe.hidden && !e.target.closest('.b-menu')) basculerMenu(false);
    const action = e.target.closest('[data-menu]');
    if (!action) return;
    basculerMenu(false);
    fermerCote();
    const a = action.dataset.menu;
    if (a === 'reglages') ouvrirReglages();
    else if (a === 'ics') telecharger('agenda-mvrius.ics', ics(donnees().rendezvous), 'text/calendar;charset=utf-8');
    else if (a === 'json') telecharger(`agenda-sauvegarde-${aujourdhui()}.json`, JSON.stringify(donnees(), null, 2), 'application/json');
    else if (a === 'raccourcis') toast('N nouveau · T aujourd\'hui · J S M L vues · ← → naviguer · / rechercher', null, 7000);
    else if (a === 'deconnexion') deconnecter();
  });

  /* ---------- Réglages ---------- */
  const reglages = $('#reglages');
  let brouillon = null;
  const resumeActuel = () => ({ actif: false, heure: '08:00', ...((donnees().reglages || {}).resume || {}) });
  function ouvrirReglages() {
    brouillon = clone(categories());
    rendreCategoriesEdit();
    $('#r-resume').checked = !!resumeActuel().actif;
    // Heures de travail
    const t = travail();
    $('#r-jours').innerHTML = '<legend class="sr">Jours travaillés</legend>' + JOURS.map((nom, k) => `<label class="choix" style="--c:#8b9bff"><input type="checkbox" value="${k + 1}"${t.jours.includes(k + 1) ? ' checked' : ''}><span>${nom.slice(0, 3)}.</span></label>`).join('');
    $('#r-t-debut').value = t.debut;
    $('#r-t-fin').value = t.fin;
    $('#r-t-griser').checked = !!t.griser;
    $('#r-t-semaine').checked = !!t.semaineTravail;
    // Réservation : deux plages par jour au plus
    const resa = reservation();
    $('#r-resa-actif').checked = !!resa.actif;
    $('#r-plages').innerHTML = JOURS.map((nom, k) => {
      const p = (resa.plages && resa.plages[k + 1]) || [];
      const champ = (n, cote) => `<input type="time" step="900" data-p="${n}${cote}" value="${(p[n] && p[n][cote === 'd' ? 0 : 1]) || ''}" aria-label="${nom}, plage ${n + 1}, ${cote === 'd' ? 'début' : 'fin'}">`;
      return `<div class="r-plage" data-jour="${k + 1}"><label class="choix" style="--c:#3ddc84"><input type="checkbox" data-plage-actif${p.length ? ' checked' : ''}><span>${nom}</span></label>`
        + `<span class="r-plage-h">${champ(0, 'd')}<i>–</i>${champ(0, 'f')}</span><span class="r-plage-h">${champ(1, 'd')}<i>–</i>${champ(1, 'f')}</span></div>`;
    }).join('');
    $('#r-resa-duree').value = String(resa.duree);
    $('#r-resa-pause').value = String(resa.pause);
    $('#r-resa-delai').value = String(resa.delai);
    $('#r-resa-horizon').value = String(resa.horizon);
    reglages.showModal();
  }
  function lirePlages() {
    const plages = {};
    $$('#r-plages .r-plage').forEach(ligne => {
      if (!$('[data-plage-actif]', ligne).checked) return;
      const liste = [0, 1].map(n => [$(`[data-p="${n}d"]`, ligne).value, $(`[data-p="${n}f"]`, ligne).value])
        .filter(([a, b]) => HEURE.test(a) && HEURE.test(b) && minutes(a) < (minutes(b) || 1440));
      if (liste.length) plages[ligne.dataset.jour] = liste;
    });
    return plages;
  }
  // Commandes /rdv, /tache… : enregistrées auprès de Discord par le serveur
  $('#r-commandes').addEventListener('click', async () => {
    const bouton = $('#r-commandes');
    bouton.disabled = true;
    try {
      const rep = await fetch(`${SERVEUR}/commandes/installer`, { method: 'POST', headers: { Authorization: `Bearer ${etat.session ? etat.session.jeton : ''}` } });
      const corps = await rep.json().catch(() => ({}));
      toast(rep.ok ? 'Commandes installées : tape / dans ta conversation avec le bot.' : (rep.status === 401 ? 'Ta session a expiré. Reconnecte-toi avec Discord.' : corps.message || "L'installation n'a pas fonctionné."), null, rep.ok ? 5000 : 9000);
    } catch (e) {
      toast("Impossible de joindre le serveur de l'agenda.", null, 6000);
    } finally {
      bouton.disabled = false;
    }
  });
  // Message privé de test : vérifie le bot de bout en bout
  $('#r-test').addEventListener('click', async () => {
    const bouton = $('#r-test');
    bouton.disabled = true;
    try {
      const rep = await fetch(`${SERVEUR}/rappels/test`, { method: 'POST', headers: { Authorization: `Bearer ${etat.session ? etat.session.jeton : ''}` } });
      const corps = await rep.json().catch(() => ({}));
      toast(rep.ok ? `Message envoyé : regarde tes MP Discord. ${corps.prochain || ''}` : (rep.status === 401 ? 'Ta session a expiré. Reconnecte-toi avec Discord.' : corps.message || 'Le message n\'a pas pu partir.'), null, rep.ok ? 4000 : 9000);
    } catch (e) {
      toast("Impossible de joindre le serveur de l'agenda.", null, 6000);
    } finally {
      bouton.disabled = false;
    }
  });
  function rendreCategoriesEdit() {
    const compte = id => donnees().rendezvous.filter(r => r.categorie === id).length;
    $('#cats-edit').innerHTML = brouillon.map((c, i) => {
      const n = compte(c.id);
      return `<div class="cat-ligne" data-i="${i}">`
        + `<button type="button" class="cat-pastille" style="--c:${couleurSure(c.couleur)}" data-couleur aria-label="Changer la couleur de ${esc(c.nom)}"></button>`
        + `<input value="${esc(c.nom)}" maxlength="24" aria-label="Nom de la catégorie" data-nom>`
        + `<span class="cat-compte">${n ? `${n} rdv` : ''}</span>`
        + `<button type="button" class="icone-btn icone-btn--danger" data-retirer${n || brouillon.length < 2 ? ' disabled' : ''} title="${n ? 'Utilisée par des rendez-vous' : 'Supprimer'}" aria-label="Supprimer la catégorie ${esc(c.nom)}">${icone('corbeille')}</button></div>`;
    }).join('');
  }
  $('#cats-edit').addEventListener('click', e => {
    const lignec = e.target.closest('.cat-ligne');
    if (!lignec) return;
    const c = brouillon[Number(lignec.dataset.i)];
    if (e.target.closest('[data-couleur]')) {
      c.couleur = COULEURS[(COULEURS.indexOf(c.couleur) + 1) % COULEURS.length];
      e.target.closest('[data-couleur]').style.setProperty('--c', c.couleur);
    } else if (e.target.closest('[data-retirer]')) {
      brouillon.splice(Number(lignec.dataset.i), 1);
      rendreCategoriesEdit();
    }
  });
  $('#cats-edit').addEventListener('input', e => {
    const lignec = e.target.closest('.cat-ligne');
    if (lignec && e.target.matches('[data-nom]')) brouillon[Number(lignec.dataset.i)].nom = e.target.value;
  });
  $('#cat-ajout').addEventListener('click', () => {
    const libre = COULEURS.find(c => !brouillon.some(x => x.couleur === c)) || COULEURS[0];
    brouillon.push({ id: `cat-${nouvelId()}`, nom: 'Nouvelle catégorie', couleur: libre });
    rendreCategoriesEdit();
    const champ = $('#cats-edit .cat-ligne:last-child input');
    champ.focus();
    champ.select();
  });
  $('#reglages-form').addEventListener('submit', e => {
    e.preventDefault();
    const propres = brouillon.map(c => ({ ...c, nom: c.nom.trim() || 'Sans nom' }));
    const resume = { ...resumeActuel(), actif: $('#r-resume').checked };
    const jours = $$('#r-jours input:checked').map(c => Number(c.value));
    const [tDebut, tFin] = [$('#r-t-debut').value, $('#r-t-fin').value];
    const t = {
      jours,
      debut: HEURE.test(tDebut) ? tDebut : TRAVAIL_DEFAUT.debut,
      fin: HEURE.test(tFin) && minutes(tFin) > minutes(tDebut) ? tFin : TRAVAIL_DEFAUT.fin,
      griser: $('#r-t-griser').checked,
      semaineTravail: $('#r-t-semaine').checked,
    };
    const resa = {
      actif: $('#r-resa-actif').checked,
      plages: lirePlages(),
      duree: Number($('#r-resa-duree').value),
      pause: Number($('#r-resa-pause').value),
      delai: Number($('#r-resa-delai').value),
      horizon: Number($('#r-resa-horizon').value),
    };
    reglages.close();
    const ops = [];
    if (JSON.stringify(propres) !== JSON.stringify(categories())) ops.push({ type: 'categories', categories: propres });
    const changes = {};
    if (JSON.stringify(resume) !== JSON.stringify(resumeActuel())) changes.resume = resume;
    if (JSON.stringify(t) !== JSON.stringify(travail())) changes.travail = t;
    if (JSON.stringify(resa) !== JSON.stringify(reservation())) changes.reservation = resa;
    if (Object.keys(changes).length) ops.push({ type: 'reglages', reglages: changes });
    if (ops.length) {
      operation(ops);
      toast('Réglages enregistrés');
    }
  });

  /* ---------- Exports ---------- */
  function nomFichier(s) {
    return sansAccents(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'rendez-vous';
  }
  function telecharger(nom, contenu, type) {
    const url = URL.createObjectURL(new Blob([contenu], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nom });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  // Format iCalendar : s'importe dans Google Agenda, Apple Calendrier, Outlook…
  function ics(liste) {
    const L = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mvrius//Agenda//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
      'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
      'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
      'END:VTIMEZONE',
    ];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const sansTirets = d => d.replace(/-/g, '');
    const dt = (d, h) => `${sansTirets(d)}T${h.replace(':', '')}00`;
    const txt = s => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
    for (const r of liste) {
      L.push('BEGIN:VEVENT', `UID:${r.id}@agenda.mvriuus.fr`, `DTSTAMP:${stamp}`);
      if (r.journee) {
        L.push(`DTSTART;VALUE=DATE:${sansTirets(r.date)}`, `DTEND;VALUE=DATE:${sansTirets(decale(jourDeFin(r), 1))}`);
      } else {
        L.push(`DTSTART;TZID=Europe/Paris:${dt(r.date, r.debut)}`, `DTEND;TZID=Europe/Paris:${dt(minutes(r.fin) === 0 ? decale(jourDeFin(r), 1) : jourDeFin(r), r.fin)}`);
      }
      L.push(`SUMMARY:${txt(r.titre)}`);
      if (r.lieu) L.push(`LOCATION:${txt(r.lieu)}`);
      const description = [r.avec && `Avec : ${r.avec}`, r.notes].filter(Boolean).join('\n');
      if (description) L.push(`DESCRIPTION:${txt(description)}`);
      L.push(`CATEGORIES:${txt(categorie(r.categorie).nom)}`);
      L.push(`STATUS:${{ attente: 'TENTATIVE', annule: 'CANCELLED' }[r.statut] || 'CONFIRMED'}`);
      if (r.repetition) {
        const regle = { jour: 'FREQ=DAILY', semaine: 'FREQ=WEEKLY', '2semaines': 'FREQ=WEEKLY;INTERVAL=2', mois: 'FREQ=MONTHLY' }[r.repetition.frequence];
        const fin = r.repetition.jusquau ? `;UNTIL=${sansTirets(r.repetition.jusquau)}${r.journee ? '' : 'T225959Z'}` : '';
        if (regle) L.push(`RRULE:${regle}${fin}`);
        for (const x of r.exceptions || []) L.push(r.journee ? `EXDATE;VALUE=DATE:${sansTirets(x)}` : `EXDATE;TZID=Europe/Paris:${dt(x, r.debut)}`);
      }
      L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR');
    // Lignes de 75 octets au plus (on coupe à 60 caractères pour rester large avec les accents)
    const plier = l => (l.length <= 60 ? l : l.match(/.{1,60}/gu).join('\r\n '));
    return L.map(plier).join('\r\n') + '\r\n';
  }

  /* ---------- Notifications ---------- */
  // Une seule notification à la fois : son bouton « Annuler » vise toujours le dernier changement
  function toast(texte, action, duree) {
    $$('#toasts .toast').forEach(t => t.remove());
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span>${esc(texte)}</span>${action ? `<button type="button">${esc(action.texte)}</button>` : ''}`;
    const fermer = () => { el.classList.remove('is-on'); setTimeout(() => el.remove(), 350); };
    if (action) $('button', el).addEventListener('click', () => { action.faire(); fermer(); });
    $('#toasts').append(el);
    requestAnimationFrame(() => el.classList.add('is-on'));
    setTimeout(fermer, duree || (action ? 6000 : 3200));
  }

  /* ---------- Clavier ---------- */
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || app.hidden) return;
    if ($('dialog[open]') || e.target.closest('input, textarea, select, [contenteditable]')) return;
    const actions = {
      n: () => ouvrirFiche({ nouveau: { date: etat.curseur } }),
      t: allerAujourdhui,
      j: () => changerVue('jour'),
      s: () => changerVue('semaine'),
      m: () => changerVue('mois'),
      l: () => changerVue('liste'),
      arrowleft: () => naviguer(-1),
      arrowright: () => naviguer(1),
      '/': () => { $('#barre').classList.add('cherche'); recherche.focus(); },
    };
    const f = actions[e.key.toLowerCase()];
    if (f) { e.preventDefault(); f(); }
  });

  /* ---------- Horloge et mises à jour ---------- */
  let derniereMinute = maintenant();
  let dernierJour = aujourdhui();
  setInterval(() => {
    if (!etat.distant || app.hidden || glisse) return;
    if (aujourdhui() !== dernierJour) { dernierJour = aujourdhui(); rendre(); return; }
    const m = maintenant();
    if (m === derniereMinute) return;
    derniereMinute = m;
    $$('.maintenant').forEach(el => el.style.setProperty('--d', m));
    rendreAvenir();
  }, 15000);
  setInterval(rafraichir, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { rafraichir(); synchroniser(); } });
  window.addEventListener('online', synchroniser);
  window.addEventListener('offline', () => statut('hors-ligne'));
  petit.addEventListener('change', () => rendre());

  ouvrir();
})();
