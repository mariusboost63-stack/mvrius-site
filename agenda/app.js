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
    actif: false, duree: 30, pause: 10, delai: 24, horizon: 14, feries: true, message: '',
    plages: { 1: [['10:00', '12:00'], ['14:00', '18:00']], 2: [['10:00', '12:00'], ['14:00', '18:00']], 3: [['10:00', '12:00'], ['14:00', '18:00']], 4: [['10:00', '12:00'], ['14:00', '18:00']], 5: [['10:00', '12:00'], ['14:00', '18:00']] },
  };
  const PAS = { jour: 1, semaine: 7, '2semaines': 14 };
  const PRIORITES = [[0, 'Normale', '#b6a993'], [1, 'Haute', '#e8b46a'], [2, 'Urgente', '#ff6b8b']];
  const DUREES_TACHE = [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h'], [180, '3 h'], [240, '4 h']];
  const CORBEILLE_JOURS = 30; // les éléments supprimés restent restaurables 30 jours
  // Factures : informations du vendeur (Réglages › Facturation). Par défaut : franchise de TVA (micro-entreprise)
  const FACTURATION_DEFAUT = { nom: 'Mvrius', identite: '', adresse: '', siret: '', email: '', tva: false, taux: 20, tvaNum: '', iban: '', bic: '', delai: 30, prefixe: 'F', mentions: '' };
  const STATUTS_FACTURE = { brouillon: ['Brouillon', '#9ba3ba'], emise: ['À encaisser', '#e8b46a'], retard: ['En retard', '#ff6b8b'], payee: ['Payée', '#3ddc84'], annulee: ['Annulée', '#7c705f'], avoir: ['Avoir', '#c3a6ff'], rembourse: ['Remboursé', '#3ddc84'] };
  const MESSAGE_CONFIRMATION = 'Bonjour {nom} ! C\'est validé pour notre appel du {date} à {heure} ({duree} min) sur Discord. À très vite, Mvrius';
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

  // Jours fériés en France (métropole), Pâques calculé (algorithme de Meeus)
  const feriesParAnnee = new Map();
  function feriesDe(a) {
    if (feriesParAnnee.has(a)) return feriesParAnnee.get(a);
    const b = a % 19, c = Math.floor(a / 100), e = a % 100, f = Math.floor(c / 4), g = c % 4;
    const h = (19 * b + c - f - Math.floor((c - Math.floor((c + 8) / 25) + 1) / 3) + 15) % 30;
    const l = (32 + 2 * g + 2 * Math.floor(e / 4) - h - (e % 4)) % 7;
    const m = Math.floor((b + 11 * h + 22 * l) / 451);
    const paques = iso(new Date(a, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
    const liste = new Map([
      [`${a}-01-01`, "Jour de l'an"], [decale(paques, 1), 'Lundi de Pâques'], [`${a}-05-01`, 'Fête du Travail'],
      [`${a}-05-08`, 'Victoire 1945'], [decale(paques, 39), 'Ascension'], [decale(paques, 50), 'Lundi de Pentecôte'],
      [`${a}-07-14`, 'Fête nationale'], [`${a}-08-15`, 'Assomption'], [`${a}-11-01`, 'Toussaint'],
      [`${a}-11-11`, 'Armistice 1918'], [`${a}-12-25`, 'Noël'],
    ]);
    feriesParAnnee.set(a, liste);
    return liste;
  }
  const ferieDe = d => feriesDe(Number(d.slice(0, 4))).get(d) || '';

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
  const vide = () => ({ format: 1, categories: clone(CATEGORIES), rendezvous: [], taches: [], reglages: {}, clients: [], modeles: [], corbeille: [], factures: [] });
  function normaliser(d) {
    d = d && typeof d === 'object' ? d : {};
    const cats = Array.isArray(d.categories) && d.categories.length
      ? d.categories.filter(c => c && c.id).map(c => ({ id: String(c.id), nom: String(c.nom || c.id), couleur: couleurSure(c.couleur) }))
      : clone(CATEGORIES);
    const rdv = (Array.isArray(d.rendezvous) ? d.rendezvous : [])
      .filter(r => r && r.id && DATE.test(r.date) && (r.journee || (HEURE.test(r.debut) && HEURE.test(r.fin))));
    // Tâche sans date (null) : « À planifier »
    const taches = (Array.isArray(d.taches) ? d.taches : []).filter(t => t && t.id && typeof t.titre === 'string' && (t.date === null || DATE.test(t.date)));
    const reglages = d.reglages && typeof d.reglages === 'object' && !Array.isArray(d.reglages) ? d.reglages : {};
    const liste = (x, ok) => (Array.isArray(x) ? x.filter(e => e && typeof e === 'object' && ok(e)) : []);
    const clients = liste(d.clients, c => c.id && typeof c.nom === 'string');
    const modeles = liste(d.modeles, m => m.id && typeof m.nom === 'string');
    const corbeille = liste(d.corbeille, c => c.cid && c.type && c.element);
    const factures = liste(d.factures, f => f.id && Array.isArray(f.lignes));
    // Les autres champs éventuels (ajoutés par le serveur) sont gardés tels quels
    return { ...d, format: 1, categories: cats, rendezvous: rdv, taches, reglages, clients, modeles, corbeille, factures };
  }
  // Un changement = une opération rejouable : en cas de conflit avec un autre appareil,
  // on relit le fichier sur GitHub et on rejoue les opérations par-dessus.
  // Ce qui est supprimé va dans la corbeille (restaurable 30 jours) ; « le » et « cid » sont fixés
  // à la création de l'opération pour que le résultat soit le même à chaque fois qu'on la rejoue.
  function mettreALaCorbeille(d, op, type, element) {
    d.corbeille = d.corbeille || [];
    if (d.corbeille.some(c => c.cid === op.cid)) return;
    const limite = new Date(Date.parse(op.le) - CORBEILLE_JOURS * 864e5).toISOString();
    d.corbeille = [{ cid: op.cid, type, element: clone(element), le: op.le }, ...d.corbeille.filter(c => String(c.le) >= limite)].slice(0, 200);
  }
  // Ajoute ou remplace un élément d'une liste (clients, modèles, tâches) ; le retire s'il faut
  function majListe(d, cle, element, retirer) {
    d[cle] = d[cle] || [];
    const k = d[cle].findIndex(x => x.id === element.id);
    if (retirer) { if (k >= 0) return d[cle].splice(k, 1)[0]; return null; }
    if (k >= 0) d[cle][k] = clone(element); else d[cle].push(clone(element));
    return null;
  }
  const LISTES = { tache: 'taches', client: 'clients', modele: 'modeles' };
  // Pour la corbeille : un brouillon de facture supprimé revient dans « factures »
  const LISTES_CORBEILLE = { ...LISTES, facture: 'factures' };
  // Un élément revenu dans l'agenda (bouton « Annuler », restauration) sort de la corbeille
  function nettoyerCorbeille(d) {
    if (!(d.corbeille || []).length) return;
    d.corbeille = d.corbeille.filter(c => {
      if (c.type === 'rdv') return !d.rendezvous.some(r => r.id === c.element.id);
      if (c.type === 'occurrence') {
        const r = d.rendezvous.find(x => x.id === c.element.id);
        return !!r && (r.exceptions || []).includes(c.element.date);
      }
      return !(d[LISTES_CORBEILLE[c.type]] || []).some(x => x.id === c.element.id);
    });
  }
  function appliquer(d, op) {
    appliquerOp(d, op);
    nettoyerCorbeille(d);
  }
  // Émission : numéro suivant (calculé au moment où l'opération est appliquée, donc sans doublon
  // même si un autre appareil a émis une facture entre-temps), copie des informations du vendeur
  // et du client telles qu'elles sont ce jour-là
  function emettre(d, f, op) {
    const reg = { ...FACTURATION_DEFAUT, ...((d.reglages || {}).facturation || {}) };
    const date = DATE.test(op.date) ? op.date : f.date;
    const prefixe = /^[A-Z0-9]{1,6}$/i.test(reg.prefixe) && reg.prefixe.toUpperCase() !== 'AV' ? reg.prefixe.toUpperCase() : 'F';
    const c = (d.clients || []).find(x => x.id === f.client) || {};
    Object.assign(f, {
      date,
      numero: window.Facture.numeroSuivant(d.factures, f.type === 'avoir' ? 'AV' : prefixe, date.slice(0, 4)),
      statut: 'emise',
      tva: reg.tva ? Number(reg.taux) || 20 : null,
      echeance: f.type === 'avoir' ? null : decale(date, Number(reg.delai) || 0),
      vendeur: { nom: reg.nom, identite: reg.identite, adresse: reg.adresse, siret: reg.siret, email: reg.email, tvaNum: reg.tva ? reg.tvaNum : '', iban: reg.iban, bic: reg.bic, mentions: reg.mentions },
      acheteur: { nom: c.nom || f.clientNom || '', adresse: c.adresse || '', email: c.email || '', siren: c.siren || '' },
      emise: op.le, modifie: op.le,
    });
  }
  function opFacture(d, op) {
    d.factures = d.factures || [];
    const f = d.factures.find(x => x.id === (op.facture ? op.facture.id : op.id));
    if (op.type === 'facture') {
      // Une facture émise ne se modifie plus (seulement payée, ou annulée par un avoir)
      if (f && f.statut !== 'brouillon') return;
      majListe(d, 'factures', { ...op.facture, statut: 'brouillon', numero: null });
    } else if (op.type === 'supprimerFacture') {
      if (!f || f.statut !== 'brouillon') return;
      d.factures.splice(d.factures.indexOf(f), 1);
      if (!op.sansCorbeille) mettreALaCorbeille(d, op, 'facture', f);
    } else if (op.type === 'emettreFacture') {
      if (f && f.statut === 'brouillon') emettre(d, f, op);
    } else if (op.type === 'payerFacture') {
      if (!f || !f.numero) return;
      f.paiement = op.paiement ? clone(op.paiement) : null;
      if (f.statut !== 'annulee') f.statut = op.paiement ? 'payee' : 'emise';
      f.modifie = op.le;
    } else if (op.type === 'avoirFacture') {
      if (!f || !f.numero || f.type === 'avoir' || f.statut === 'annulee' || d.factures.some(x => x.id === op.avoir)) return;
      const av = { id: op.avoir, type: 'avoir', client: f.client, clientNom: (f.acheteur || {}).nom, date: op.date, objet: f.objet, ref: f.id, notes: '', statut: 'brouillon', cree: op.le,
        lignes: f.lignes.map(l => ({ ...l, pu: -(Number(l.pu) || 0) })) };
      d.factures.push(av);
      emettre(d, av, op);
      av.tva = f.tva ?? null; // même TVA que la facture annulée
      Object.assign(f, { statut: 'annulee', avoir: av.id, modifie: op.le });
    }
  }
  const OPS_FACTURE = ['facture', 'supprimerFacture', 'emettreFacture', 'payerFacture', 'avoirFacture'];
  function appliquerOp(d, op) {
    if (OPS_FACTURE.includes(op.type)) { opFacture(d, op); return; }
    const listes = LISTES;
    const retraits = { supprimerTache: 'tache', supprimerClient: 'client', supprimerModele: 'modele' };
    if (listes[op.type]) { majListe(d, listes[op.type], op[op.type]); return; }
    if (retraits[op.type]) {
      const type = retraits[op.type];
      const retire = majListe(d, listes[type], { id: op.id }, true);
      if (retire && !op.sansCorbeille) mettreALaCorbeille(d, op, type, retire);
      return;
    }
    if (op.type === 'restaurer') {
      const k = (d.corbeille || []).findIndex(c => c.cid === op.cid);
      if (k < 0) return;
      const [c] = d.corbeille.splice(k, 1);
      if (c.type === 'rdv') { if (!d.rendezvous.some(r => r.id === c.element.id)) d.rendezvous.push(clone(c.element)); }
      else if (c.type === 'occurrence') {
        const r = d.rendezvous.find(x => x.id === c.element.id);
        if (r) r.exceptions = (r.exceptions || []).filter(x => x !== c.element.date);
      } else if (LISTES_CORBEILLE[c.type]) majListe(d, LISTES_CORBEILLE[c.type], c.element);
      return;
    }
    if (op.type === 'viderCorbeille') { d.corbeille = []; return; }
    if (op.type === 'remplacer') {
      // Retour à une ancienne version de l'agenda (historique)
      const v = normaliser(clone(op.donnees));
      Object.keys(d).forEach(k => delete d[k]);
      Object.assign(d, v);
      return;
    }
    const i = d.rendezvous.findIndex(r => r.id === (op.rdv ? op.rdv.id : op.id));
    if (op.type === 'enregistrer') {
      if (i >= 0) d.rendezvous[i] = clone(op.rdv);
      else d.rendezvous.push(clone(op.rdv));
    } else if (op.type === 'supprimer') {
      if (i >= 0) {
        const retire = d.rendezvous.splice(i, 1)[0];
        if (!op.sansCorbeille) mettreALaCorbeille(d, op, 'rdv', retire);
      }
    } else if (op.type === 'sauter') {
      if (i >= 0) {
        const r = d.rendezvous[i];
        if (!(r.exceptions || []).includes(op.date)) mettreALaCorbeille(d, op, 'occurrence', { id: r.id, date: op.date, titre: r.titre });
        r.exceptions = [...new Set([...(r.exceptions || []), op.date])].sort();
      }
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
  const clients = () => donnees().clients || [];
  const clientDe = id => (id ? clients().find(c => c.id === id) : null);
  const modeles = () => donnees().modeles || [];
  const corbeille = () => donnees().corbeille || [];
  const factures = () => donnees().factures || [];
  const facturation = () => ({ ...FACTURATION_DEFAUT, ...((donnees().reglages || {}).facturation || {}) });
  const feriesActifs = () => (donnees().reglages || {}).feries !== false;
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
    if (op.type === 'client') return `${op.nouveau ? 'Nouveau client' : 'Fiche client modifiée'} : ${op.client.nom}`;
    if (op.type === 'supprimerClient') return `Client supprimé : ${op.titre || ''}`;
    if (op.type === 'modele') return `${op.nouveau ? 'Nouveau modèle' : 'Modèle modifié'} : ${op.modele.nom}`;
    if (op.type === 'supprimerModele') return `Modèle supprimé : ${op.titre || ''}`;
    if (op.type === 'restaurer') return `Restauré depuis la corbeille : ${op.titre || ''}`;
    if (op.type === 'viderCorbeille') return 'Corbeille vidée';
    if (op.type === 'remplacer') return op.message || "Retour à une version précédente de l'agenda";
    if (op.type === 'facture') return `${op.nouveau ? 'Nouveau brouillon de facture' : 'Brouillon de facture modifié'} : ${op.titre || ''}`;
    if (op.type === 'supprimerFacture') return `Brouillon de facture supprimé : ${op.titre || ''}`;
    if (op.type === 'emettreFacture') return `Facture émise : ${op.titre || ''}`;
    if (op.type === 'payerFacture') return `Facture ${op.numero || ''} : ${op.paiement ? 'payée' : 'paiement annulé'}`;
    if (op.type === 'avoirFacture') return `Avoir pour la facture ${op.numero || ''}`;
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
    const le = new Date().toISOString();
    etat.attente.push(...[].concat(ops).map(op => ({ le, cid: nouvelId(), ...op })));
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
  const avecDe = r => (clientDe(r.client) || {}).nom || r.avec || '';
  // « aujourd'hui », « demain », « le lun. 3 nov. »
  const leJour = d => { const q = quand(d); return d === aujourdhui() || d === decale(aujourdhui(), 1) ? q.toLowerCase() : `le ${q}`; };
  function libelleHoraire(i) {
    const r = i.r;
    if (r.journee) return i.fin === i.date ? 'Toute la journée' : `Du ${jourCourt(i.date)} au ${jourCourt(i.fin)}`;
    return i.fin === i.date ? `${r.debut} – ${r.fin}` : `${jourCourt(i.date)} ${r.debut} → ${jourCourt(i.fin)} ${r.fin}`;
  }
  function blocEv(i) {
    const c = categorie(i.r.categorie);
    const duree = i.finM - i.debut;
    const avec = avecDe(i.r);
    const label = `${libelleHoraire(i)}, ${i.r.titre}${avec ? `, avec ${avec}` : ''}`;
    return `<button type="button" class="ev statut-${esc(i.r.statut || 'confirme')}${duree < 45 ? ' ev--court' : ''}${i.plusieurs ? ' ev--plusieurs' : ''}" data-id="${esc(i.r.id)}" data-date="${i.date}" style="--c:${couleurSure(c.couleur)};--d:${i.debut};--l:${duree};--col:${i.col};--tot:${i.total}" aria-label="${esc(label)}">`
      + `<span class="ev-titre">${i.r.repetition ? icone('repete') : ''}${i.r.tache ? icone('coche') : ''}${esc(i.r.titre)}</span>`
      + `<span class="ev-heure">${i.r.debut} ${i.plusieurs ? '→' : '–'} ${i.r.fin}${avec ? ` · ${esc(avec)}` : ''}</span>`
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
    const fer = d => (feriesActifs() ? ferieDe(d) : '');
    const repos = d => !t.jours.includes(jourIso(d)) || !!fer(d);
    // Heures hors travail grisées (journée entière grisée les jours de repos)
    const horaires = d => (t.griser ? ` a-horaires" style="--td:${repos(d) ? 1440 : minutes(t.debut)};--tf:${repos(d) ? 1440 : minutes(t.fin) || 1440}` : '');
    const tete = jours.map(d => `<button type="button" class="g-jour${d === auj ? ' is-auj' : ''}${t.griser && repos(d) ? ' is-repos' : ''}" data-aller="${d}" aria-label="${esc(maj1(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })))}"><span>${esc(fmt(d, { weekday: 'short' }).replace('.', ''))}</span><b>${jour(d).getDate()}</b></button>`).join('');
    // En haut : journées entières et rendez-vous de 24 h ou plus ; dans la grille : le reste,
    // découpé jour par jour s'il passe minuit (ex. 22:00 → 02:00)
    const enHaut = i => i.r.journee || i.longue;
    const journee = jours.map(d => `<div class="g-jt" data-date="${d}">${fer(d) ? `<span class="puce puce--ferie">${esc(fer(d))}</span>` : ''}${liste.filter(i => enHaut(i) && i.date <= d && i.fin >= d).map(i => puce(i, true, d)).join('')}</div>`).join('');
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
      const fer = feriesActifs() ? ferieDe(d) : '';
      cases += `<div class="m-case${hors ? ' is-hors' : ''}${d === auj ? ' is-auj' : ''}${d === etat.curseur ? ' is-choisi' : ''}${fer ? ' is-ferie' : ''}" data-date="${d}">`
        + `<button type="button" class="m-num" data-aller="${d}" aria-label="${esc(nom)}${fer ? `, ${esc(fer)}` : ''}${ici.length ? `, ${ici.length} rendez-vous` : ''}">${jour(d).getDate()}</button>`
        + `${fer ? `<span class="m-ferie">${esc(fer)}</span>` : ''}`
        + `<div class="m-evs">${ici.slice(0, 3).map(i => puce(i, true, d)).join('')}${ici.length > 3 ? `<button type="button" class="m-plus" data-aller="${d}">+${ici.length - 3} autre${ici.length > 4 ? 's' : ''}</button>` : ''}</div>`
        + `<div class="m-points" aria-hidden="true">${ici.slice(0, 4).map(i => `<i style="--c:${couleurSure(categorie(i.r.categorie).couleur)}"></i>`).join('')}</div></div>`;
    }
    const tete = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(j => `<span>${j}</span>`).join('');
    // Sur mobile, les rendez-vous du jour choisi s'affichent sous le mois
    const choisis = liste.filter(i => i.date <= etat.curseur && i.fin >= etat.curseur);
    const ferCurseur = feriesActifs() ? ferieDe(etat.curseur) : '';
    const detail = `<section class="m-detail"><h3 class="l-date">${esc(maj1(fmt(etat.curseur, { weekday: 'long', day: 'numeric', month: 'long' })))}${etat.curseur === auj ? " <small>Aujourd'hui</small>" : ''}</h3>`
      + `${ferCurseur ? `<p class="l-ferie">${esc(ferCurseur)} · jour férié</p>` : ''}`
      + `${choisis.length ? `<div class="l-items">${choisis.map(ligne).join('')}</div>` : '<p class="av-vide">Rien de prévu ce jour-là.</p>'}`
      + `<button type="button" class="btn btn--ghost btn--petit" data-nouveau="${etat.curseur}">${icone('plus')}Ajouter ce jour-là</button></section>`;
    return `<div class="mois"><div class="m-tete" aria-hidden="true">${tete}</div><div class="m-grille" style="--semaines:${semaines}">${cases}</div>${detail}</div>`;
  }

  /* ---------- Vue Liste ---------- */
  function ligne(i) {
    const r = i.r;
    const c = categorie(r.categorie);
    const avec = avecDe(r);
    const infos = [
      avec && `<span>${icone(r.client && clientDe(r.client) ? 'clients' : 'personne')}${esc(avec)}</span>`,
      r.lieu && `<span>${icone('lieu')}${esc(r.lieu)}</span>`,
      r.repetition && `<span>${icone('repete')}${esc((REPETITIONS.find(x => x[0] === r.repetition.frequence) || ['', ''])[1])}</span>`,
      Array.isArray(r.checklist) && r.checklist.length && `<span>${icone('coche')}${r.checklist.filter(x => x.fait).length}/${r.checklist.length}</span>`,
      r.source === 'reservation' && `<span>${icone('calendrier')}Réservé en ligne</span>`,
      !avec && !r.lieu && !r.repetition && `<span>${esc(c.nom)}</span>`,
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
    if (q) liste = liste.filter(i => sansAccents(`${i.r.titre} ${avecDe(i.r)} ${i.r.avec} ${i.r.lieu} ${i.r.notes} ${categorie(i.r.categorie).nom}`).includes(q));
    else liste = liste.filter(pasFini);
    const taches = q ? '' : `<section class="l-jour l-taches"><h3 class="l-date">Tâches du jour</h3>${blocTaches(auj)}</section>`
      + `<section class="l-jour l-taches"><h3 class="l-date">À planifier</h3>${blocAPlanifier()}</section>`;
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
    if (!q && feriesActifs()) {
      const dernier = liste.length > MAX ? liste[MAX - 1].date : decale(auj, 60);
      for (let d = auj; d <= dernier; d = decale(d, 1)) if (ferieDe(d) && !groupes.has(d)) groupes.set(d, []);
    }
    let html = taches;
    for (const d of [...groupes.keys()].sort()) {
      const items = groupes.get(d);
      const rel = d === auj ? "Aujourd'hui" : d === decale(auj, 1) ? 'Demain' : '';
      const annee = jour(d).getFullYear() !== jour(auj).getFullYear() ? ` ${jour(d).getFullYear()}` : '';
      const fer = !q && feriesActifs() ? ferieDe(d) : '';
      html += `<section class="l-jour"><h3 class="l-date">${esc(maj1(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })))}${annee}${rel ? ` <small>${rel}</small>` : ''}</h3>`
        + `${fer ? `<p class="l-ferie">${esc(fer)} · jour férié</p>` : ''}${items.length ? `<div class="l-items">${items.map(ligne).join('')}</div>` : ''}</section>`;
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
    $('#aplanifier').innerHTML = blocAPlanifier();
    const nbAPlanifier = aPlanifier().length;
    $('#aplanifier-compte').textContent = nbAPlanifier ? `· ${nbAPlanifier}` : '';
    $('#clients-compte').textContent = clients().length || '';
    const aEncaisser = factures().filter(f => f.statut === 'emise' && f.type !== 'avoir').length;
    $('#factures-compte').textContent = aEncaisser ? `${aEncaisser} à encaisser` : '';
    rendreFiltres();
  }

  /* ---------- Tâches ---------- */
  // Tâches d'un jour ; aujourd'hui, celles des jours passés pas encore faites sont reportées
  // Ordre : à faire avant fait, puis priorité, échéance la plus proche, ancienneté
  const ordreTaches = (a, b) => Number(!!a.fait) - Number(!!b.fait) || (Number(b.priorite) || 0) - (Number(a.priorite) || 0)
    || String(a.echeance || '9999').localeCompare(String(b.echeance || '9999')) || String(a.date || '').localeCompare(String(b.date || '')) || String(a.cree).localeCompare(String(b.cree));
  function tachesDu(d) {
    const auj = aujourdhui();
    const toutes = donnees().taches || [];
    return toutes.filter(t => t.date && (t.date === d || (d === auj && !t.fait && t.date < auj))).sort(ordreTaches);
  }
  const aPlanifier = () => (donnees().taches || []).filter(t => !t.date && !t.fait).sort(ordreTaches);
  function itemTache(t, d) {
    const auj = aujourdhui();
    const prio = Number(t.priorite) || 0;
    const echeance = DATE.test(t.echeance || '') && !t.fait
      ? `<small class="t-echeance${t.echeance < auj ? ' is-retard' : t.echeance === auj ? ' is-auj' : ''}" title="Échéance">${icone('sablier')}${esc(t.echeance === auj ? "aujourd'hui" : fmt(t.echeance, { day: 'numeric', month: 'short' }))}</small>` : '';
    const retard = d && t.date && !t.fait && t.date < d ? `<small class="t-retard">${esc(fmt(t.date, { day: 'numeric', month: 'short' }))}</small>` : '';
    return `<li class="t-item prio-${prio}${t.fait ? ' is-fait' : ''}"${t.fait ? '' : ` draggable="true" data-glisser-tache="${esc(t.id)}"`}>`
      + `<label class="t-coche" title="Fait"><input type="checkbox" data-tache-coche="${esc(t.id)}"${t.fait ? ' checked' : ''} aria-label="${esc(t.titre)} : faite"><span class="t-case" aria-hidden="true"></span></label>`
      + `<button type="button" class="t-texte" data-tache-ouvrir="${esc(t.id)}"><span class="t-titre">${prio ? `<span class="t-prio" title="Priorité ${esc(PRIORITES[prio][1].toLowerCase())}">${icone('drapeau')}</span>` : ''}${esc(t.titre)}${t.bloc && trouver(t.bloc) ? icone('calendrier', 'i t-planifiee') : ''}</span>${echeance}${retard}</button>`
      + `<button type="button" class="t-suppr" data-tache-suppr="${esc(t.id)}" aria-label="Supprimer la tâche ${esc(t.titre)}">${icone('fermer')}</button></li>`;
  }
  function blocTaches(d) {
    return `<div class="taches"><ul class="t-liste">${tachesDu(d).map(t => itemTache(t, d)).join('')}</ul>`
      + `<form class="t-ajout" data-tache-ajout="${d}"><input type="text" maxlength="200" placeholder="Ajouter une tâche…" aria-label="Ajouter une tâche" autocomplete="off"></form></div>`;
  }
  function blocAPlanifier() {
    return `<div class="taches"><ul class="t-liste">${aPlanifier().map(t => itemTache(t, null)).join('')}</ul>`
      + '<form class="t-ajout" data-tache-ajout=""><input type="text" maxlength="200" placeholder="Ajouter à planifier…" aria-label="Ajouter une tâche à planifier" autocomplete="off"></form></div>';
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
    const dans = f.closest('#aplanifier') ? '#aplanifier' : f.closest('#cote') ? '#cote' : '#vue';
    operation({ type: 'tache', nouveau: true, tache: { id: nouvelId(), titre, date: f.dataset.tacheAjout || null, fait: false, faitLe: null, priorite: 0, echeance: null, duree: 60, cree: new Date().toISOString() } });
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
      const fer = feriesActifs() ? ferieDe(d) : '';
      const cls = ['mini-jour', jour(d).getMonth() !== premier.getMonth() && 'is-hors', d === auj && 'is-auj', d >= selDe && d <= selA && etat.vue !== 'liste' && 'is-sel', avecRdv.has(d) && 'a-rdv', fer && 'is-ferie'].filter(Boolean).join(' ');
      jours += `<button type="button" class="${cls}" data-mini-jour="${d}" aria-label="${esc(maj1(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })))}${fer ? `, ${esc(fer)}` : ''}${avecRdv.has(d) ? ', rendez-vous prévus' : ''}"${fer ? ` title="${esc(fer)}"` : ''}>${jour(d).getDate()}</button>`;
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
    champs.avec.value = v.avec || (clientDe(v.client) || {}).nom || '';
    champs.lieu.value = v.lieu || '';
    champs.notes.value = v.notes || '';
    champs.facturable.checked = r ? (r.facturable !== undefined ? !!r.facturable : r.source !== 'reservation') : true;
    form.dataset.debut = champs.debut.value;
    form.dataset.date = champs.date.value;
    $('#clients-noms').innerHTML = clients().map(c => `<option value="${esc(c.nom)}"></option>`).join('');
    $('[data-serie]', form).hidden = !(r && r.repetition);
    $$('[data-action]', form).forEach(b => { b.hidden = !r && b.dataset.action !== 'modele'; });
    $('#f-erreur').textContent = '';
    rendreModelesFiche();
    majFiche();
    fiche.showModal();
    if (!r) champs.titre.focus();
  }
  // Client dont le nom correspond au champ « Avec » (sans tenir compte des accents ni des majuscules)
  const clientParNom = texte => {
    const t = sansAccents(texte).trim();
    return t ? clients().find(c => sansAccents(c.nom).trim() === t) || null : null;
  };

  /* Modèles : en haut d'un nouveau rendez-vous */
  function rendreModelesFiche() {
    const zone = $('#f-modeles');
    const liste = modeles();
    zone.hidden = !ficheEtat || !!ficheEtat.r || !liste.length;
    if (zone.hidden) return;
    zone.innerHTML = '<span class="f-legende">Partir d\'un modèle</span>'
      + liste.map(m => `<button type="button" class="pastille-btn" data-modele="${esc(m.id)}">${icone('modele')}${esc(m.nom)}</button>`).join('');
  }
  function appliquerModele(m) {
    if (m.titre) champs.titre.value = m.titre;
    const cat = $$('input[name="categorie"]', form).find(x => x.value === m.categorie);
    if (cat) cat.checked = true;
    champs.journee.checked = !!m.journee;
    if (!m.journee && m.duree > 0 && DATE.test(champs.date.value) && HEURE.test(champs.debut.value)) {
      [champs.dateFin.value, champs.fin.value] = finDepuis(instantDebut(champs.date.value, champs.debut.value) + m.duree);
    }
    remplirRappels(!!m.journee, Array.isArray(m.rappels) ? m.rappels : [rappelDefaut(!!m.journee)]);
    ficheEtat.checklist = (m.checklist || []).filter(x => x && x.t).map(x => ({ t: x.t, fait: false }));
    rendreChecklist();
    if (m.avec) champs.avec.value = m.avec;
    if (m.lieu) champs.lieu.value = m.lieu;
    if (m.notes) champs.notes.value = m.notes;
    $$('[data-modele]', form).forEach(b => b.classList.toggle('is-on', b.dataset.modele === m.id));
    majFiche();
  }
  $('#f-modeles').addEventListener('click', e => {
    const b = e.target.closest('[data-modele]');
    const m = b && modeles().find(x => x.id === b.dataset.modele);
    if (m) appliquerModele(m);
  });
  // Modèle tiré de la fiche ouverte (ce qui est saisi, pas forcément enregistré)
  function modeleDepuisFiche() {
    const journee = champs.journee.checked;
    const dateFin = DATE.test(champs.dateFin.value) && champs.dateFin.value >= champs.date.value ? champs.dateFin.value : champs.date.value;
    const duree = !journee && DATE.test(champs.date.value) && HEURE.test(champs.debut.value) && HEURE.test(champs.fin.value)
      ? instantFin(dateFin, champs.fin.value) - instantDebut(champs.date.value, champs.debut.value) : 60;
    return {
      titre: champs.titre.value.trim(),
      categorie: (form.querySelector('input[name="categorie"]:checked') || {}).value || categories()[0].id,
      journee,
      duree: duree > 0 ? duree : 60,
      rappels: $$('#f-rappels input:checked').map(c => Number(c.value)).sort((a, b) => b - a),
      checklist: ficheEtat.checklist.filter(x => x.t).map(x => ({ t: x.t })),
      avec: champs.avec.value.trim(),
      lieu: champs.lieu.value.trim(),
      notes: champs.notes.value.trim(),
    };
  }
  function enregistrerModele() {
    const d = $('#modele-nom');
    const champ = $('#modele-nom-champ');
    champ.value = champs.titre.value.trim().slice(0, 40);
    d.returnValue = '';
    d.showModal();
    champ.select();
    d.addEventListener('close', () => {
      const nom = champ.value.trim();
      if (d.returnValue !== 'ok' || !nom) return;
      const existant = modeles().find(m => sansAccents(m.nom) === sansAccents(nom));
      const modele = { id: existant ? existant.id : nouvelId(), nom, ...modeleDepuisFiche() };
      operation({ type: 'modele', modele, nouveau: !existant });
      rendreModelesFiche();
      toast(existant ? `Modèle « ${nom} » mis à jour` : `Modèle « ${nom} » créé`, { texte: 'Annuler', faire: () => operation(existant ? { type: 'modele', modele: existant } : { type: 'supprimerModele', id: modele.id, titre: nom }) });
    }, { once: true });
  }
  $('#modele-nom-champ').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#modele-nom').close('ok'); }
  });

  /* Chevauchements : prévenir et proposer le prochain créneau libre */
  const instantMaintenant = () => instantDebut(aujourdhui(), heure(maintenant()));
  // Rendez-vous avec horaire (non annulés) qui chevauchent [de, a[ en minutes depuis BASE
  function chevauchements(date, dateFin, de, a, sauf) {
    return instances(decale(date, -7), dateFin, true).filter(i => i.r.id !== sauf && i.r.statut !== 'annule' && !i.r.journee
      && instantDebut(i.date, i.r.debut) < a && instantFin(i.fin, i.r.fin) > de);
  }
  // Premier créneau libre de la même durée, dans les heures de travail, sur les 3 semaines qui suivent
  function prochainLibre(duree, depuis, sauf) {
    const t = travail();
    const ouverture = minutes(t.debut);
    const fermeture = minutes(t.fin) || 1440;
    const j0 = Math.floor(depuis / 1440);
    for (let j = 0; j < 21; j++) {
      const d = decale(BASE, j0 + j);
      if (!t.jours.includes(jourIso(d)) || (feriesActifs() && ferieDe(d))) continue;
      const occupe = instances(d, d, true).filter(i => i.r.id !== sauf && i.r.statut !== 'annule' && !i.r.journee)
        .map(i => [i.date === d ? i.debut : 0, i.fin === d ? i.finM : 1440]);
      let m = j === 0 ? Math.max(ouverture, Math.ceil((depuis - j0 * 1440) / 15) * 15) : ouverture;
      for (; m + duree <= fermeture; m += 15) {
        if (!occupe.some(([x, y]) => m < y && m + duree > x)) return { date: d, debut: heure(m), fin: heure(m + duree) };
      }
    }
    return null;
  }
  function majConflit() {
    const zone = $('#f-conflit');
    const statutChoisi = (form.querySelector('input[name="statut"]:checked') || {}).value;
    const date = champs.date.value;
    const dateFin = DATE.test(champs.dateFin.value) && champs.dateFin.value >= date ? champs.dateFin.value : date;
    let liste = [];
    let de = 0;
    let a = 0;
    if (!champs.journee.checked && statutChoisi !== 'annule' && DATE.test(date) && HEURE.test(champs.debut.value) && HEURE.test(champs.fin.value)) {
      de = instantDebut(date, champs.debut.value);
      a = instantFin(dateFin, champs.fin.value);
      if (a > de) liste = chevauchements(date, dateFin, de, a, ficheEtat && ficheEtat.r && ficheEtat.r.id);
    }
    zone.hidden = !liste.length;
    if (!liste.length) { zone.innerHTML = ''; return; }
    const autres = liste.length - 1;
    const libre = prochainLibre(a - de, Math.max(de, instantMaintenant()), ficheEtat && ficheEtat.r && ficheEtat.r.id);
    zone.innerHTML = `${icone('alerte')}<div><b>Ce créneau chevauche « ${esc(liste[0].r.titre)} »</b> <span>${esc(libelleHoraire(liste[0]))}${autres ? ` et ${autres} autre${autres > 1 ? 's' : ''}` : ''}</span>`
      + (libre ? `<button type="button" class="f-conflit-btn" data-libre="${libre.date}|${libre.debut}|${libre.fin}">Prendre le prochain créneau libre : ${esc(quand(libre.date).toLowerCase())} ${libre.debut} – ${libre.fin}</button>` : '')
      + '</div>';
  }
  $('#f-conflit').addEventListener('click', e => {
    const b = e.target.closest('[data-libre]');
    if (!b) return;
    const [d, h1, h2] = b.dataset.libre.split('|');
    champs.date.value = d;
    champs.dateFin.value = d;
    champs.debut.value = h1;
    champs.fin.value = h2;
    form.dataset.date = d;
    form.dataset.debut = h1;
    majFiche();
  });
  // Rappels : pastilles à cocher (aucune cochée = pas de rappel)
  function remplirRappels(journee, valeurs) {
    const liste = journee ? RAPPELS_JOURNEE : RAPPELS;
    const zone = $('#f-rappels');
    zone.innerHTML = `<legend class="f-legende">Rappels sur Discord${journee ? '' : ' <small>avant le début</small>'}</legend>`
      + liste.map(([v, t]) => `<label class="choix" style="--c:#e8b46a"><input type="checkbox" name="rappels" value="${v}"${valeurs.includes(Number(v)) ? ' checked' : ''}><span>${t}</span></label>`).join('');
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
    const connu = clients().find(c => (d.email && sansAccents(c.email) === sansAccents(d.email)) || (d.discord && sansAccents(c.discord) === sansAccents(d.discord)));
    zone.innerHTML = `${icone('calendrier')}<div><b>Réservé en ligne par ${esc(d.nom || '?')}</b>${recue ? ` <small>le ${esc(recue)}</small>` : ''}`
      + `<span>${[email, d.discord && `Discord : ${esc(d.discord)}`, d.sujet && esc(d.sujet)].filter(Boolean).join(' · ')}</span>`
      + `${r.statut === 'attente' ? '<small>Confirme la demande, puis envoie le message à la personne.</small>' : ''}`
      + '<span class="f-demande-actions">'
      + `<button type="button" class="btn btn--ghost btn--petit" data-demande="copier">${icone('copie')}${r.statut === 'attente' ? 'Confirmer et copier le message' : 'Copier le message de confirmation'}</button>`
      + (email ? `<button type="button" class="btn btn--ghost btn--petit" data-demande="email">${icone('lien')}Écrire l'e-mail</button>` : '')
      + (connu ? `<button type="button" class="btn btn--lien btn--petit" data-demande="voir" data-client="${esc(connu.id)}">${icone('clients')}Client : ${esc(connu.nom)}</button>`
        : `<button type="button" class="btn btn--lien btn--petit" data-demande="client">${icone('plus')}Créer la fiche client</button>`)
      + '</span></div>';
  }
  // Message de confirmation (réglages) avec la date et l'heure saisies dans la fiche
  function messageConfirmation(d) {
    const date = DATE.test(champs.date.value) ? champs.date.value : ficheEtat.r.date;
    const h1 = HEURE.test(champs.debut.value) ? champs.debut.value : ficheEtat.r.debut;
    const h2 = HEURE.test(champs.fin.value) ? champs.fin.value : ficheEtat.r.fin;
    const duree = Math.max(0, (minutes(h2) || 1440) - minutes(h1));
    const modele = String(reservation().message || '').trim() || MESSAGE_CONFIRMATION;
    const parlee = h => { const [x, y] = h.split(':'); return y === '00' ? `${Number(x)} h` : `${Number(x)} h ${y}`; };
    const valeurs = { nom: d.nom || '', date: fmt(date, { weekday: 'long', day: 'numeric', month: 'long' }), heure: parlee(h1), fin: parlee(h2), duree: String(duree), sujet: d.sujet || '' };
    return modele.replace(/\{(nom|date|heure|fin|duree|sujet)\}/g, (_, k) => valeurs[k]);
  }
  async function copier(texte) {
    try {
      await navigator.clipboard.writeText(texte);
      return true;
    } catch (e) {
      const zone = Object.assign(document.createElement('textarea'), { value: texte });
      zone.style.cssText = 'position:fixed;opacity:0';
      document.body.append(zone);
      zone.select();
      const ok = document.execCommand('copy');
      zone.remove();
      return ok;
    }
  }
  $('#f-demande').addEventListener('click', async e => {
    const b = e.target.closest('[data-demande]');
    const d = ficheEtat && ficheEtat.r && ficheEtat.r.demande;
    if (!b || !d) return;
    const action = b.dataset.demande;
    if (action === 'copier') {
      const confirmer = form.querySelector('input[name="statut"][value="confirme"]');
      const etaitAttente = !confirmer.checked;
      confirmer.checked = true;
      const ok = await copier(messageConfirmation(d));
      toast(ok ? `Message copié${etaitAttente ? ' · enregistre pour confirmer le rendez-vous' : ''}` : 'Copie impossible : sélectionne le texte dans les réglages.', null, 4500);
    } else if (action === 'email') {
      location.href = `mailto:${encodeURIComponent(d.email)}?subject=${encodeURIComponent('Notre appel est confirmé')}&body=${encodeURIComponent(messageConfirmation(d))}`;
    } else if (action === 'client') {
      const c = creerClient({ nom: d.nom || 'Client', email: d.email || '', discord: d.discord || '', notes: d.sujet ? `Premier contact : réservation en ligne (${d.sujet}).` : 'Premier contact : réservation en ligne.' });
      champs.avec.value = c.nom;
      majFiche();
      rendreDemande(ficheEtat.r);
    } else if (action === 'voir') {
      const c = clientDe(b.dataset.client);
      if (c) { champs.avec.value = c.nom; majFiche(); ouvrirClients(c.id); }
    }
  });
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
    // Client relié au rendez-vous (par son nom dans « Avec »)
    const client = clientParNom(champs.avec.value);
    $('#f-client').hidden = !client;
    $('#f-client-creer').hidden = !!client || !champs.avec.value.trim();
    $('#f-facturable-l').hidden = !client;
    majConflit();
  }
  $('#f-client').addEventListener('click', e => {
    e.preventDefault();
    const c = clientParNom(champs.avec.value);
    if (c) ouvrirClients(c.id);
  });
  $('#f-client-creer').addEventListener('click', e => {
    e.preventDefault();
    const nom = champs.avec.value.trim();
    if (!nom) return;
    const d = ficheEtat && ficheEtat.r && ficheEtat.r.demande;
    creerClient({ nom, email: (d && d.email) || '', discord: (d && d.discord) || '' });
    majFiche();
  });
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
    const client = clientParNom(rdv.avec);
    if (client) { rdv.client = client.id; rdv.facturable = champs.facturable.checked; }
    else { delete rdv.client; delete rdv.facturable; }
    delete rdv.rappel; // ancien réglage à un seul rappel
    if (avant && (avant.date !== rdv.date || avant.debut !== rdv.debut)) delete rdv.relance;
    fiche.close();
    if (!avant && !visible(rdv.date)) { etat.curseur = rdv.date; etat.mini = null; }
    operation({ type: 'enregistrer', rdv, nouveau: !avant });
    toast(avant ? 'Rendez-vous modifié' : 'Rendez-vous ajouté', {
      texte: 'Annuler',
      faire: () => operation(avant ? { type: 'enregistrer', rdv: avant } : { type: 'supprimer', id: rdv.id, titre: rdv.titre, sansCorbeille: true }),
    });
  });
  form.addEventListener('click', e => {
    const action = e.target.closest('[data-action]');
    if (action && action.dataset.action === 'modele') { enregistrerModele(); return; }
    if (!action || !ficheEtat.r) return;
    const r = ficheEtat.r;
    if (action.dataset.action === 'supprimer') { fiche.close(); supprimer(r, ficheEtat.occurrence); }
    else if (action.dataset.action === 'dupliquer') {
      ficheEtat = { r: null, occurrence: null, checklist: ficheEtat.checklist.map(x => ({ t: x.t, fait: false })) };
      rendreChecklist();
      rendreDemande(null);
      rendreModelesFiche();
      $('#fiche-titre').textContent = 'Nouveau rendez-vous (copie)';
      $('[data-serie]', form).hidden = true;
      $$('[data-action]', form).forEach(b => { b.hidden = b.dataset.action !== 'modele'; });
      majFiche();
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
    const conflit = chevauchements(date, date, instantDebut(date, heure(debut)), instantDebut(date, '00:00') + fin, r.id)[0];
    const quandTxt = `${quand(date).toLowerCase() === "aujourd'hui" ? "aujourd'hui" : `le ${fmt(date, { weekday: 'short', day: 'numeric', month: 'short' })}`} à ${heure(debut)}${conflit ? ` · chevauche « ${conflit.r.titre} »` : ''}`;
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
    const ev = e.target.closest('.ev, .puce[data-id], .l-ev');
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
    else if (a === 'clients') ouvrirClients();
    else if (a === 'factu') ouvrirFactu();
    else if (a === 'factures') ouvrirFactures();
    else if (a === 'corbeille') ouvrirCorbeille();
    else if (a === 'historique') ouvrirHistorique();
    else if (a === 'ics') telecharger('agenda-mvrius.ics', ics(donnees().rendezvous), 'text/calendar;charset=utf-8');
    else if (a === 'json') telecharger(`agenda-sauvegarde-${aujourdhui()}.json`, JSON.stringify(donnees(), null, 2), 'application/json');
    else if (a === 'raccourcis') toast('N nouveau · T aujourd\'hui · J S M L vues · ← → naviguer · / rechercher · C clients · F factures · H heures', null, 8000);
    else if (a === 'deconnexion') deconnecter();
  });

  /* ---------- Réglages ---------- */
  const reglages = $('#reglages');
  let brouillon = null;
  const resumeActuel = () => ({ actif: false, heure: '08:00', ...((donnees().reglages || {}).resume || {}) });
  const semaineActuelle = () => ({ actif: false, heure: '19:00', ...((donnees().reglages || {}).resumeSemaine || {}) });
  let brouillonModeles = [];
  const CHAMPS_FACTURATION = ['nom', 'identite', 'adresse', 'siret', 'email', 'tvaNum', 'iban', 'bic', 'mentions'];
  function ouvrirReglages(section) {
    brouillon = clone(categories());
    rendreCategoriesEdit();
    brouillonModeles = clone(modeles());
    rendreModelesEdit();
    $('#r-resume').checked = !!resumeActuel().actif;
    $('#r-semaine').checked = !!semaineActuelle().actif;
    $('#r-semaine-heure').value = semaineActuelle().heure;
    $('#r-feries').checked = feriesActifs();
    // Heures de travail
    const t = travail();
    $('#r-jours').innerHTML = '<legend class="sr">Jours travaillés</legend>' + JOURS.map((nom, k) => `<label class="choix" style="--c:#e8b46a"><input type="checkbox" value="${k + 1}"${t.jours.includes(k + 1) ? ' checked' : ''}><span>${nom.slice(0, 3)}.</span></label>`).join('');
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
    $('#r-resa-feries').checked = resa.feries !== false;
    $('#r-resa-message').value = resa.message || '';
    $('#r-resa-message').placeholder = MESSAGE_CONFIRMATION;
    // Facturation
    const fa = facturation();
    CHAMPS_FACTURATION.forEach(k => { $(`#r-f-${k}`).value = fa[k] || ''; });
    $('#r-f-mentions').placeholder = window.Facture.MENTIONS;
    $('#r-f-tva').checked = !!fa.tva;
    $('#r-f-taux').value = String(fa.taux || 20);
    $('#r-f-delai').value = String(Number(fa.delai) || 0);
    $('#r-f-prefixe').value = fa.prefixe || 'F';
    majTvaReglages();
    reglages.showModal();
    if (section) { const el = $(`#r-${section}`); if (el) el.scrollIntoView({ block: 'start' }); }
  }
  const majTvaReglages = () => { $('#r-f-tva-detail').hidden = !$('#r-f-tva').checked; };
  $('#r-f-tva').addEventListener('change', majTvaReglages);
  // Modèles : renommer ou supprimer (les changements s'appliquent avec « Enregistrer »)
  function rendreModelesEdit() {
    const resume = m => [m.journee ? 'Journée' : heuresTxt(Number(m.duree) || 60), categorie(m.categorie).nom].join(' · ');
    $('#modeles-edit').innerHTML = brouillonModeles.length ? brouillonModeles.map((m, i) => `<div class="cat-ligne cat-ligne--modele" data-i="${i}">`
      + `<span class="mo-ic" style="--c:${couleurSure(categorie(m.categorie).couleur)}">${icone('modele')}</span>`
      + `<input value="${esc(m.nom)}" maxlength="40" aria-label="Nom du modèle" data-nom-modele>`
      + `<span class="cat-compte">${esc(resume(m))}</span>`
      + `<button type="button" class="icone-btn icone-btn--danger" data-retirer-modele aria-label="Supprimer le modèle ${esc(m.nom)}">${icone('corbeille')}</button></div>`).join('')
      : '<p class="av-vide">Aucun modèle pour l\'instant.</p>';
  }
  $('#modeles-edit').addEventListener('click', e => {
    const l = e.target.closest('.cat-ligne--modele');
    if (l && e.target.closest('[data-retirer-modele]')) { brouillonModeles.splice(Number(l.dataset.i), 1); rendreModelesEdit(); }
  });
  $('#modeles-edit').addEventListener('input', e => {
    const l = e.target.closest('.cat-ligne--modele');
    if (l && e.target.matches('[data-nom-modele]')) brouillonModeles[Number(l.dataset.i)].nom = e.target.value;
  });
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
      ...reservation(),
      actif: $('#r-resa-actif').checked,
      plages: lirePlages(),
      duree: Number($('#r-resa-duree').value),
      pause: Number($('#r-resa-pause').value),
      delai: Number($('#r-resa-delai').value),
      horizon: Number($('#r-resa-horizon').value),
      feries: $('#r-resa-feries').checked,
      message: $('#r-resa-message').value.trim(),
    };
    const semaine = { ...semaineActuelle(), actif: $('#r-semaine').checked, heure: $('#r-semaine-heure').value };
    reglages.close();
    const ops = [];
    if (JSON.stringify(propres) !== JSON.stringify(categories())) ops.push({ type: 'categories', categories: propres });
    // Modèles renommés ou supprimés
    const gardes = new Map(brouillonModeles.map(m => [m.id, m]));
    modeles().forEach(m => {
      const b = gardes.get(m.id);
      if (!b) ops.push({ type: 'supprimerModele', id: m.id, titre: m.nom });
      else if (b.nom.trim() && b.nom.trim() !== m.nom) ops.push({ type: 'modele', modele: { ...m, nom: b.nom.trim() } });
    });
    const changes = {};
    if (JSON.stringify(resume) !== JSON.stringify(resumeActuel())) changes.resume = resume;
    if (JSON.stringify(semaine) !== JSON.stringify(semaineActuelle())) changes.resumeSemaine = semaine;
    if ($('#r-feries').checked !== feriesActifs()) changes.feries = $('#r-feries').checked;
    if (JSON.stringify(t) !== JSON.stringify(travail())) changes.travail = t;
    if (JSON.stringify(resa) !== JSON.stringify(reservation())) changes.reservation = resa;
    const fa = { ...facturation() };
    CHAMPS_FACTURATION.forEach(k => { fa[k] = $(`#r-f-${k}`).value.trim(); });
    fa.siret = fa.siret.replace(/\s+/g, ' ');
    fa.tva = $('#r-f-tva').checked;
    fa.taux = Number($('#r-f-taux').value) || 20;
    fa.delai = Number($('#r-f-delai').value) || 0;
    const prefixe = $('#r-f-prefixe').value.trim().toUpperCase();
    fa.prefixe = /^[A-Z0-9]{1,6}$/.test(prefixe) && prefixe !== 'AV' ? prefixe : 'F';
    if (JSON.stringify(fa) !== JSON.stringify(facturation())) changes.facturation = fa;
    if (Object.keys(changes).length) ops.push({ type: 'reglages', reglages: changes });
    if (ops.length) {
      operation(ops);
      toast('Réglages enregistrés');
    }
  });

  /* ---------- Clients ---------- */
  const clientsDlg = $('#clients');
  let clientsEtat = { vue: 'liste', id: null };
  const dureeInst = i => (i.r.journee ? 0 : Math.max(0, instantFin(i.fin, i.r.fin) - instantDebut(i.date, i.r.debut)));
  const heuresTxt = m => { const h = Math.floor(m / 60); const mm = Math.round(m % 60); return h ? `${h} h${mm ? ` ${pad(mm)}` : ''}` : `${mm} min`; };
  const euros = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  // Compte dans les heures facturées : réglé dans la fiche (par défaut oui, sauf les appels réservés en ligne)
  const facturable = r => (r.facturable !== undefined ? !!r.facturable : r.source !== 'reservation');
  function creerClient(valeurs) {
    const instant = new Date().toISOString();
    const c = { id: nouvelId(), nom: String(valeurs.nom || 'Client').trim().slice(0, 80), discord: '', email: '', serveur: '', tarif: null, notes: '', ...valeurs, cree: instant, modifie: instant };
    c.nom = String(c.nom).trim().slice(0, 80) || 'Client';
    operation({ type: 'client', client: c, nouveau: true });
    toast(`Fiche client « ${c.nom} » créée`, { texte: 'Annuler', faire: () => operation({ type: 'supprimerClient', id: c.id, titre: c.nom, sansCorbeille: true }) });
    return c;
  }
  // Rendez-vous d'un client : reliés par la fiche, ou avec son nom dans « Avec » (rendez-vous plus anciens)
  function rdvDuClient(c, de, a) {
    const nom = sansAccents(c.nom).trim();
    return instances(de, a, true).filter(i => i.r.client === c.id || (!i.r.client && sansAccents(i.r.avec).trim() === nom));
  }
  function ouvrirClients(id) {
    clientsEtat = { vue: id ? 'fiche' : 'liste', id: id || null };
    rendreClients();
    if (!clientsDlg.open) clientsDlg.showModal();
  }
  function rendreClients() {
    const corps = $('#clients-corps');
    if (clientsEtat.vue === 'liste') {
      $('#clients-titre').textContent = 'Clients';
      corps.innerHTML = `<div class="cl-barre"><label class="b-recherche cl-recherche">${icone('loupe')}<input type="search" id="cl-q" placeholder="Rechercher un client" aria-label="Rechercher un client" autocomplete="off"></label>`
        + `<button type="button" class="btn btn--primaire btn--petit" data-cl="nouveau">${icone('plus')}Nouveau client</button></div><ul class="cl-liste" id="cl-liste"></ul>`;
      rendreListeClients('');
      return;
    }
    const c = clientDe(clientsEtat.id) || { id: null, nom: '', discord: '', email: '', serveur: '', tarif: null, notes: '', adresse: '', siren: '' };
    $('#clients-titre').textContent = c.id ? 'Fiche client' : 'Nouveau client';
    const auj = aujourdhui();
    const maint = instantMaintenant();
    const tous = c.id ? rdvDuClient(c, decale(auj, -1825), decale(auj, 730)) : [];
    const passes = tous.filter(i => i.r.statut !== 'annule' && instantFin(i.fin, i.r.journee ? '00:00' : i.r.fin) <= maint);
    const aVenir = tous.filter(i => i.r.statut !== 'annule' && !passes.includes(i));
    const mois = auj.slice(0, 7);
    const duMois = passes.filter(i => i.date.slice(0, 7) === mois);
    const tarif = Number(c.tarif) > 0 ? Number(c.tarif) : 0;
    const montantMois = tarif * duMois.filter(i => facturable(i.r)).reduce((t, i) => t + dureeInst(i), 0) / 60;
    const stats = c.id ? `<div class="cartes">`
      + `<div class="carte"><small>Rendez-vous</small><b>${passes.length}</b><span>${aVenir.length ? `${aVenir.length} à venir` : 'aucun à venir'}</span></div>`
      + `<div class="carte"><small>Heures au total</small><b>${heuresTxt(passes.reduce((t, i) => t + dureeInst(i), 0))}</b><span>depuis le début</span></div>`
      + `<div class="carte"><small>Ce mois-ci</small><b>${heuresTxt(duMois.reduce((t, i) => t + dureeInst(i), 0))}</b><span>${tarif ? `${esc(euros(montantMois))} à facturer` : 'sans tarif'}</span></div></div>` : '';
    const lignes = (titre, liste, vide) => `<h3 class="cl-h">${titre}</h3>${liste.length ? `<div class="l-items">${liste.map(ligne).join('')}</div>` : `<p class="av-vide">${vide}</p>`}`;
    corps.innerHTML = `<form class="cl-fiche" id="cl-form" novalidate>`
      + `<button type="button" class="btn btn--lien btn--petit cl-retour" data-cl="retour">${icone('gauche')}Tous les clients</button>`
      + `<input class="f-nom" name="nom" value="${esc(c.nom)}" placeholder="Nom du client" aria-label="Nom du client" maxlength="80" autocomplete="off" required>`
      + `<div class="f-ligne">`
      + `<label class="champ"><span>Pseudo Discord</span><input name="discord" value="${esc(c.discord)}" maxlength="60" autocomplete="off"></label>`
      + `<label class="champ"><span>E-mail</span><input name="email" type="email" value="${esc(c.email)}" maxlength="120" autocomplete="off"></label>`
      + `<label class="champ"><span>Serveur Discord</span><input name="serveur" value="${esc(c.serveur)}" maxlength="120" placeholder="Nom ou lien d'invitation" autocomplete="off"></label>`
      + `<label class="champ"><span>Tarif horaire (€)</span><input name="tarif" type="number" min="0" step="0.5" inputmode="decimal" value="${tarif || ''}" placeholder="Ex. 40"></label>`
      + `</div>`
      + `<div class="cl-adresse"><label class="champ"><span>Adresse (pour les factures)</span><textarea name="adresse" rows="2" maxlength="300" placeholder="Rue, code postal, ville">${esc(c.adresse || '')}</textarea></label>`
      + `<label class="champ"><span>SIREN (si professionnel)</span><input name="siren" value="${esc(c.siren || '')}" maxlength="20" inputmode="numeric" autocomplete="off"></label></div>`
      + `<label class="champ"><span>Notes (privées)</span><textarea name="notes" rows="3" maxlength="4000" placeholder="Besoins, projets, infos utiles…">${esc(c.notes)}</textarea></label>`
      + blocEspaceClient(c)
      + `<p class="f-erreur" id="cl-erreur" role="alert"></p>`
      + `<div class="cl-actions">${c.id ? `<button type="button" class="icone-btn icone-btn--danger" data-cl="supprimer" aria-label="Supprimer le client" title="Supprimer le client">${icone('corbeille')}</button>`
        + `<button type="button" class="btn btn--ghost btn--petit" data-cl="rdv">${icone('plus')}Nouveau rendez-vous</button>` : ''}<span class="espace"></span>`
      + `<button type="submit" class="btn btn--primaire">Enregistrer</button></div></form>`
      + (c.id ? stats + blocFacturesClient(c) + lignes('À venir', aVenir.slice(0, 20), 'Aucun rendez-vous prévu.') + lignes('Historique', passes.slice(-40).reverse(), 'Pas encore de rendez-vous passé.') : '');
  }
  // Espace client : lien secret, projet en cours (étapes), message affiché au client
  const nouvelleCle = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function lienEspaceHtml(c) {
    const lien = lienEspace(c);
    return lien ? `<div class="cl-lien"><input readonly value="${esc(lien)}" aria-label="Lien de l'espace client" data-cl-lien>`
      + `<button type="button" class="btn btn--ghost btn--petit" data-cl="copier-lien">${icone('copie')}Copier</button>`
      + `<a class="btn btn--ghost btn--petit" href="${esc(lien)}" target="_blank" rel="noopener">Ouvrir</a></div>`
      + `<p class="r-aide">Toute personne qui a ce lien voit cet espace. <button type="button" class="btn--lien lien-tab" data-cl="nouveau-lien">Changer le lien</button> · <button type="button" class="btn--lien lien-tab" data-cl="sans-lien">Désactiver</button></p>`
      : `<button type="button" class="btn btn--ghost btn--petit" data-cl="creer-lien">${icone('lien')}Créer le lien privé</button>`;
  }
  function blocEspaceClient(c) {
    if (!c.id) return `<p class="r-aide">Enregistre la fiche pour créer l'espace client (rendez-vous, avancement du projet, factures).</p>`;
    const etape = e => `<li class="t-item${e.fait ? ' is-fait' : ''}"><label class="t-coche"><input type="checkbox" data-etape-fait${e.fait ? ' checked' : ''} aria-label="Étape faite"><span class="t-case" aria-hidden="true"></span></label>`
      + `<input class="cl-etape" data-etape value="${esc(e.t)}" maxlength="200" aria-label="Étape"><button type="button" class="t-suppr" data-etape-suppr aria-label="Retirer l'étape">${icone('fermer')}</button></li>`;
    return `<section class="cl-espace"><h3 class="cl-h">${icone('espace')}Espace client</h3>`
      + `<p class="r-aide">Une page privée où ${esc(c.nom)} voit ses rendez-vous, l'avancement du projet et ses factures émises. Jamais tes notes ni rien d'autre.</p>`
      + `<div id="cl-lien-zone">${lienEspaceHtml(c)}</div>`
      + `<label class="champ"><span>Projet en cours</span><input name="projet" value="${esc(c.projet || '')}" maxlength="120" placeholder="Ex. Création du serveur Discord" autocomplete="off"></label>`
      + `<ul class="t-liste cl-etapes" id="cl-etapes">${(c.etapes || []).map(etape).join('')}</ul>`
      + `<input class="cl-etape-ajout" id="cl-etape-ajout" maxlength="200" placeholder="Ajouter une étape… (Entrée)" aria-label="Ajouter une étape" autocomplete="off">`
      + `<label class="champ"><span>Message pour ${esc(c.nom)}</span><textarea name="messageEspace" rows="2" maxlength="1000" placeholder="Ex. Le serveur est prêt, il ne reste que les bots à configurer !">${esc(c.messageEspace || '')}</textarea></label></section>`;
  }
  function blocFacturesClient(c) {
    const liste = factures().filter(f => f.client === c.id).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return `<div class="cl-h-ligne"><h3 class="cl-h">Factures</h3><button type="button" class="btn btn--ghost btn--petit" data-cl="facture">${icone('plus')}Nouvelle facture</button></div>`
      + (liste.length ? `<ul class="fa-liste">${liste.slice(0, 12).map(ligneFacture).join('')}</ul>` : '<p class="av-vide">Pas encore de facture.</p>');
  }
  function rendreListeClients(q) {
    const t = sansAccents(q);
    const auj = aujourdhui();
    const liste = clients().filter(c => !t || sansAccents(`${c.nom} ${c.discord} ${c.email} ${c.serveur}`).includes(t))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    $('#cl-liste').innerHTML = liste.length ? liste.map(c => {
      const prochain = rdvDuClient(c, auj, decale(auj, 365)).find(i => i.r.statut !== 'annule' && pasFini(i));
      const sous = [c.discord, c.serveur, c.email].filter(Boolean).map(esc).join(' · ') || 'Aucune coordonnée';
      return `<li><button type="button" class="cl-ligne" data-cl-ouvrir="${esc(c.id)}"><span class="cl-av">${esc(c.nom.charAt(0).toUpperCase())}</span>`
        + `<span class="cl-txt"><b>${esc(c.nom)}</b><small>${sous}</small></span>`
        + `<span class="cl-prochain">${prochain ? `Prochain : ${esc(quand(prochain.date))}${prochain.r.journee ? '' : ` ${prochain.r.debut}`}` : ''}</span></button></li>`;
    }).join('') : `<li class="vide"><span class="vide-icone">${icone('clients')}</span><h3>${t ? 'Aucun client trouvé' : 'Pas encore de client'}</h3><p>${t ? 'Essaie un autre nom.' : 'Crée une fiche pour retrouver les coordonnées, les notes et l\'historique de chaque client.'}</p></li>`;
  }
  clientsDlg.addEventListener('input', e => { if (e.target.id === 'cl-q') rendreListeClients(e.target.value); });
  clientsDlg.addEventListener('change', e => { if (e.target.matches('[data-etape-fait]')) e.target.closest('li').classList.toggle('is-fait', e.target.checked); });
  clientsDlg.addEventListener('keydown', e => {
    if (e.target.id !== 'cl-etape-ajout' || e.key !== 'Enter') return;
    e.preventDefault();
    const t = e.target.value.trim();
    if (!t) return;
    $('#cl-etapes').insertAdjacentHTML('beforeend', `<li class="t-item"><label class="t-coche"><input type="checkbox" data-etape-fait aria-label="Étape faite"><span class="t-case" aria-hidden="true"></span></label><input class="cl-etape" data-etape value="${esc(t)}" maxlength="200" aria-label="Étape"><button type="button" class="t-suppr" data-etape-suppr aria-label="Retirer l'étape">${icone('fermer')}</button></li>`);
    e.target.value = '';
  });
  clientsDlg.addEventListener('click', async e => {
    const ouvrir = e.target.closest('[data-cl-ouvrir]');
    if (ouvrir) { clientsEtat = { vue: 'fiche', id: ouvrir.dataset.clOuvrir }; rendreClients(); return; }
    const fa = e.target.closest('[data-fa-ouvrir]');
    if (fa) {
      const f = factures().find(x => x.id === fa.dataset.faOuvrir);
      clientsDlg.close();
      if (f) ouvrirFactures(f.statut === 'brouillon' ? 'edition' : 'voir', f.id);
      return;
    }
    if (e.target.closest('[data-etape-suppr]')) { e.target.closest('li').remove(); return; }
    const ev = e.target.closest('.l-ev');
    if (ev) { ouvrirFiche({ id: ev.dataset.id, date: ev.dataset.date }); return; }
    const b = e.target.closest('[data-cl]');
    if (!b) return;
    const action = b.dataset.cl;
    if (action === 'nouveau') { clientsEtat = { vue: 'fiche', id: null }; rendreClients(); $('#cl-form [name="nom"]').focus(); }
    else if (action === 'retour') { clientsEtat = { vue: 'liste', id: null }; rendreClients(); }
    else if (action === 'supprimer') {
      const c = clientDe(clientsEtat.id);
      if (!c) return;
      operation({ type: 'supprimerClient', id: c.id, titre: c.nom });
      toast(`Client « ${c.nom} » mis à la corbeille`, { texte: 'Annuler', faire: () => operation({ type: 'client', client: c }) });
      clientsEtat = { vue: 'liste', id: null };
      rendreClients();
    } else if (action === 'creer-lien' || action === 'nouveau-lien') {
      const c = clientDe(clientsEtat.id);
      if (!c) return;
      if (action === 'nouveau-lien' && !(await confirmer("Changer le lien de l'espace client ?", `L'ancien lien ne marchera plus : il faudra envoyer le nouveau à ${c.nom}.`, 'Changer le lien'))) return;
      operation({ type: 'client', client: { ...c, espace: { cle: nouvelleCle(), cree: new Date().toISOString() } } });
      $('#cl-lien-zone').innerHTML = lienEspaceHtml(clientDe(c.id));
      toast(action === 'creer-lien' ? 'Espace client créé : copie le lien et envoie-le' : 'Nouveau lien créé');
    } else if (action === 'sans-lien') {
      const c = clientDe(clientsEtat.id);
      if (!c) return;
      operation({ type: 'client', client: { ...c, espace: null } });
      $('#cl-lien-zone').innerHTML = lienEspaceHtml(clientDe(c.id));
      toast("Espace client désactivé : le lien ne marche plus", { texte: 'Annuler', faire: () => { operation({ type: 'client', client: { ...clientDe(c.id), espace: c.espace } }); if (clientsDlg.open && $('#cl-lien-zone')) $('#cl-lien-zone').innerHTML = lienEspaceHtml(clientDe(c.id)); } });
    } else if (action === 'copier-lien') {
      toast((await copier($('[data-cl-lien]').value)) ? "Lien de l'espace client copié" : 'Copie impossible.');
    } else if (action === 'facture') {
      const c = clientDe(clientsEtat.id);
      clientsDlg.close();
      nouvelleFacture({ client: c ? c.id : '' });
    } else if (action === 'rdv') {
      const c = clientDe(clientsEtat.id);
      clientsDlg.close();
      ouvrirFiche({ nouveau: { date: etat.curseur } });
      if (c) { champs.avec.value = c.nom; majFiche(); }
    }
  });
  clientsDlg.addEventListener('submit', e => {
    if (e.target.id !== 'cl-form') return;
    e.preventDefault();
    const f = e.target.elements;
    const nom = f.nom.value.trim();
    if (!nom) { $('#cl-erreur').textContent = 'Donne un nom au client.'; f.nom.focus(); return; }
    const doublon = clients().find(x => x.id !== clientsEtat.id && sansAccents(x.nom).trim() === sansAccents(nom));
    if (doublon) { $('#cl-erreur').textContent = `Il y a déjà une fiche « ${doublon.nom} ».`; f.nom.focus(); return; }
    const avant = clientDe(clientsEtat.id);
    const instant = new Date().toISOString();
    const tarif = parseFloat(String(f.tarif.value).replace(',', '.'));
    const c = {
      ...(avant || {}), id: avant ? avant.id : nouvelId(), nom,
      discord: f.discord.value.trim(), email: f.email.value.trim(), serveur: f.serveur.value.trim(),
      tarif: Number.isFinite(tarif) && tarif > 0 ? tarif : null, notes: f.notes.value.trim(),
      adresse: f.adresse.value.trim(), siren: f.siren.value.trim(),
      cree: avant ? avant.cree : instant, modifie: instant,
    };
    if (f.projet) {
      c.projet = f.projet.value.trim();
      c.messageEspace = f.messageEspace.value.trim();
      c.etapes = $$('#cl-etapes li').map(li => ({ t: $('[data-etape]', li).value.trim(), fait: $('[data-etape-fait]', li).checked })).filter(x => x.t);
      const restant = $('#cl-etape-ajout').value.trim();
      if (restant) c.etapes.push({ t: restant, fait: false });
    }
    operation({ type: 'client', client: c, nouveau: !avant });
    toast(avant ? 'Fiche client enregistrée' : `Fiche client « ${nom} » créée`);
    clientsEtat = { vue: 'fiche', id: c.id };
    rendreClients();
    if (fiche.open) { $('#clients-noms').innerHTML = clients().map(x => `<option value="${esc(x.nom)}"></option>`).join(''); majFiche(); }
  });

  /* ---------- Heures et facturation ---------- */
  const factuDlg = $('#factu');
  let factuMois = aujourdhui().slice(0, 7);
  function ouvrirFactu() {
    factuMois = etat.curseur.slice(0, 7);
    rendreFactu();
    factuDlg.showModal();
  }
  // Rendez-vous confirmés avec un horaire, qui commencent dans le mois
  function lignesDuMois(mois) {
    const de = `${mois}-01`;
    const a = iso(new Date(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0));
    const maint = instantMaintenant();
    return instances(de, a, true).filter(i => i.date >= de && !i.r.journee && (i.r.statut || 'confirme') === 'confirme').map(i => {
      const c = clientDe(i.r.client);
      const duree = dureeInst(i);
      const compte = !!c && facturable(i.r);
      const tarif = compte && Number(c.tarif) > 0 ? Number(c.tarif) : 0;
      return { i, c, duree, realise: instantFin(i.fin, i.r.fin) <= maint, compte, tarif, montant: tarif * duree / 60 };
    });
  }
  function rendreFactu() {
    const lignes = lignesDuMois(factuMois);
    const somme = (l, f) => l.reduce((t, x) => t + f(x), 0);
    const realise = lignes.filter(x => x.realise);
    const [a, m] = factuMois.split('-').map(Number);
    const titreMois = maj1(fmt(new Date(a, m - 1, 1), { month: 'long', year: 'numeric' }));
    // Par client (les rendez-vous sans fiche client à part)
    const parClient = new Map();
    lignes.forEach(x => {
      const cle = x.c ? x.c.id : '';
      if (!parClient.has(cle)) parClient.set(cle, { c: x.c, lignes: [] });
      parClient.get(cle).lignes.push(x);
    });
    const clientsTries = [...parClient.values()].sort((p, q) => (p.c ? 0 : 1) - (q.c ? 0 : 1) || somme(q.lignes, x => x.duree) - somme(p.lignes, x => x.duree));
    const tableClients = clientsTries.length ? `<div class="tab-cadre"><table class="tab"><thead><tr><th>Client</th><th>Rdv</th><th>Réalisé</th><th>Prévu</th><th>Tarif</th><th>À facturer</th><th></th></tr></thead><tbody>`
      + clientsTries.map(g => {
        const r = g.lignes.filter(x => x.realise);
        const montant = somme(r.filter(x => x.compte), x => x.montant);
        return `<tr><td>${g.c ? `<button type="button" class="lien-tab" data-factu-client="${esc(g.c.id)}">${esc(g.c.nom)}</button>` : '<span class="pale">Sans fiche client</span>'}</td>`
          + `<td>${g.lignes.length}</td><td>${heuresTxt(somme(r, x => x.duree))}</td><td>${heuresTxt(somme(g.lignes, x => x.duree))}</td>`
          + `<td>${g.c && Number(g.c.tarif) > 0 ? `${esc(euros(Number(g.c.tarif)))}/h` : '—'}</td><td><b>${montant ? esc(euros(montant)) : '—'}</b></td>`
          + `<td>${g.c ? `<span class="tab-boutons"><button type="button" class="icone-btn" data-factu-copier="${esc(g.c.id)}" aria-label="Copier le récapitulatif de ${esc(g.c.nom)}" title="Copier le récapitulatif">${icone('copie')}</button>`
            + `<button type="button" class="icone-btn" data-factu-facturer="${esc(g.c.id)}" aria-label="Facturer ${esc(g.c.nom)}" title="Créer la facture du mois">${icone('facture')}</button></span>` : ''}</td></tr>`;
      }).join('') + '</tbody></table></div>' : '';
    // Par catégorie
    const parCat = new Map();
    lignes.forEach(x => parCat.set(x.i.r.categorie, (parCat.get(x.i.r.categorie) || 0) + x.duree));
    const totalCat = somme([...parCat.values()], x => x) || 1;
    const tableCats = [...parCat.entries()].sort((p, q) => q[1] - p[1]).map(([id, duree]) => {
      const c = categorie(id);
      return `<li style="--c:${couleurSure(c.couleur)}"><span class="fc-nom">${esc(c.nom)}</span><span class="fc-barre"><i style="width:${Math.round(duree / totalCat * 100)}%"></i></span><b>${heuresTxt(duree)}</b></li>`;
    }).join('');
    $('#factu-corps').innerHTML = `<div class="fa-nav"><button type="button" class="icone-btn" data-factu-mois="-1" aria-label="Mois précédent">${icone('gauche')}</button>`
      + `<b>${esc(titreMois)}</b><button type="button" class="icone-btn" data-factu-mois="1" aria-label="Mois suivant">${icone('droite')}</button>`
      + `${factuMois !== aujourdhui().slice(0, 7) ? '<button type="button" class="btn btn--ghost btn--petit" data-factu-mois="0">Ce mois-ci</button>' : ''}</div>`
      + `<div class="cartes">`
      + `<div class="carte"><small>Heures réalisées</small><b>${heuresTxt(somme(realise, x => x.duree))}</b><span>${realise.length} rendez-vous</span></div>`
      + `<div class="carte"><small>Prévu sur le mois</small><b>${heuresTxt(somme(lignes, x => x.duree))}</b><span>${lignes.length} rendez-vous</span></div>`
      + `<div class="carte carte--or"><small>À facturer</small><b>${esc(euros(somme(realise.filter(x => x.compte), x => x.montant)))}</b><span>${esc(euros(somme(lignes.filter(x => x.compte), x => x.montant)))} prévus</span></div></div>`
      + (lignes.length ? `<h3 class="cl-h">Par client</h3>${tableClients}<h3 class="cl-h">Par catégorie</h3><ul class="fc-liste">${tableCats}</ul>`
        : `<div class="vide"><span class="vide-icone">${icone('euro')}</span><h3>Rien ce mois-ci</h3><p>Les rendez-vous confirmés avec un horaire apparaîtront ici. Relie-les à une fiche client avec un tarif pour calculer le montant.</p></div>`)
      + `<p class="r-aide">Sont comptés les rendez-vous confirmés avec un horaire. Le montant utilise le tarif horaire de la fiche client ; les appels réservés en ligne ne sont pas facturés, sauf si tu l'indiques dans leur fiche.</p>`
      + `<div class="r-boutons"><button type="button" class="btn btn--ghost btn--petit" data-factu-csv${lignes.length ? '' : ' disabled'}>${icone('telecharger')}Exporter le mois (tableur .csv)</button></div>`;
  }
  function recapClient(c, mois) {
    const lignes = lignesDuMois(mois).filter(x => x.c && x.c.id === c.id && x.realise && x.compte);
    const [a, m] = mois.split('-').map(Number);
    const titre = fmt(new Date(a, m - 1, 1), { month: 'long', year: 'numeric' });
    const total = lignes.reduce((t, x) => t + x.duree, 0);
    const tarif = Number(c.tarif) > 0 ? Number(c.tarif) : 0;
    return [`Récapitulatif ${titre} — ${c.nom}`, '',
      ...lignes.map(x => `• ${fmt(x.i.date, { day: '2-digit', month: '2-digit' })} ${x.i.r.debut}–${x.i.r.fin} · ${x.i.r.titre} (${heuresTxt(x.duree)})`),
      '', `Total : ${heuresTxt(total)}${tarif ? ` × ${euros(tarif)}/h = ${euros(tarif * total / 60)}` : ''}`].join('\n');
  }
  function csvDuMois(mois) {
    const nb = n => String(Math.round(n * 100) / 100).replace('.', ',');
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lignes = lignesDuMois(mois).map(x => [
      fmt(x.i.date, { day: '2-digit', month: '2-digit', year: 'numeric' }), x.i.r.debut, x.i.r.fin, nb(x.duree / 60),
      x.c ? x.c.nom : avecDe(x.i.r), x.i.r.titre, categorie(x.i.r.categorie).nom, x.realise ? 'oui' : 'non',
      x.compte ? 'oui' : 'non', x.tarif ? nb(x.tarif) : '', x.compte && x.realise && x.montant ? nb(x.montant) : '',
    ].map(cell).join(';'));
    const tete = ['Date', 'Début', 'Fin', 'Durée (h)', 'Client', 'Titre', 'Catégorie', 'Réalisé', 'Facturable', 'Tarif (€/h)', 'Montant (€)'].map(cell).join(';');
    return '﻿' + [tete, ...lignes].join('\r\n') + '\r\n';
  }
  factuDlg.addEventListener('click', async e => {
    const nav = e.target.closest('[data-factu-mois]');
    if (nav) {
      const n = Number(nav.dataset.factuMois);
      if (!n) factuMois = aujourdhui().slice(0, 7);
      else { const [a, m] = factuMois.split('-').map(Number); factuMois = iso(new Date(a, m - 1 + n, 1)).slice(0, 7); }
      rendreFactu();
      return;
    }
    const cl = e.target.closest('[data-factu-client]');
    if (cl) { ouvrirClients(cl.dataset.factuClient); return; }
    const fa = e.target.closest('[data-factu-facturer]');
    if (fa) { factuDlg.close(); nouvelleFacture({ client: fa.dataset.factuFacturer, mois: factuMois }); return; }
    const cp = e.target.closest('[data-factu-copier]');
    if (cp) {
      const c = clientDe(cp.dataset.factuCopier);
      if (c) toast((await copier(recapClient(c, factuMois))) ? `Récapitulatif de ${c.nom} copié` : 'Copie impossible.');
      return;
    }
    if (e.target.closest('[data-factu-csv]')) telecharger(`heures-${factuMois}.csv`, csvDuMois(factuMois), 'text/csv;charset=utf-8');
  });

  /* ---------- Factures ---------- */
  const facturesDlg = $('#factures');
  let facturesEtat = { vue: 'liste', id: null, filtre: 'tout' };
  let brouillonFacture = null; // facture en cours d'écriture (copie, enregistrée avec « Enregistrer » ou « Émettre »)
  const F = () => window.Facture;
  const nomClientFacture = f => (clientDe(f.client) || {}).nom || (f.acheteur || {}).nom || f.clientNom || 'Sans client';
  const totalFacture = f => F().totaux(f).ttc;
  const prefixeFacture = () => { const p = String(facturation().prefixe || '').toUpperCase(); return /^[A-Z0-9]{1,6}$/.test(p) && p !== 'AV' ? p : 'F'; };
  // Statut affiché : « En retard » après l'échéance ; un avoir payé = remboursé
  function statutFacture(f) {
    if (f.type === 'avoir') return f.paiement ? 'rembourse' : 'avoir';
    if (f.statut === 'emise' && DATE.test(f.echeance) && f.echeance < aujourdhui()) return 'retard';
    return STATUTS_FACTURE[f.statut] ? f.statut : 'brouillon';
  }
  const pastilleFacture = f => { const [t, c] = STATUTS_FACTURE[statutFacture(f)]; return `<span class="fa-statut" style="--c:${c}">${esc(t)}</span>`; };
  // Chiffre d'affaires encaissé : factures payées (et avoirs remboursés, en moins) à la date du paiement
  const encaisse = (de, a) => factures().filter(f => f.numero && f.paiement && DATE.test(f.paiement.date) && f.paiement.date >= de && f.paiement.date <= a).reduce((t, f) => t + totalFacture(f), 0);
  const lienEspace = c => (c && c.espace && c.espace.cle && c.espace.actif !== false ? `${new URL('../espace/', location.href).href}#${c.espace.cle}` : '');
  const reglagesFacturationOk = () => { const r = facturation(); return !!((r.identite || r.nom) && r.adresse.trim() && r.siret.trim()); };
  // Facture prête pour l'aperçu ou le PDF : un brouillon prend les réglages et la fiche client actuels
  function factureComplete(f) {
    if (f.numero) return { ...f, refNumero: f.ref ? (factures().find(x => x.id === f.ref) || {}).numero : null };
    const reg = facturation();
    const c = clientDe(f.client) || {};
    return {
      ...f, tva: reg.tva ? Number(reg.taux) || 20 : null, echeance: decale(f.date || aujourdhui(), Number(reg.delai) || 0),
      vendeur: { ...reg, tvaNum: reg.tva ? reg.tvaNum : '' }, acheteur: { nom: c.nom || '', adresse: c.adresse || '', email: c.email || '', siren: c.siren || '' },
    };
  }
  const moisTexte = mois => { const [a, m] = mois.split('-').map(Number); return fmt(new Date(a, m - 1, 1), { month: 'long', year: 'numeric' }); };
  // Une ligne par rendez-vous réalisé et facturable du mois (durée en heures, tarif de la fiche)
  function lignesHeures(c, mois) {
    return lignesDuMois(mois).filter(x => x.c && x.c.id === c.id && x.realise && x.compte)
      .map(x => ({ desc: `${x.i.r.titre} — ${fmt(x.i.date, { day: 'numeric', month: 'short' })}`, qte: Math.round(x.duree / 60 * 100) / 100, unite: 'h', pu: Number(c.tarif) || 0 }));
  }

  function ouvrirFactures(vue = 'liste', id = null) {
    facturesEtat = { ...facturesEtat, vue, id };
    if (vue === 'edition') brouillonFacture = clone(factures().find(f => f.id === id));
    rendreFactures();
    if (!facturesDlg.open) facturesDlg.showModal();
    $('#factures-corps').scrollTop = 0;
  }
  // Nouveau brouillon, avec les heures d'un mois si on part de « Heures »
  function nouvelleFacture({ client = '', mois = '' } = {}) {
    const c = clientDe(client);
    brouillonFacture = { id: nouvelId(), type: 'facture', client: c ? c.id : '', clientNom: c ? c.nom : '', date: aujourdhui(), objet: '', lignes: [], notes: '', statut: 'brouillon', nouveau: true };
    if (c && mois) {
      brouillonFacture.lignes = lignesHeures(c, mois);
      brouillonFacture.objet = `Accompagnement — ${moisTexte(mois)}`;
    }
    if (!brouillonFacture.lignes.length) brouillonFacture.lignes.push({ desc: '', qte: 1, unite: 'forfait', pu: 0 });
    facturesEtat = { ...facturesEtat, vue: 'edition', id: brouillonFacture.id };
    rendreFactures();
    if (!facturesDlg.open) facturesDlg.showModal();
    $('#factures-corps').scrollTop = 0;
  }

  function rendreFactures() {
    const corps = $('#factures-corps');
    const f = factures().find(x => x.id === facturesEtat.id);
    if (facturesEtat.vue === 'edition' && brouillonFacture) { rendreEditionFacture(corps); return; }
    if (facturesEtat.vue === 'voir' && f) { rendreVoirFacture(corps, f); return; }
    facturesEtat.vue = 'liste';
    $('#factures-titre').textContent = 'Factures';
    const auj = aujourdhui();
    const annee = auj.slice(0, 4);
    const mois = auj.slice(0, 7);
    const toutes = factures().slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.numero || '~').localeCompare(String(a.numero || '~')));
    const aEncaisser = toutes.filter(x => x.type !== 'avoir' && x.statut === 'emise');
    const enRetard = aEncaisser.filter(x => statutFacture(x) === 'retard');
    const trimestres = [1, 2, 3, 4].map(t => encaisse(`${annee}-${pad(t * 3 - 2)}-01`, `${annee}-${pad(t * 3)}-31`));
    const filtres = { tout: () => true, brouillon: x => x.statut === 'brouillon', encaisser: x => x.statut === 'emise' && x.type !== 'avoir', payee: x => !!x.paiement };
    const liste = toutes.filter(filtres[facturesEtat.filtre] || filtres.tout);
    corps.innerHTML = (reglagesFacturationOk() ? '' : `<div class="fa-alerte">${icone('info')}<span>Avant ta première facture, complète tes informations (nom, adresse, SIRET) : elles doivent apparaître sur chaque facture.</span><button type="button" class="btn btn--ghost btn--petit" data-fa="reglages">Compléter</button></div>`)
      + `<div class="cartes">`
      + `<div class="carte carte--or"><small>À encaisser</small><b>${esc(euros(aEncaisser.reduce((t, x) => t + totalFacture(x), 0)))}</b><span>${aEncaisser.length} facture${aEncaisser.length > 1 ? 's' : ''}${enRetard.length ? ` · <em class="fa-retard">${enRetard.length} en retard</em>` : ''}</span></div>`
      + `<div class="carte"><small>Encaissé en ${esc(fmt(auj, { month: 'long' }))}</small><b>${esc(euros(encaisse(`${mois}-01`, `${mois}-31`)))}</b><span>chiffre d'affaires du mois</span></div>`
      + `<div class="carte"><small>Encaissé en ${annee}</small><b>${esc(euros(trimestres.reduce((t, x) => t + x, 0)))}</b><span class="fa-trim">${trimestres.map((x, k) => `T${k + 1}&nbsp;${esc(euros(x))}`).join(' · ')}</span></div></div>`
      + `<div class="fa-barre"><div class="fa-filtres">${[['tout', 'Toutes'], ['brouillon', 'Brouillons'], ['encaisser', 'À encaisser'], ['payee', 'Payées']].map(([k, t]) => `<label class="choix" style="--c:#e8b46a"><input type="radio" name="fa-filtre" value="${k}"${facturesEtat.filtre === k ? ' checked' : ''}><span>${t}</span></label>`).join('')}</div>`
      + `<button type="button" class="btn btn--primaire btn--petit" data-fa="nouvelle">${icone('plus')}Nouvelle facture</button></div>`
      + (liste.length ? `<ul class="fa-liste">${liste.map(ligneFacture).join('')}</ul>`
        : `<div class="vide"><span class="vide-icone">${icone('facture')}</span><h3>${toutes.length ? 'Aucune facture ici' : 'Pas encore de facture'}</h3><p>${toutes.length ? 'Essaie un autre filtre.' : 'Crée une facture pour un client, ou pars de ses heures du mois dans « Heures ».'}</p></div>`)
      + `<p class="r-aide">Une facture émise reçoit le numéro suivant (${esc(prefixeFacture())}-${annee}-001, -002…) et ne se modifie plus : en cas d'erreur, annule-la avec un avoir. L'encaissé compte chaque facture à la date de son paiement (pour ta déclaration de chiffre d'affaires).</p>`
      + `<div class="r-boutons"><button type="button" class="btn btn--ghost btn--petit" data-fa="recettes"${toutes.some(x => x.paiement) ? '' : ' disabled'}>${icone('telecharger')}Livre des recettes ${annee} (.csv)</button>`
      + `<button type="button" class="btn btn--ghost btn--petit" data-fa="reglages">${icone('reglages')}Informations de facturation</button></div>`;
  }
  const ligneFacture = f => `<li><button type="button" class="fa-ligne" data-fa-ouvrir="${esc(f.id)}"><span class="fa-num">${f.numero ? esc(f.numero) : '<i>Brouillon</i>'}</span>`
    + `<span class="cl-txt"><b>${esc(nomClientFacture(f))}</b><small>${esc([f.objet, f.date ? fmt(f.date, { day: 'numeric', month: 'short', year: 'numeric' }) : ''].filter(Boolean).join(' · ') || ' ')}</small></span>`
    + `<span class="fa-montant">${esc(euros(totalFacture(f)))}</span>${pastilleFacture(f)}</button></li>`;

  function rendreEditionFacture(corps) {
    const f = brouillonFacture;
    $('#factures-titre').textContent = f.nouveau ? 'Nouvelle facture' : 'Brouillon de facture';
    const liste = clients().slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    const moisCourant = aujourdhui().slice(0, 7);
    const moisPrecedent = iso(new Date(Number(moisCourant.slice(0, 4)), Number(moisCourant.slice(5)) - 2, 1)).slice(0, 7);
    corps.innerHTML = `<form class="fa-form" id="fa-form" novalidate>`
      + `<button type="button" class="btn btn--lien btn--petit cl-retour" data-fa="liste">${icone('gauche')}Toutes les factures</button>`
      + `<div class="fa-haut"><label class="champ"><span>Client</span><select name="client"><option value="">— Choisir un client —</option>${liste.map(c => `<option value="${esc(c.id)}"${c.id === f.client ? ' selected' : ''}>${esc(c.nom)}</option>`).join('')}</select></label>`
      + `<label class="champ"><span>Date de la facture</span><input type="date" name="date" value="${esc(f.date || aujourdhui())}"></label></div>`
      + (liste.length ? '' : `<p class="r-aide">Les factures se font pour une fiche client. <button type="button" class="btn--lien lien-tab" data-fa="clients">Créer une fiche client</button></p>`)
      + `<label class="champ"><span>Objet</span><input name="objet" value="${esc(f.objet || '')}" maxlength="160" placeholder="Ex. Création du serveur Discord" autocomplete="off"></label>`
      + `<div class="fa-lignes" id="fa-lignes"></div>`
      + `<div class="fa-ajouts"><button type="button" class="btn btn--ghost btn--petit" data-fa="ligne">${icone('plus')}Ajouter une ligne</button>`
      + `<label class="fa-heures"><span class="sr">Ajouter les heures d'un mois</span><select data-fa-heures><option value="">Ajouter les heures de…</option>${[moisCourant, moisPrecedent].map(m => `<option value="${m}">${esc(maj1(moisTexte(m)))}</option>`).join('')}</select></label></div>`
      + `<label class="champ"><span>Note sur la facture (facultatif)</span><textarea name="notes" rows="2" maxlength="600" placeholder="Ex. Merci pour votre confiance !">${esc(f.notes || '')}</textarea></label>`
      + `<div class="fa-total" id="fa-total"></div>`
      + `<p class="f-erreur" id="fa-erreur" role="alert"></p>`
      + `<div class="cl-actions fa-boutons">${f.nouveau ? '' : `<button type="button" class="icone-btn icone-btn--danger" data-fa="supprimer" aria-label="Supprimer le brouillon" title="Supprimer le brouillon">${icone('corbeille')}</button>`}`
      + `<button type="button" class="btn btn--ghost btn--petit" data-fa="apercu">${icone('telecharger')}Aperçu PDF</button><span class="espace"></span>`
      + `<button type="submit" class="btn btn--ghost">Enregistrer le brouillon</button><button type="button" class="btn btn--primaire" data-fa="emettre">${icone('facture')}Émettre</button></div></form>`;
    rendreLignesFacture();
  }
  function rendreLignesFacture() {
    const f = brouillonFacture;
    $('#fa-lignes').innerHTML = `<div class="fa-l fa-l--tete" aria-hidden="true"><span>Description</span><span>Qté</span><span>Unité</span><span>Prix unitaire</span><span>Total</span><span></span></div>`
      + f.lignes.map((l, k) => `<div class="fa-l" data-k="${k}">`
        + `<input data-l="desc" value="${esc(l.desc)}" maxlength="300" placeholder="Description" aria-label="Description, ligne ${k + 1}" autocomplete="off">`
        + `<input data-l="qte" type="number" step="0.25" inputmode="decimal" value="${esc(l.qte)}" aria-label="Quantité, ligne ${k + 1}">`
        + `<select data-l="unite" aria-label="Unité, ligne ${k + 1}">${F().UNITES.map(([v, t]) => `<option value="${v}"${l.unite === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`
        + `<input data-l="pu" type="number" step="0.01" inputmode="decimal" value="${esc(l.pu)}" aria-label="Prix unitaire en euros, ligne ${k + 1}">`
        + `<b class="fa-l-total"></b>`
        + `<button type="button" class="icone-btn" data-fa-retirer="${k}" aria-label="Retirer la ligne ${k + 1}"${f.lignes.length > 1 ? '' : ' disabled'}>${icone('fermer')}</button></div>`).join('');
    majTotalFacture();
  }
  function majTotalFacture() {
    const t = F().totaux(factureComplete(brouillonFacture));
    $$('#fa-lignes .fa-l[data-k]').forEach((el, k) => { $('.fa-l-total', el).textContent = euros(t.lignes[k] ? t.lignes[k].total : 0); });
    const reg = facturation();
    $('#fa-total').innerHTML = (t.taux ? `<div><span>Total HT</span><b>${esc(euros(t.ht))}</b></div><div><span>TVA ${esc(F().nombre(t.taux))} %</span><b>${esc(euros(t.tva))}</b></div>` : '')
      + `<div class="fa-total-ttc"><span>${t.taux ? 'Total TTC' : 'Total'}</span><b>${esc(euros(t.ttc))}</b></div>`
      + `<small>${t.taux ? '' : `${F().FRANCHISE} · `}${Number(reg.delai) ? `à régler sous ${Number(reg.delai)} jours` : 'à régler à réception'}</small>`;
  }
  function lireFormFacture() {
    const form = $('#fa-form');
    if (!form || !brouillonFacture) return;
    const f = brouillonFacture;
    f.client = form.elements.client.value;
    f.clientNom = (clientDe(f.client) || {}).nom || '';
    f.date = DATE.test(form.elements.date.value) ? form.elements.date.value : aujourdhui();
    f.objet = form.elements.objet.value.trim();
    f.notes = form.elements.notes.value.trim();
    const nombreDe = v => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
    $$('#fa-lignes .fa-l[data-k]').forEach(el => {
      const l = f.lignes[Number(el.dataset.k)];
      if (!l) return;
      l.desc = $('[data-l="desc"]', el).value;
      l.qte = nombreDe($('[data-l="qte"]', el).value);
      l.unite = $('[data-l="unite"]', el).value;
      l.pu = nombreDe($('[data-l="pu"]', el).value);
    });
  }
  function enregistrerBrouillonFacture() {
    lireFormFacture();
    const f = brouillonFacture;
    const instant = new Date().toISOString();
    const propre = { ...f, lignes: f.lignes.map(l => ({ ...l, desc: String(l.desc).trim() })).filter(l => l.desc || Number(l.pu)), cree: f.cree || instant, modifie: instant };
    delete propre.nouveau;
    if (!propre.lignes.length) propre.lignes = [{ desc: '', qte: 1, unite: 'forfait', pu: 0 }];
    operation({ type: 'facture', facture: propre, nouveau: !!f.nouveau, titre: [propre.clientNom, propre.objet].filter(Boolean).join(' · ') });
    brouillonFacture = clone(propre);
    return propre;
  }
  function problemesEmission(f) {
    const manques = [];
    if (!reglagesFacturationOk()) manques.push('tes informations de facturation (nom, adresse et SIRET, dans Réglages › Facturation)');
    if (!clientDe(f.client)) manques.push('le client');
    if (!f.lignes.some(l => l.desc && Number(l.qte) && Number(l.pu))) manques.push('au moins une ligne avec une description, une quantité et un prix');
    if (manques.length) return `Pour émettre, il manque ${manques.join(', ')}.`;
    // Les numéros doivent suivre l'ordre des dates
    const derniere = factures().filter(x => x.numero && x.type !== 'avoir' && x.numero.startsWith(`${prefixeFacture()}-${f.date.slice(0, 4)}-`)).map(x => x.date).sort().pop();
    if (derniere && f.date < derniere) return `La date doit être le ${fmt(derniere, { day: 'numeric', month: 'long' })} ou après (date de ta dernière facture), pour que les numéros suivent l'ordre des dates.`;
    return '';
  }
  async function emettreFacture() {
    const f = enregistrerBrouillonFacture();
    const probleme = problemesEmission(f);
    if (probleme) { rendreFactures(); $('#fa-erreur').textContent = probleme; return; }
    const c = clientDe(f.client);
    const numero = F().numeroSuivant(factures(), prefixeFacture(), f.date.slice(0, 4));
    const ok = await confirmer(`Émettre la facture ${numero} ?`,
      `${euros(totalFacture(factureComplete(f)))} pour ${c.nom}, datée du ${fmt(f.date, { day: 'numeric', month: 'long', year: 'numeric' })}. Une fois émise, elle ne pourra plus être modifiée ni supprimée : en cas d'erreur, tu l'annuleras avec un avoir.${c.adresse ? '' : " Sa fiche client n'a pas d'adresse : ajoute-la d'abord si c'est un professionnel."}`,
      'Émettre la facture');
    if (!ok) { rendreFactures(); return; }
    operation({ type: 'emettreFacture', id: f.id, date: f.date, titre: `${c.nom} · ${euros(totalFacture(factureComplete(f)))}` });
    brouillonFacture = null;
    const emise = factures().find(x => x.id === f.id);
    ouvrirFactures('voir', f.id);
    toast(`Facture ${emise ? emise.numero : ''} émise`);
  }

  function rendreVoirFacture(corps, f) {
    const avoir = f.type === 'avoir';
    $('#factures-titre').textContent = `${avoir ? 'Avoir' : 'Facture'} ${f.numero}`;
    const st = statutFacture(f);
    const c = clientDe(f.client);
    const lien = lienEspace(c);
    const autre = id => factures().find(x => x.id === id) || {};
    const jourTxt = d => (DATE.test(d || '') ? fmt(d, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
    const mode = f.paiement && (F().MODES.find(m => m[0] === f.paiement.mode) || [])[1];
    const etatTxt = {
      emise: `À régler avant le ${jourTxt(f.echeance)}.`,
      retard: `En retard : l'échéance était le ${jourTxt(f.echeance)}.`,
      payee: `Payée le ${jourTxt(f.paiement && f.paiement.date)}${mode ? ` (${mode.toLowerCase()})` : ''}.`,
      annulee: `Annulée par l'avoir ${autre(f.avoir).numero || ''}${f.paiement ? `, après un paiement le ${jourTxt(f.paiement.date)}` : ''}.`,
      avoir: `Annule la facture ${autre(f.ref).numero || ''}. Si ton client avait déjà payé, marque l'avoir comme remboursé une fois le remboursement fait.`,
      rembourse: `Remboursé le ${jourTxt(f.paiement && f.paiement.date)}.`,
    }[st];
    corps.innerHTML = `<button type="button" class="btn btn--lien btn--petit cl-retour" data-fa="liste">${icone('gauche')}Toutes les factures</button>`
      + `<div class="fa-etat">${pastilleFacture(f)}<span>${esc(etatTxt)}</span></div>`
      + `<div class="fa-actions"><button type="button" class="btn btn--primaire btn--petit" data-fa="pdf">${icone('telecharger')}Télécharger le PDF</button>`
      + (f.paiement ? `<button type="button" class="btn btn--ghost btn--petit" data-fa="impayer">Annuler le paiement</button>`
        : st !== 'annulee' ? `<button type="button" class="btn btn--ghost btn--petit" data-fa="payer">${icone('coche')}${avoir ? 'Marquer comme remboursé' : 'Marquer comme payée'}</button>` : '')
      + (!avoir && f.statut !== 'annulee' ? `<button type="button" class="btn btn--ghost btn--petit" data-fa="avoir">${icone('restaurer')}Annuler par un avoir</button>` : '')
      + (c && c.email ? `<button type="button" class="btn btn--ghost btn--petit" data-fa="email">${icone('mail')}Envoyer par e-mail</button>` : '')
      + (lien ? `<button type="button" class="btn btn--ghost btn--petit" data-fa="lien">${icone('lien')}Lien de l'espace client</button>` : '')
      + `</div>`
      + `<form class="fa-paiement" id="fa-paiement" hidden><label class="champ"><span>Date du ${avoir ? 'remboursement' : 'paiement'}</span><input type="date" name="date" value="${aujourdhui()}" required></label>`
      + `<label class="champ"><span>Moyen</span><select name="mode">${F().MODES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`
      + `<button type="submit" class="btn btn--primaire btn--petit">Confirmer</button></form>`
      + `<div class="fa-papier">${F().html(factureComplete(f))}</div>`;
  }

  // Livre des recettes : encaissements de l'année, dans l'ordre des dates (tableur)
  function livreRecettes(annee) {
    const nb = n => String(Math.round(n * 100) / 100).replace('.', ',');
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lignes = factures().filter(f => f.numero && f.paiement && String(f.paiement.date).startsWith(annee))
      .sort((a, b) => a.paiement.date.localeCompare(b.paiement.date) || a.numero.localeCompare(b.numero))
      .map(f => [fmt(f.paiement.date, { day: '2-digit', month: '2-digit', year: 'numeric' }), f.numero, nomClientFacture(f), f.objet || (f.type === 'avoir' ? 'Avoir' : 'Prestation de services'),
        nb(totalFacture(f)), (F().MODES.find(m => m[0] === f.paiement.mode) || ['', ''])[1]].map(cell).join(';'));
    const tete = ['Date d\'encaissement', 'Facture', 'Client', 'Nature', 'Montant (€)', 'Moyen de paiement'].map(cell).join(';');
    return '﻿' + [tete, ...lignes].join('\r\n') + '\r\n';
  }
  function mailFacture(f) {
    const c = clientDe(f.client) || {};
    const lien = lienEspace(c);
    const reg = facturation();
    const corps = [`Bonjour ${c.nom || ''},`, '',
      `${f.type === 'avoir' ? `Voici l'avoir ${f.numero}` : `Voici la facture ${f.numero}`} d'un montant de ${euros(totalFacture(f))}${f.type !== 'avoir' && f.echeance ? `, à régler avant le ${fmt(f.echeance, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.`,
      lien ? `Vous pouvez la télécharger depuis votre espace client : ${lien}` : 'Vous la trouverez en pièce jointe.', '', 'Merci !', reg.nom || 'Mvrius'].join('\n');
    if (!lien) F().telecharger(factureComplete(f));
    location.href = `mailto:${encodeURIComponent(c.email || '')}?subject=${encodeURIComponent(`${f.type === 'avoir' ? 'Avoir' : 'Facture'} ${f.numero} — ${reg.nom || 'Mvrius'}`)}&body=${encodeURIComponent(corps)}`;
  }

  facturesDlg.addEventListener('change', e => {
    if (e.target.name === 'fa-filtre') { facturesEtat.filtre = e.target.value; rendreFactures(); return; }
    if (e.target.matches('[data-fa-heures]')) {
      const mois = e.target.value;
      e.target.value = '';
      lireFormFacture();
      const c = clientDe(brouillonFacture.client);
      if (!mois) return;
      if (!c) { $('#fa-erreur').textContent = "Choisis d'abord le client."; return; }
      const nouvelles = lignesHeures(c, mois);
      if (!nouvelles.length) { $('#fa-erreur').textContent = `Aucune heure réalisée et facturable pour ${c.nom} en ${moisTexte(mois)}.`; return; }
      brouillonFacture.lignes = [...brouillonFacture.lignes.filter(l => String(l.desc).trim() || Number(l.pu)), ...nouvelles];
      if (!brouillonFacture.objet) { brouillonFacture.objet = `Accompagnement — ${moisTexte(mois)}`; $('#fa-form').elements.objet.value = brouillonFacture.objet; }
      $('#fa-erreur').textContent = '';
      rendreLignesFacture();
      if (!Number(c.tarif)) $('#fa-erreur').textContent = `La fiche de ${c.nom} n'a pas de tarif horaire : indique le prix de chaque ligne.`;
      return;
    }
    if (e.target.closest('#fa-form')) { lireFormFacture(); majTotalFacture(); }
  });
  facturesDlg.addEventListener('input', e => { if (e.target.closest('#fa-lignes')) { lireFormFacture(); majTotalFacture(); } });
  facturesDlg.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.id === 'fa-form') {
      enregistrerBrouillonFacture();
      toast('Brouillon enregistré');
      ouvrirFactures('liste');
    } else if (e.target.id === 'fa-paiement') {
      const f = factures().find(x => x.id === facturesEtat.id);
      const date = e.target.elements.date.value;
      if (!f || !DATE.test(date)) return;
      operation({ type: 'payerFacture', id: f.id, numero: f.numero, paiement: { date, mode: e.target.elements.mode.value } });
      toast(f.type === 'avoir' ? `Avoir ${f.numero} remboursé` : `Facture ${f.numero} payée 🎉`, { texte: 'Annuler', faire: () => operation({ type: 'payerFacture', id: f.id, numero: f.numero, paiement: null }) });
      rendreFactures();
    }
  });
  facturesDlg.addEventListener('click', async e => {
    const ouvrir = e.target.closest('[data-fa-ouvrir]');
    if (ouvrir) {
      const f = factures().find(x => x.id === ouvrir.dataset.faOuvrir);
      if (f) ouvrirFactures(f.statut === 'brouillon' ? 'edition' : 'voir', f.id);
      return;
    }
    const retirer = e.target.closest('[data-fa-retirer]');
    if (retirer) { lireFormFacture(); brouillonFacture.lignes.splice(Number(retirer.dataset.faRetirer), 1); rendreLignesFacture(); return; }
    const b = e.target.closest('[data-fa]');
    if (!b) return;
    const a = b.dataset.fa;
    const f = factures().find(x => x.id === facturesEtat.id);
    if (a === 'liste') { brouillonFacture = null; ouvrirFactures('liste'); }
    else if (a === 'nouvelle') nouvelleFacture();
    else if (a === 'reglages') { facturesDlg.close(); ouvrirReglages('facturation'); }
    else if (a === 'clients') { facturesDlg.close(); ouvrirClients(); }
    else if (a === 'recettes') { const annee = aujourdhui().slice(0, 4); telecharger(`livre-des-recettes-${annee}.csv`, livreRecettes(annee), 'text/csv;charset=utf-8'); }
    else if (a === 'ligne') {
      lireFormFacture();
      const c = clientDe(brouillonFacture.client);
      brouillonFacture.lignes.push({ desc: '', qte: 1, unite: c && Number(c.tarif) > 0 ? 'h' : 'forfait', pu: c && Number(c.tarif) > 0 ? Number(c.tarif) : 0 });
      rendreLignesFacture();
      $$('#fa-lignes [data-l="desc"]').pop().focus();
    } else if (a === 'apercu') { lireFormFacture(); F().telecharger(factureComplete(brouillonFacture)); }
    else if (a === 'emettre') emettreFacture();
    else if (a === 'supprimer') {
      const ancien = factures().find(x => x.id === brouillonFacture.id);
      if (ancien) {
        operation({ type: 'supprimerFacture', id: ancien.id, titre: [ancien.clientNom, ancien.objet].filter(Boolean).join(' · ') });
        toast('Brouillon mis à la corbeille', { texte: 'Annuler', faire: () => operation({ type: 'facture', facture: ancien }) });
      }
      brouillonFacture = null;
      ouvrirFactures('liste');
    } else if (!f) {
      // (la facture a disparu entre-temps)
    } else if (a === 'pdf') F().telecharger(factureComplete(f));
    else if (a === 'payer') { const p = $('#fa-paiement'); p.hidden = !p.hidden; if (!p.hidden) p.elements.date.focus(); }
    else if (a === 'impayer') {
      const avant = f.paiement;
      operation({ type: 'payerFacture', id: f.id, numero: f.numero, paiement: null });
      toast('Paiement annulé', { texte: 'Annuler', faire: () => operation({ type: 'payerFacture', id: f.id, numero: f.numero, paiement: avant }) });
      rendreFactures();
    } else if (a === 'avoir') {
      const ok = await confirmer(`Annuler la facture ${f.numero} ?`, `Un avoir de ${euros(-totalFacture(f))} va être créé et numéroté. La facture restera dans tes comptes avec la mention « Annulée ».`, "Créer l'avoir");
      if (!ok) return;
      const id = nouvelId();
      operation({ type: 'avoirFacture', id: f.id, avoir: id, date: aujourdhui(), numero: f.numero });
      ouvrirFactures('voir', id);
      toast(`Avoir ${(factures().find(x => x.id === id) || {}).numero || ''} créé`);
    } else if (a === 'email') mailFacture(f);
    else if (a === 'lien') toast((await copier(lienEspace(clientDe(f.client)))) ? "Lien de l'espace client copié" : 'Copie impossible.');
  });

  // Fenêtre de confirmation (oui / non)
  function confirmer(titre, texte, bouton) {
    const d = $('#confirmer');
    $('#confirmer-titre').textContent = titre;
    $('#confirmer-texte').textContent = texte;
    $('#confirmer-ok').textContent = bouton;
    d.returnValue = '';
    d.showModal();
    return new Promise(resolve => d.addEventListener('close', () => resolve(d.returnValue === 'oui'), { once: true }));
  }

  /* ---------- Tâches : fiche, réserver du temps, glisser dans l'agenda ---------- */
  const tacheDlg = $('#tache-dialog');
  const tacheForm = $('#tache-form');
  let tacheEdit = null;
  $('#t-priorite').insertAdjacentHTML('beforeend', PRIORITES.map(([v, t, c]) => `<label class="choix" style="--c:${c}"><input type="radio" name="priorite" value="${v}"><span>${t}</span></label>`).join(''));
  tacheForm.elements.duree.innerHTML = DUREES_TACHE.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  function ouvrirTache(id) {
    const t = (donnees().taches || []).find(x => x.id === id);
    if (!t) return;
    tacheEdit = clone(t);
    const f = tacheForm.elements;
    f.titre.value = t.titre;
    f.date.value = t.date || '';
    f.aplanifier.checked = !t.date;
    f.echeance.value = t.echeance || '';
    f.duree.value = String(DUREES_TACHE.some(([v]) => v === Number(t.duree)) ? Number(t.duree) : 60);
    f.notes.value = t.notes || '';
    tacheForm.querySelector(`input[name="priorite"][value="${clamp(Number(t.priorite) || 0, 0, 2)}"]`).checked = true;
    const bloc = t.bloc && trouver(t.bloc);
    $('#t-bloc').hidden = !bloc;
    if (bloc) $('#t-bloc').innerHTML = `${icone('calendrier')}<span>Du temps est réservé ${esc(leJour(bloc.date))} de ${bloc.debut} à ${bloc.fin}.</span>`;
    $('#t-erreur').textContent = '';
    majTache();
    tacheDlg.showModal();
  }
  function majTache() {
    const f = tacheForm.elements;
    f.date.disabled = f.aplanifier.checked;
  }
  tacheForm.addEventListener('change', e => {
    if (e.target.name === 'aplanifier' && !e.target.checked && !tacheForm.elements.date.value) tacheForm.elements.date.value = etat.curseur;
    majTache();
  });
  function lireTache() {
    const f = tacheForm.elements;
    return {
      ...tacheEdit,
      titre: f.titre.value.trim(),
      date: f.aplanifier.checked || !DATE.test(f.date.value) ? null : f.date.value,
      echeance: DATE.test(f.echeance.value) ? f.echeance.value : null,
      priorite: Number((tacheForm.querySelector('input[name="priorite"]:checked') || {}).value) || 0,
      duree: Number(f.duree.value) || 60,
      notes: f.notes.value.trim(),
    };
  }
  tacheForm.addEventListener('submit', e => {
    e.preventDefault();
    const t = lireTache();
    if (!t.titre) { $('#t-erreur').textContent = 'Donne un titre à la tâche.'; tacheForm.elements.titre.focus(); return; }
    const avant = (donnees().taches || []).find(x => x.id === t.id);
    tacheDlg.close();
    operation({ type: 'tache', tache: t });
    toast('Tâche enregistrée', avant ? { texte: 'Annuler', faire: () => operation({ type: 'tache', tache: avant }) } : null);
  });
  tacheForm.addEventListener('click', e => {
    const b = e.target.closest('[data-tache-action]');
    if (!b || !tacheEdit) return;
    if (b.dataset.tacheAction === 'supprimer') {
      const t = (donnees().taches || []).find(x => x.id === tacheEdit.id);
      tacheDlg.close();
      if (!t) return;
      operation({ type: 'supprimerTache', id: t.id, titre: t.titre });
      toast('Tâche mise à la corbeille', { texte: 'Annuler', faire: () => operation({ type: 'tache', tache: t }) });
    } else if (b.dataset.tacheAction === 'planifier') {
      const t = lireTache();
      if (!t.titre) { $('#t-erreur').textContent = 'Donne un titre à la tâche.'; return; }
      const jourVise = t.date && t.date >= aujourdhui() ? t.date : aujourdhui();
      const libre = prochainLibre(t.duree, Math.max(instantDebut(jourVise, '00:00'), instantMaintenant()), null);
      if (!libre) { $('#t-erreur').textContent = 'Aucun créneau libre dans tes heures de travail sur les 3 prochaines semaines.'; return; }
      tacheDlg.close();
      bloquerTemps(t, libre.date, minutes(libre.debut));
    }
  });
  // Crée un bloc dans l'agenda pour une tâche ; la tâche passe à ce jour-là
  function bloquerTemps(t, date, debutM) {
    const avant = (donnees().taches || []).find(x => x.id === t.id) || t;
    const duree = Number(t.duree) || 60;
    const instant = new Date().toISOString();
    const cat = categories().find(c => c.id === 'perso') || categories()[0];
    const rdv = {
      id: nouvelId(), titre: t.titre, categorie: cat.id, date, dateFin: date, journee: false,
      debut: heure(debutM), fin: heure(Math.min(debutM + duree, 1440)), repetition: null, exceptions: [], rappels: [5],
      checklist: [], statut: 'confirme', avec: '', lieu: '', notes: t.notes || '', tache: t.id, cree: instant, modifie: instant,
    };
    const tache = { ...clone(t), date, bloc: rdv.id };
    operation([{ type: 'enregistrer', rdv, nouveau: true }, { type: 'tache', tache }]);
    if (!visible(date)) { etat.curseur = date; etat.mini = null; rendre(); }
    toast(`« ${t.titre} » planifiée ${leJour(date)} à ${rdv.debut}`, { texte: 'Annuler', faire: () => operation([{ type: 'supprimer', id: rdv.id, titre: rdv.titre, sansCorbeille: true }, { type: 'tache', tache: avant }]) });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-tache-ouvrir]');
    if (b) ouvrirTache(b.dataset.tacheOuvrir);
  });
  // Glisser une tâche (colonne de gauche) sur la grille : un bloc de sa durée à l'heure visée ;
  // sur la ligne « Journée » ou un jour du mois : la tâche passe à ce jour-là
  let tacheGlissee = null;
  let fantomeTache = null;
  const retirerFantome = () => { if (fantomeTache) { fantomeTache.remove(); fantomeTache = null; } };
  document.addEventListener('dragstart', e => {
    const el = e.target.closest && e.target.closest('[data-glisser-tache]');
    if (!el) return;
    tacheGlissee = (donnees().taches || []).find(t => t.id === el.dataset.glisserTache) || null;
    if (!tacheGlissee) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tacheGlissee.titre);
    document.body.classList.add('glisse-tache');
    // Sur tablette, la colonne de gauche est un tiroir : on le ferme pour voir l'agenda
    setTimeout(fermerCote, 0);
  });
  document.addEventListener('dragend', () => { tacheGlissee = null; retirerFantome(); document.body.classList.remove('glisse-tache'); $$('.is-cible').forEach(x => x.classList.remove('is-cible')); });
  const minuteSous = (col, y) => clamp(caleSur((y - col.getBoundingClientRect().top) / hauteurHeure() * 60, 15), 0, 1425);
  vueEl.addEventListener('dragover', e => {
    if (!tacheGlissee) return;
    const col = e.target.closest('.g-col');
    const cible = col || e.target.closest('.g-jt, .m-case');
    if (!cible) { retirerFantome(); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    $$('.is-cible').forEach(x => { if (x !== cible) x.classList.remove('is-cible'); });
    cible.classList.add('is-cible');
    if (col) {
      const duree = Number(tacheGlissee.duree) || 60;
      const m = Math.min(minuteSous(col, e.clientY), 1440 - Math.min(duree, 1440));
      if (!fantomeTache) { fantomeTache = document.createElement('div'); fantomeTache.className = 'fantome'; }
      if (fantomeTache.parentNode !== col) col.append(fantomeTache);
      fantomeTache.style.setProperty('--d', m);
      fantomeTache.style.setProperty('--l', Math.min(duree, 1440 - m));
      fantomeTache.textContent = `${heure(m)} · ${tacheGlissee.titre}`;
    } else retirerFantome();
  });
  vueEl.addEventListener('dragleave', e => { if (!vueEl.contains(e.relatedTarget)) { retirerFantome(); $$('.is-cible').forEach(x => x.classList.remove('is-cible')); } });
  vueEl.addEventListener('drop', e => {
    if (!tacheGlissee) return;
    e.preventDefault();
    const t = tacheGlissee;
    tacheGlissee = null;
    retirerFantome();
    $$('.is-cible').forEach(x => x.classList.remove('is-cible'));
    const col = e.target.closest('.g-col');
    if (col) {
      const duree = Number(t.duree) || 60;
      bloquerTemps(t, col.dataset.date, Math.min(minuteSous(col, e.clientY), 1440 - Math.min(duree, 1440)));
      return;
    }
    const jourCible = e.target.closest('.g-jt, .m-case');
    if (jourCible) {
      operation({ type: 'tache', tache: { ...clone(t), date: jourCible.dataset.date } });
      toast(`« ${t.titre} » prévue ${leJour(jourCible.dataset.date)}`, { texte: 'Annuler', faire: () => operation({ type: 'tache', tache: t }) });
    }
  });

  /* ---------- Corbeille ---------- */
  const corbeilleDlg = $('#corbeille');
  const TYPES_CORBEILLE = { rdv: ['calendrier', 'Rendez-vous'], occurrence: ['repete', 'Rendez-vous d\'une série'], tache: ['coche', 'Tâche'], client: ['clients', 'Client'], modele: ['modele', 'Modèle'], facture: ['facture', 'Brouillon de facture'] };
  function ouvrirCorbeille() {
    rendreCorbeille();
    corbeilleDlg.showModal();
  }
  function rendreCorbeille() {
    const liste = corbeille().slice().sort((a, b) => String(b.le).localeCompare(String(a.le)));
    const quandSuppr = le => (Date.parse(le) ? new Date(le).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
    const detail = c => {
      const x = c.element;
      if (c.type === 'rdv') return x.date ? `${fmt(x.date, { weekday: 'short', day: 'numeric', month: 'short' })}${x.journee ? '' : ` · ${x.debut}`}${x.repetition ? ' · série' : ''}` : '';
      if (c.type === 'occurrence') return fmt(x.date, { weekday: 'short', day: 'numeric', month: 'short' });
      if (c.type === 'tache') return x.date ? fmt(x.date, { day: 'numeric', month: 'short' }) : 'À planifier';
      return '';
    };
    $('#corbeille-corps').innerHTML = `<p class="r-aide">Ce que tu supprimes reste ici ${CORBEILLE_JOURS} jours : tu peux le restaurer en un clic.</p>`
      + (liste.length ? `<ul class="cb-liste">${liste.map(c => {
        const [ic, type] = TYPES_CORBEILLE[c.type] || ['corbeille', 'Élément'];
        const titre = c.element.titre || c.element.nom || [c.element.clientNom, c.element.objet].filter(Boolean).join(' · ') || 'Sans titre';
        return `<li class="cb-ligne"><span class="cb-ic">${icone(ic)}</span><span class="cb-txt"><b>${esc(titre)}</b><small>${esc([type, detail(c)].filter(Boolean).join(' · '))} · supprimé le ${esc(quandSuppr(c.le))}</small></span>`
          + `<button type="button" class="btn btn--ghost btn--petit" data-restaurer="${esc(c.cid)}">${icone('restaurer')}Restaurer</button></li>`;
      }).join('')}</ul><div class="r-boutons"><button type="button" class="btn btn--danger btn--petit" data-vider-corbeille>${icone('corbeille')}Vider la corbeille</button></div>`
        : `<div class="vide"><span class="vide-icone">${icone('corbeille')}</span><h3>La corbeille est vide</h3><p>Rien n'a été supprimé ces ${CORBEILLE_JOURS} derniers jours.</p></div>`);
  }
  corbeilleDlg.addEventListener('click', e => {
    const b = e.target.closest('[data-restaurer]');
    if (b) {
      const c = corbeille().find(x => x.cid === b.dataset.restaurer);
      if (!c) return;
      const titre = c.element.titre || c.element.nom || '';
      operation({ type: 'restaurer', cid: c.cid, titre });
      toast(`« ${titre} » restauré`);
      rendreCorbeille();
      return;
    }
    if (e.target.closest('[data-vider-corbeille]') && confirm('Vider la corbeille ? Ces éléments ne pourront plus être restaurés (sauf depuis l\'historique des versions).')) {
      operation({ type: 'viderCorbeille' });
      rendreCorbeille();
    }
  });

  /* ---------- Historique des versions (commits du dépôt privé) ---------- */
  const histoDlg = $('#historique');
  let histo = { page: 0, liste: [], fin: false, charge: false };
  function ouvrirHistorique() {
    histo = { page: 0, liste: [], fin: false, charge: false };
    $('#historique-corps').innerHTML = '';
    histoDlg.showModal();
    chargerHisto();
  }
  async function chargerHisto() {
    if (histo.charge || histo.fin) return;
    histo.charge = true;
    rendreHisto();
    try {
      const rep = await fetch(`${SERVEUR}/depot/commits?page=${histo.page + 1}`, { cache: 'no-store', headers: { Authorization: `Bearer ${etat.session ? etat.session.jeton : ''}` } });
      if (rep.status === 401) throw new ErreurAgenda('session', 'Ta session a expiré. Reconnecte-toi avec Discord.');
      if (rep.status === 404) throw new ErreurAgenda('acces', "L'historique demande la dernière version du serveur de l'agenda (à recoller dans Cloudflare).");
      if (!rep.ok) throw new ErreurAgenda('reseau', `Le serveur a répondu une erreur (${rep.status}).`);
      const liste = await rep.json();
      histo.page++;
      histo.liste.push(...liste);
      histo.fin = liste.length < 30;
      histo.erreur = '';
    } catch (err) {
      histo.erreur = err.code === 'reseau' && err.message.startsWith('Impossible') ? "Pas de connexion : l'historique n'est disponible qu'en ligne." : err.message || "L'historique n'a pas pu être chargé.";
    } finally {
      histo.charge = false;
      rendreHisto();
    }
  }
  function rendreHisto() {
    const parJour = new Map();
    histo.liste.forEach(c => {
      const d = iso(new Date(c.date));
      if (!parJour.has(d)) parJour.set(d, []);
      parJour.get(d).push(c);
    });
    let html = '<p class="r-aide">Chaque changement est une version enregistrée dans ton dépôt privé. Ouvre une version pour voir ce qui changerait, puis restaure-la si besoin.</p>';
    for (const [d, liste] of parJour) {
      html += `<h3 class="cl-h">${esc(maj1(quand(d) === fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }) ? fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }) : quand(d)))}</h3><ul class="hi-liste">`
        + liste.map(c => `<li><button type="button" class="hi-ligne" data-version="${esc(c.sha)}" data-date="${esc(c.date)}"><time>${esc(new Date(c.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}</time><span>${esc(c.message)}</span>${icone('droite')}</button></li>`).join('') + '</ul>';
    }
    if (histo.erreur) html += `<p class="f-erreur">${esc(histo.erreur)}</p>`;
    if (histo.charge) html += '<div class="c-chargement hi-charge" role="status"><span class="c-roue" aria-hidden="true"></span>Chargement de l\'historique…</div>';
    else if (!histo.fin && !histo.erreur) html += '<div class="r-boutons"><button type="button" class="btn btn--ghost btn--petit" data-histo-plus>Versions plus anciennes</button></div>';
    $('#historique-corps').innerHTML = html;
  }
  // Ce qui changerait en revenant à une version : par identifiant, avec les titres
  function differences(version, actuel) {
    const diff = (a, b, cle) => {
      const ida = new Map((a[cle] || []).map(x => [x.id, x]));
      const idb = new Map((b[cle] || []).map(x => [x.id, x]));
      return {
        reviennent: [...ida.values()].filter(x => !idb.has(x.id)),
        partent: [...idb.values()].filter(x => !ida.has(x.id)),
        changent: [...ida.values()].filter(x => idb.has(x.id) && JSON.stringify(x) !== JSON.stringify(idb.get(x.id))),
      };
    };
    return { rdv: diff(version, actuel, 'rendezvous'), taches: diff(version, actuel, 'taches'), clients: diff(version, actuel, 'clients') };
  }
  async function voirVersion(sha, date) {
    $('#historique-corps').innerHTML = '<div class="c-chargement hi-charge" role="status"><span class="c-roue" aria-hidden="true"></span>Lecture de cette version…</div>';
    let version;
    try {
      const rep = await gh(`/contents/${DEPOT.fichier}?ref=${encodeURIComponent(sha)}`);
      if (!rep.ok) throw await erreurGh(rep, false);
      version = normaliser(JSON.parse(b64.decoder((await rep.json()).content)));
    } catch (err) {
      $('#historique-corps').innerHTML = `<button type="button" class="btn btn--lien btn--petit cl-retour" data-histo-retour>${icone('gauche')}Toutes les versions</button><p class="f-erreur">${esc(err.message || 'Cette version n\'a pas pu être lue.')}</p>`;
      return;
    }
    const d = differences(version, donnees());
    const quandTxt = new Date(date).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const noms = l => l.slice(0, 6).map(x => `« ${esc(x.titre || x.nom)} »`).join(', ') + (l.length > 6 ? ` et ${l.length - 6} autre${l.length > 7 ? 's' : ''}` : '');
    const bloc = (titre, g) => {
      const lignes = [
        g.reviennent.length && `<li class="hi-plus"><b>${g.reviennent.length} reviendrai${g.reviennent.length > 1 ? 'ent' : 't'}</b> : ${noms(g.reviennent)}</li>`,
        g.partent.length && `<li class="hi-moins"><b>${g.partent.length} disparaîtrai${g.partent.length > 1 ? 'ent' : 't'}</b> : ${noms(g.partent)}</li>`,
        g.changent.length && `<li><b>${g.changent.length} redeviendrai${g.changent.length > 1 ? 'ent' : 't'} comme avant</b> : ${noms(g.changent)}</li>`,
      ].filter(Boolean);
      return lignes.length ? `<h3 class="cl-h">${titre}</h3><ul class="hi-diff">${lignes.join('')}</ul>` : '';
    };
    const contenu = bloc('Rendez-vous', d.rdv) + bloc('Tâches', d.taches) + bloc('Clients', d.clients);
    $('#historique-corps').innerHTML = `<button type="button" class="btn btn--lien btn--petit cl-retour" data-histo-retour>${icone('gauche')}Toutes les versions</button>`
      + `<div class="hi-tete"><small>Version du</small><b>${esc(maj1(quandTxt))}</b><span>${version.rendezvous.length} rendez-vous · ${version.taches.length} tâches · ${version.clients.length} clients</span></div>`
      + (contenu || '<p class="av-vide">Cette version est identique à ton agenda actuel.</p>')
      + (contenu ? `<p class="r-aide">Restaurer remet tout l'agenda dans cet état (rendez-vous, tâches, clients, réglages). Tu pourras annuler juste après.</p><div class="r-boutons"><button type="button" class="btn btn--primaire btn--petit" data-histo-restaurer="${esc(sha)}">${icone('restaurer')}Restaurer cette version</button></div>` : '');
    histo.version = { sha, date, donnees: version, quand: quandTxt };
  }
  histoDlg.addEventListener('click', e => {
    if (e.target.closest('[data-histo-plus]')) { chargerHisto(); return; }
    if (e.target.closest('[data-histo-retour]')) { rendreHisto(); return; }
    const v = e.target.closest('[data-version]');
    if (v) { voirVersion(v.dataset.version, v.dataset.date); return; }
    const r = e.target.closest('[data-histo-restaurer]');
    if (r && histo.version && histo.version.sha === r.dataset.histoRestaurer) {
      if (!confirm(`Remettre l'agenda tel qu'il était le ${histo.version.quand} ?`)) return;
      const avant = clone(donnees());
      operation({ type: 'remplacer', donnees: histo.version.donnees, message: `Retour à la version du ${histo.version.quand}` });
      histoDlg.close();
      toast('Agenda restauré', { texte: 'Annuler', faire: () => operation({ type: 'remplacer', donnees: avant, message: 'Restauration annulée' }) }, 9000);
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
      c: () => ouvrirClients(),
      f: () => ouvrirFactures(),
      h: () => ouvrirFactu(),
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

  // Ouverture sans réseau : la page et ses fichiers sont gardés par le service worker (sw.js) ;
  // les rendez-vous sont déjà gardés sur l'appareil (cache) et les changements attendent le réseau.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* pas de mode hors ligne */ }));
  }

  ouvrir();
})();
