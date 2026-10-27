/* ==========================================================================
   Atelier de Mvrius — mvriuus.fr/atelier/
   Construire un serveur Discord : rôles et permissions, catégories et salons
   (qui voit, qui écrit), messages avec embeds et boutons, réglages du serveur.
   Les modèles sont dans atelier.json, dans le dépôt PRIVÉ « agenda-donnees »,
   via le serveur de l'agenda (tools/agenda-worker.js). C'est ce serveur, avec
   le bot de l'application Discord, qui fait les changements sur Discord.
   ========================================================================== */
(() => {
  'use strict';

  const SERVEUR = String(window.AGENDA_SERVEUR || '').replace(/\/+$/, '');
  const FICHIER = 'atelier.json';
  const STOCK = { session: 'agenda-session', brouillon: 'atelier-brouillon', dernier: 'atelier-dernier' };

  /* ---------- Outils ---------- */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icone = (nom, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${nom}"/></svg>`;
  const nouvelId = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const sansAccents = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const couleurSure = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '');
  const attendre = ms => new Promise(r => setTimeout(r, ms));
  const stock = {
    lire(cle, defaut) { try { const v = localStorage.getItem(cle); return v === null ? defaut : JSON.parse(v); } catch (e) { return defaut; } },
    ecrire(cle, valeur) { try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) { /* stockage plein ou bloqué */ } },
    effacer(cle) { try { localStorage.removeItem(cle); } catch (e) { /* rien à faire */ } },
  };

  /* ---------- Permissions Discord ---------- */
  // [clé, numéro du bit, libellé, groupe]
  const PERMS = [
    ['VIEW_CHANNEL', 10, 'Voir les salons', 'Général'],
    ['MANAGE_CHANNELS', 4, 'Gérer les salons', 'Général'],
    ['MANAGE_ROLES', 28, 'Gérer les rôles', 'Général'],
    ['MANAGE_GUILD_EXPRESSIONS', 30, 'Gérer émojis, autocollants et sons', 'Général'],
    ['CREATE_GUILD_EXPRESSIONS', 43, 'Créer des émojis et autocollants', 'Général'],
    ['VIEW_AUDIT_LOG', 7, 'Voir les logs du serveur', 'Général'],
    ['VIEW_GUILD_INSIGHTS', 19, 'Voir les statistiques', 'Général'],
    ['MANAGE_WEBHOOKS', 29, 'Gérer les webhooks', 'Général'],
    ['MANAGE_GUILD', 5, 'Gérer le serveur', 'Général'],
    ['CREATE_INSTANT_INVITE', 0, 'Créer une invitation', 'Membres'],
    ['CHANGE_NICKNAME', 26, 'Changer de pseudo', 'Membres'],
    ['MANAGE_NICKNAMES', 27, 'Gérer les pseudos', 'Membres'],
    ['KICK_MEMBERS', 1, 'Expulser des membres', 'Membres'],
    ['BAN_MEMBERS', 2, 'Bannir des membres', 'Membres'],
    ['MODERATE_MEMBERS', 40, 'Exclure temporairement', 'Membres'],
    ['SEND_MESSAGES', 11, 'Envoyer des messages', 'Salons textuels'],
    ['SEND_MESSAGES_IN_THREADS', 38, 'Écrire dans les fils', 'Salons textuels'],
    ['CREATE_PUBLIC_THREADS', 35, 'Créer des fils publics', 'Salons textuels'],
    ['CREATE_PRIVATE_THREADS', 36, 'Créer des fils privés', 'Salons textuels'],
    ['EMBED_LINKS', 14, 'Intégrer des liens', 'Salons textuels'],
    ['ATTACH_FILES', 15, 'Joindre des fichiers', 'Salons textuels'],
    ['ADD_REACTIONS', 6, 'Ajouter des réactions', 'Salons textuels'],
    ['USE_EXTERNAL_EMOJIS', 18, 'Émojis externes', 'Salons textuels'],
    ['USE_EXTERNAL_STICKERS', 37, 'Autocollants externes', 'Salons textuels'],
    ['MENTION_EVERYONE', 17, 'Mentionner @everyone et tous les rôles', 'Salons textuels'],
    ['MANAGE_MESSAGES', 13, 'Gérer les messages', 'Salons textuels'],
    ['MANAGE_THREADS', 34, 'Gérer les fils', 'Salons textuels'],
    ['READ_MESSAGE_HISTORY', 16, 'Voir les anciens messages', 'Salons textuels'],
    ['SEND_TTS_MESSAGES', 12, 'Messages en synthèse vocale', 'Salons textuels'],
    ['SEND_VOICE_MESSAGES', 46, 'Envoyer des messages vocaux', 'Salons textuels'],
    ['SEND_POLLS', 49, 'Créer des sondages', 'Salons textuels'],
    ['USE_APPLICATION_COMMANDS', 31, 'Utiliser les commandes', 'Salons textuels'],
    ['USE_EXTERNAL_APPS', 50, 'Utiliser des applis externes', 'Salons textuels'],
    ['CONNECT', 20, 'Se connecter', 'Vocal'],
    ['SPEAK', 21, 'Parler', 'Vocal'],
    ['STREAM', 9, "Vidéo et partage d'écran", 'Vocal'],
    ['USE_EMBEDDED_ACTIVITIES', 39, 'Utiliser les activités', 'Vocal'],
    ['USE_SOUNDBOARD', 42, 'Utiliser le soundboard', 'Vocal'],
    ['USE_EXTERNAL_SOUNDS', 45, 'Sons externes', 'Vocal'],
    ['USE_VAD', 25, 'Détection de la voix', 'Vocal'],
    ['PRIORITY_SPEAKER', 8, 'Voix prioritaire', 'Vocal'],
    ['MUTE_MEMBERS', 22, 'Rendre muet', 'Vocal'],
    ['DEAFEN_MEMBERS', 23, 'Mettre en sourdine', 'Vocal'],
    ['MOVE_MEMBERS', 24, 'Déplacer des membres', 'Vocal'],
    ['REQUEST_TO_SPEAK', 32, 'Demander la parole (conférences)', 'Vocal'],
    ['CREATE_EVENTS', 44, 'Créer des événements', 'Événements'],
    ['MANAGE_EVENTS', 33, 'Gérer les événements', 'Événements'],
    ['ADMINISTRATOR', 3, 'Administrateur (toutes les permissions)', 'Avancé'],
  ];
  const PERM = Object.fromEntries(PERMS.map(([k, bit, nom, groupe]) => [k, { bit: 1n << BigInt(bit), nom, groupe }]));
  const GROUPES = [...new Set(PERMS.map(p => p[3]))];
  const bitsDe = cles => (cles || []).reduce((t, k) => (PERM[k] ? t | PERM[k].bit : t), 0n);
  const TOUS_BITS = bitsDe(PERMS.map(p => p[0]));
  const clesDe = bits => PERMS.filter(([k]) => (bits & PERM[k].bit) === PERM[k].bit).map(p => p[0]);
  // Ce qu'un bouton de rôle ne doit jamais donner (le serveur le refuse aussi)
  const SENSIBLES = ['ADMINISTRATOR', 'KICK_MEMBERS', 'BAN_MEMBERS', 'MANAGE_CHANNELS', 'MANAGE_GUILD', 'VIEW_AUDIT_LOG', 'MANAGE_MESSAGES', 'MENTION_EVERYONE', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS', 'MOVE_MEMBERS', 'MANAGE_NICKNAMES', 'MANAGE_ROLES', 'MANAGE_WEBHOOKS', 'MANAGE_GUILD_EXPRESSIONS', 'MANAGE_EVENTS', 'MANAGE_THREADS', 'MODERATE_MEMBERS'];

  const BASE = ['VIEW_CHANNEL', 'CREATE_INSTANT_INVITE', 'CHANGE_NICKNAME', 'SEND_MESSAGES', 'SEND_MESSAGES_IN_THREADS', 'CREATE_PUBLIC_THREADS', 'EMBED_LINKS', 'ATTACH_FILES', 'ADD_REACTIONS', 'USE_EXTERNAL_EMOJIS', 'USE_EXTERNAL_STICKERS', 'READ_MESSAGE_HISTORY', 'SEND_VOICE_MESSAGES', 'SEND_POLLS', 'USE_APPLICATION_COMMANDS', 'USE_EXTERNAL_APPS', 'CONNECT', 'SPEAK', 'STREAM', 'USE_EMBEDDED_ACTIVITIES', 'USE_SOUNDBOARD', 'USE_EXTERNAL_SOUNDS', 'USE_VAD', 'REQUEST_TO_SPEAK'];
  const MODERATION = [...BASE, 'KICK_MEMBERS', 'BAN_MEMBERS', 'MODERATE_MEMBERS', 'MANAGE_MESSAGES', 'MANAGE_THREADS', 'MANAGE_NICKNAMES', 'VIEW_AUDIT_LOG', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS', 'MOVE_MEMBERS', 'MENTION_EVERYONE', 'PRIORITY_SPEAKER', 'CREATE_PRIVATE_THREADS'];
  const NIVEAUX = [
    ['admin', 'Administrateur', ['ADMINISTRATOR']],
    ['gestion', 'Gestion du serveur', [...MODERATION, 'MANAGE_CHANNELS', 'MANAGE_ROLES', 'MANAGE_GUILD', 'MANAGE_WEBHOOKS', 'MANAGE_GUILD_EXPRESSIONS', 'CREATE_GUILD_EXPRESSIONS', 'MANAGE_EVENTS', 'CREATE_EVENTS', 'VIEW_GUILD_INSIGHTS']],
    ['moderation', 'Modération', MODERATION],
    ['animation', 'Animation', [...BASE, 'MANAGE_EVENTS', 'CREATE_EVENTS', 'MENTION_EVERYONE', 'PRIORITY_SPEAKER', 'MOVE_MEMBERS']],
    ['membre', 'Membre (de base)', BASE],
    ['aucune', 'Aucune en plus', []],
  ];
  const niveauDe = cles => {
    const t = [...(cles || [])].sort().join();
    const n = NIVEAUX.find(([, , l]) => [...l].sort().join() === t);
    return n ? n[0] : 'perso';
  };
  const permsNiveau = id => [...(NIVEAUX.find(n => n[0] === id) || [, , []])[2]];

  /* ---------- Salons ---------- */
  const TYPES = {
    texte: { nom: 'Texte', icone: 'texte', discord: 0 },
    annonces: { nom: 'Annonces', icone: 'annonces', discord: 5, communaute: true, repli: 'texte' },
    forum: { nom: 'Forum', icone: 'forum', discord: 15, communaute: true, repli: 'texte' },
    vocal: { nom: 'Vocal', icone: 'vocal', discord: 2 },
    scene: { nom: 'Conférence', icone: 'scene', discord: 13, communaute: true, repli: 'vocal' },
  };
  const TYPE_DISCORD = { 0: 'texte', 5: 'annonces', 15: 'forum', 2: 'vocal', 13: 'scene' };
  const estVocal = t => t === 'vocal' || t === 'scene';
  const VOIR = [['tous', 'Tout le monde'], ['membres', 'Membres vérifiés'], ['nouveaux', 'Nouveaux seulement (pas encore vérifiés)'], ['staff', 'Staff seulement'], ['roles', 'Rôles choisis']];
  const ECRIRE = [['tous', 'Tous ceux qui voient'], ['staff', 'Staff seulement'], ['roles', 'Rôles choisis'], ['personne', 'Personne (lecture seule)']];
  const PARLER = [['tous', 'Tous ceux qui voient'], ['staff', 'Staff seulement'], ['roles', 'Rôles choisis'], ['personne', 'Personne (salon muet)']];
  const accesDefaut = () => ({ voir: 'tous', voirRoles: [], ecrire: 'tous', ecrireRoles: [] });
  // Discord met les noms des salons textuels en minuscules, avec des tirets
  const nomDiscord = (nom, type) => (estVocal(type) ? String(nom).trim() : String(nom).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}\p{Emoji_Presentation}\p{Extended_Pictographic}‍️・_-]/gu, '').replace(/-+/g, '-'));

  /* ---------- Modèles prêts à l'emploi ---------- */
  const role = (id, nom, couleur, niveau, opts = {}) => ({ id, nom, couleur, separe: false, mentionnable: false, perms: permsNiveau(niveau), groupe: '', ...opts });
  const salon = (id, nom, type = 'texte', opts = {}) => ({ id, nom, type, sujet: '', lent: 0, limite: 0, acces: null, ...opts });
  const cat = (id, nom, acces, salons) => ({ id, nom, acces: { ...accesDefaut(), ...acces }, salons });
  const embed = (titre, description, couleur, opts = {}) => ({ id: nouvelId('e'), titre, description, couleur, url: '', auteur: '', image: '', miniature: '', pied: '', horodatage: false, champs: [], ...opts });
  const btnRole = (texte, emoji, roleId, mode = 'b', style = 'gris') => ({ id: nouvelId('b'), type: 'role', texte, emoji, role: roleId, mode, style, url: '' });
  const REGLES = (accepte) => `Bienvenue ! Pour que tout le monde passe un bon moment, merci de respecter ces règles :

**1. Respect** — Pas d'insultes, de harcèlement ni de discrimination.
**2. Pas de spam** — Pas de flood, de pub ni de liens non sollicités.
**3. Contenu adapté** — Rien de choquant, de violent ou de NSFW.
**4. Les bons salons** — Chaque sujet a son salon : merci de les utiliser.
**5. Le staff** — Écoute les modérateurs. Un souci ? Contacte-les en message privé.
**6. Discord** — Les [conditions d'utilisation de Discord](https://discord.com/terms) s'appliquent aussi ici.

${accepte}`;
  const messageRegles = (salonId, roleId) => ({ id: nouvelId('m'), salon: salonId, contenu: '', mentions: false,
    embeds: [embed('📜 Règlement de {serveur}', REGLES('Clique sur le bouton ci-dessous pour accepter le règlement et accéder à tout le serveur.'), '#e8b46a', { pied: 'Le non-respect du règlement peut entraîner une sanction.' })],
    boutons: [btnRole("J'accepte le règlement", '✅', roleId, 'a', 'vert')] });
  const reglagesDefaut = (o = {}) => ({ verification: 1, notifications: 'mentions', filtre: 2, bienvenue: '', reglement: '', majs: '', communaute: false, afk: '', afkDelai: 300, ...o });
  const staff = (prefixe = '') => cat('c_staff', '🛡️ Staff', { voir: 'staff' }, [
    salon('s_staff', `🛡️・${prefixe}staff`), salon('s_logs', '📋・logs', 'texte', { acces: { ...accesDefaut(), voir: 'staff', ecrire: 'personne' } }), salon('v_staff', '🔊 Réunion staff', 'vocal'),
  ]);

  const MODELES = {
    communaute: {
      nom: 'Communauté', resume: 'Serveur de discussion : accueil avec règlement à accepter, notifications à choisir, salons de discussion et vocaux, espace staff.',
      creer: () => ({
        everyone: [...BASE],
        roles: [
          role('r_fondateur', 'Fondateur', '#e8b46a', 'admin', { separe: true, groupe: 'staff' }),
          role('r_modo', 'Modérateur', '#5b8def', 'moderation', { separe: true, mentionnable: true, groupe: 'staff' }),
          role('r_anim', 'Animateur', '#c3a6ff', 'animation', { separe: true, groupe: 'staff' }),
          role('r_bots', 'Bots', '#9ba3ba', 'aucune'),
          role('r_membre', 'Membre', '#3ddc84', 'aucune', { groupe: 'membre' }),
          role('r_notif_annonces', '🔔 Annonces', '', 'aucune', { mentionnable: true }),
          role('r_notif_events', '🎉 Événements', '', 'aucune', { mentionnable: true }),
        ],
        libres: [],
        categories: [
          cat('c_accueil', '📌 Accueil', { voir: 'tous', ecrire: 'staff' }, [
            salon('s_bienvenue', '👋・bienvenue'), salon('s_reglement', '📜・règlement'), salon('s_annonces', '📣・annonces', 'annonces'), salon('s_roles', '🎭・rôles'),
          ]),
          cat('c_communaute', '💬 Communauté', { voir: 'membres' }, [
            salon('s_general', '💬・général', 'texte', { sujet: 'Discussion libre, dans le respect du règlement.' }),
            salon('s_presentations', '🙋・présentations', 'texte', { sujet: 'Présente-toi en quelques mots !', lent: 60 }),
            salon('s_medias', '📸・médias'),
            salon('s_suggestions', '💡・suggestions', 'forum', { sujet: 'Une idée pour le serveur ? Propose-la ici.' }),
            salon('s_commandes', '🤖・commandes'),
          ]),
          cat('c_vocal', '🔊 Vocal', { voir: 'membres' }, [
            salon('v_discussion', '🔊 Discussion', 'vocal'), salon('v_jeux', '🎮 Jeux', 'vocal'), salon('v_musique', '🎧 Musique', 'vocal'),
            salon('v_afk', '💤 AFK', 'vocal', { acces: { ...accesDefaut(), voir: 'membres', ecrire: 'personne' } }),
          ]),
          staff(),
        ],
        messages: [
          { id: nouvelId('m'), salon: 's_bienvenue', contenu: '', mentions: false, boutons: [],
            embeds: [embed('👋 Bienvenue sur {serveur} !', 'Ravi de te voir ici ! Pour bien commencer :\n\n📜 Lis le règlement dans {salon:s_reglement} et accepte-le pour débloquer le serveur.\n🎭 Choisis tes notifications dans {salon:s_roles}.\n💬 Viens dire bonjour dans {salon:s_general} !', '#e07a4c')] },
          messageRegles('s_reglement', 'r_membre'),
          { id: nouvelId('m'), salon: 's_roles', contenu: '', mentions: false,
            embeds: [embed('🎭 Choisis tes notifications', 'Clique sur un bouton pour recevoir ou retirer le rôle.\n\n🔔 {role:r_notif_annonces} : les annonces importantes\n🎉 {role:r_notif_events} : les événements du serveur', '#c3a6ff')],
            boutons: [btnRole('Annonces', '🔔', 'r_notif_annonces'), btnRole('Événements', '🎉', 'r_notif_events')] },
        ],
        reglages: reglagesDefaut({ bienvenue: 's_general', reglement: 's_reglement', majs: 's_staff', afk: 'v_afk' }),
      }),
    },
    createur: {
      nom: 'Créateur de contenu', resume: 'Pour un streamer ou un influenceur : annonces des lives, clips et fan-art, espace VIP, notifications de live à choisir.',
      creer: () => ({
        everyone: [...BASE],
        roles: [
          role('r_createur', 'Créateur', '#e07a4c', 'admin', { separe: true, groupe: 'staff' }),
          role('r_modo', 'Modérateur', '#5b8def', 'moderation', { separe: true, mentionnable: true, groupe: 'staff' }),
          role('r_vip', 'VIP', '#ffd166', 'aucune', { separe: true }),
          role('r_abonne', 'Abonné', '#c3a6ff', 'aucune', { separe: true }),
          role('r_membre', 'Membre', '#3ddc84', 'aucune', { groupe: 'membre' }),
          role('r_live', '🔴 Notif live', '', 'aucune', { mentionnable: true }),
          role('r_notif_annonces', '🔔 Annonces', '', 'aucune', { mentionnable: true }),
        ],
        libres: [],
        categories: [
          cat('c_infos', '📌 Infos', { voir: 'tous', ecrire: 'staff' }, [
            salon('s_bienvenue', '👋・bienvenue'), salon('s_reglement', '📜・règlement'), salon('s_annonces', '📣・annonces', 'annonces'),
            salon('s_lives', '🔴・lives', 'annonces', { sujet: 'Chaque live est annoncé ici.' }), salon('s_planning', '📅・planning'), salon('s_roles', '🎭・rôles'),
          ]),
          cat('c_communaute', '💬 Communauté', { voir: 'membres' }, [
            salon('s_general', '💬・général'), salon('s_clips', '🎬・clips', 'texte', { sujet: 'Partage tes meilleurs moments des lives !' }),
            salon('s_fanart', '🎨・fan-art'), salon('s_suggestions', '💡・suggestions', 'forum', { sujet: 'Des idées de contenu ? Propose-les ici.' }), salon('s_commandes', '🤖・commandes'),
          ]),
          cat('c_vip', '⭐ VIP', { voir: 'roles', voirRoles: ['r_vip', 'r_abonne', 'r_modo'] }, [salon('s_vip', '⭐・vip-lounge'), salon('v_vip', '⭐ Vocal VIP', 'vocal')]),
          cat('c_vocal', '🔊 Vocal', { voir: 'membres' }, [
            salon('v_discussion', '🔊 Discussion', 'vocal'), salon('v_jeux', '🎮 Jeux entre viewers', 'vocal'), salon('v_scene', '🎙️ Scène', 'scene'),
          ]),
          staff(),
        ],
        messages: [
          { id: nouvelId('m'), salon: 's_bienvenue', contenu: '', mentions: false, boutons: [],
            embeds: [embed('👋 Bienvenue dans la commu !', 'Content de te voir ici 💜\n\n📜 Accepte le règlement dans {salon:s_reglement} pour débloquer le serveur.\n🔴 Les lives sont annoncés dans {salon:s_lives}.\n🎭 Active les notifications dans {salon:s_roles} pour ne rien rater.', '#e07a4c')] },
          messageRegles('s_reglement', 'r_membre'),
          { id: nouvelId('m'), salon: 's_roles', contenu: '', mentions: false,
            embeds: [embed('🎭 Ne rate rien', 'Choisis ce dont tu veux être prévenu (clique à nouveau pour retirer) :\n\n🔴 {role:r_live} : quand le live commence\n🔔 {role:r_notif_annonces} : les annonces importantes', '#ff6b8b')],
            boutons: [btnRole('Me prévenir des lives', '🔴', 'r_live', 'b', 'rouge'), btnRole('Annonces', '🔔', 'r_notif_annonces')] },
          { id: nouvelId('m'), salon: 's_lives', contenu: '', mentions: false, boutons: [],
            embeds: [embed('🔴 Les lives', 'Chaque live est annoncé ici. Prends le rôle {role:r_live} dans {salon:s_roles} pour recevoir une notification.', '#ff6b8b')] },
        ],
        reglages: reglagesDefaut({ bienvenue: 's_general', reglement: 's_reglement', majs: 's_staff' }),
      }),
    },
    gaming: {
      nom: 'Gaming', resume: 'Serveur de jeux : rôles par jeu à choisir, recherche de joueurs, tournois, vocaux Duo et Squad.',
      creer: () => {
        const jeux = [['r_valorant', 'Valorant', '#ff4655', '🔫', 's_valorant'], ['r_lol', 'League of Legends', '#c89b3c', '⚔️', 's_lol'], ['r_minecraft', 'Minecraft', '#62b47a', '⛏️', 's_minecraft'], ['r_fortnite', 'Fortnite', '#9d4dbb', '🏗️', 's_fortnite'], ['r_rl', 'Rocket League', '#1a8fff', '🚗', 's_rl']];
        return {
          everyone: [...BASE],
          roles: [
            role('r_admin', 'Admin', '#ff6b8b', 'admin', { separe: true, groupe: 'staff' }),
            role('r_modo', 'Modérateur', '#5b8def', 'moderation', { separe: true, mentionnable: true, groupe: 'staff' }),
            role('r_orga', 'Organisateur', '#ffd166', 'animation', { separe: true, groupe: 'staff' }),
            role('r_joueur', 'Joueur', '#3ddc84', 'aucune', { groupe: 'membre' }),
            ...jeux.map(([id, nom, couleur]) => role(id, nom, couleur, 'aucune', { mentionnable: true })),
          ],
          libres: [],
          categories: [
            cat('c_accueil', '📌 Accueil', { voir: 'tous', ecrire: 'staff' }, [salon('s_bienvenue', '👋・bienvenue'), salon('s_reglement', '📜・règlement'), salon('s_annonces', '📣・annonces', 'annonces'), salon('s_roles', '🎮・choisis-tes-jeux')]),
            cat('c_general', '💬 Général', { voir: 'membres' }, [
              salon('s_general', '💬・général'), salon('s_clips', '🎬・clips'), salon('s_lfg', '🔎・recherche-de-joueurs', 'texte', { sujet: 'Cherche des coéquipiers : jeu, rang, disponibilités.', lent: 30 }), salon('s_commandes', '🤖・commandes'),
            ]),
            cat('c_jeux', '🎮 Jeux', { voir: 'membres' }, jeux.map(([, nom, , emoji, sid]) => salon(sid, `${emoji}・${nom.toLowerCase().replace(/ /g, '-')}`))),
            cat('c_tournois', '🏆 Tournois', { voir: 'membres', ecrire: 'staff' }, [
              salon('s_tournois', '🏆・annonces-tournois'), salon('s_inscriptions', '📝・inscriptions', 'texte', { acces: { ...accesDefaut(), voir: 'membres' } }),
            ]),
            cat('c_vocal', '🔊 Vocal', { voir: 'membres' }, [
              salon('v_partie1', '🎮 Partie 1', 'vocal'), salon('v_partie2', '🎮 Partie 2', 'vocal'), salon('v_duo', '👥 Duo', 'vocal', { limite: 2 }), salon('v_squad', '👥 Squad', 'vocal', { limite: 5 }),
              salon('v_afk', '💤 AFK', 'vocal', { acces: { ...accesDefaut(), voir: 'membres', ecrire: 'personne' } }),
            ]),
            staff(),
          ],
          messages: [
            { id: nouvelId('m'), salon: 's_bienvenue', contenu: '', mentions: false, boutons: [],
              embeds: [embed('🎮 Bienvenue sur {serveur} !', 'GG, tu es arrivé ! Pour commencer :\n\n📜 Accepte le règlement dans {salon:s_reglement}.\n🎮 Choisis tes jeux dans {salon:s_roles} pour trouver des coéquipiers.\n🔎 Cherche des joueurs dans {salon:s_lfg}.', '#1a8fff')] },
            messageRegles('s_reglement', 'r_joueur'),
            { id: nouvelId('m'), salon: 's_roles', contenu: '', mentions: false,
              embeds: [embed('🎮 Choisis tes jeux', 'Clique sur tes jeux pour recevoir le rôle (et être mentionné pour les parties). Clique à nouveau pour le retirer.', '#3ddc84')],
              boutons: jeux.map(([id, nom, , emoji]) => btnRole(nom, emoji, id)) },
          ],
          reglages: reglagesDefaut({ bienvenue: 's_general', reglement: 's_reglement', majs: 's_staff', afk: 'v_afk' }),
        };
      },
    },
    vierge: {
      nom: 'Serveur simple', resume: 'Le minimum bien fait : admin, modérateur, membre, un accueil, un salon général et un vocal.',
      creer: () => ({
        everyone: [...BASE],
        roles: [role('r_admin', 'Admin', '#e8b46a', 'admin', { separe: true, groupe: 'staff' }), role('r_modo', 'Modérateur', '#5b8def', 'moderation', { separe: true, groupe: 'staff' }), role('r_membre', 'Membre', '#3ddc84', 'aucune', { groupe: 'membre' })],
        libres: [],
        categories: [
          cat('c_accueil', '📌 Accueil', { voir: 'tous', ecrire: 'staff' }, [salon('s_reglement', '📜・règlement'), salon('s_annonces', '📣・annonces', 'annonces')]),
          cat('c_general', '💬 Général', { voir: 'membres' }, [salon('s_general', '💬・général'), salon('v_general', '🔊 Vocal', 'vocal')]),
          staff(),
        ],
        messages: [messageRegles('s_reglement', 'r_membre')],
        reglages: reglagesDefaut({ bienvenue: 's_general', reglement: 's_reglement', majs: 's_staff' }),
      }),
    },
  };
  function nouveauModele(type, nom) {
    const base = MODELES[type] || MODELES.vierge;
    const instant = new Date().toISOString();
    return { id: nouvelId('mod'), nom: nom || base.nom, description: base.resume, ...base.creer(), cree: instant, modifie: instant };
  }

  /* ---------- État ---------- */
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
    messageConnexion = { refuse: "Ce compte Discord n'a pas accès à l'atelier.", annule: 'Connexion annulée.', etat: 'La connexion a pris trop de temps. Réessaie.', discord: "Discord n'a pas répondu. Réessaie." }[fragment.get('erreur')] || '';
    history.replaceState(null, '', location.pathname + location.search);
  }
  const etat = {
    session: lireSession(stock.lire(STOCK.session, '') || ''),
    sha: null,
    modeles: [],
    aEnregistrer: new Set(),
    aSupprimer: new Set(),
    id: null, // modèle ouvert
    vue: 'modele', // modele | envoyer | importer | accueil
    onglet: 'roles',
    ouverts: new Set(), // rôles / salons dépliés
    message: null, // message déplié dans l'onglet Messages
    guildes: null,
    serveurs: new Map(), // détails des serveurs déjà chargés
  };
  const modele = () => etat.modeles.find(m => m.id === etat.id) || null;

  /* ---------- Serveur de l'agenda ---------- */
  class ErreurAtelier extends Error {
    constructor(message, status, attente) { super(message); this.status = status; this.attente = attente; }
  }
  async function api(chemin, options = {}) {
    let rep;
    try {
      rep = await fetch(SERVEUR + chemin, {
        ...options, cache: 'no-store',
        headers: { Authorization: `Bearer ${etat.session ? etat.session.jeton : ''}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
      });
    } catch (e) {
      throw new ErreurAtelier("Impossible de joindre le serveur. Vérifie ta connexion.", 0);
    }
    const corps = await rep.json().catch(() => ({}));
    if (rep.status === 401) { deconnecter('Ta session a expiré. Reconnecte-toi avec Discord.'); throw new ErreurAtelier('Session expirée.', 401); }
    if (!rep.ok) throw new ErreurAtelier(corps.message || `Le serveur a répondu ${rep.status}.`, rep.status, corps.attente);
    return corps;
  }
  const b64 = {
    encoder(s) { const o = new TextEncoder().encode(s); let b = ''; for (let i = 0; i < o.length; i += 0x8000) b += String.fromCharCode(...o.subarray(i, i + 0x8000)); return btoa(b); },
    decoder: s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0))),
  };
  async function lireFichier() {
    try {
      const r = await api(`/depot/contents/${FICHIER}?ref=main`);
      const d = JSON.parse(b64.decoder(r.content));
      return { donnees: { format: 1, ...d, modeles: Array.isArray(d.modeles) ? d.modeles : [] }, sha: r.sha };
    } catch (e) {
      if (e.status === 404) return { donnees: { format: 1, modeles: [] }, sha: null };
      throw e;
    }
  }
  async function ecrireFichier(donnees, sha, message) {
    const corps = { message, content: b64.encoder(`${JSON.stringify(donnees, null, 2)}\n`), ...(sha ? { sha, branch: 'main' } : {}) };
    try {
      const r = await api(`/depot/contents/${FICHIER}`, { method: 'PUT', body: JSON.stringify(corps) });
      return { sha: r.content.sha };
    } catch (e) {
      if (e.status === 409 || e.status === 422) return { conflit: true };
      throw e;
    }
  }
  function statut(s, detail) {
    const el = $('#synchro');
    el.dataset.etat = s;
    $('span', el).textContent = { ok: 'Enregistré', envoi: 'Enregistrement…', modifie: 'Enregistrer', erreur: 'Erreur' }[s];
    el.title = detail || { ok: 'Tes modèles sont enregistrés dans ton dépôt privé.', envoi: 'Enregistrement sur GitHub…', modifie: 'Modifications pas encore enregistrées (Ctrl+S).', erreur: "L'enregistrement a échoué. Clique pour réessayer." }[s];
  }
  // Une copie locale protège ce qui n'est pas encore enregistré (onglet fermé, réseau coupé)
  const garderBrouillon = () => stock.ecrire(STOCK.brouillon, { modeles: etat.modeles, aEnregistrer: [...etat.aEnregistrer], aSupprimer: [...etat.aSupprimer] });
  function changer(id = etat.id) {
    const m = etat.modeles.find(x => x.id === id);
    if (m) m.modifie = new Date().toISOString();
    etat.aEnregistrer.add(id);
    garderBrouillon();
    statut('modifie');
    clearTimeout(changer.minuterie);
    changer.minuterie = setTimeout(() => enregistrer(), 4000);
  }
  let enCours = null;
  async function enregistrer() {
    clearTimeout(changer.minuterie);
    if (enCours) { await enCours; if (!etat.aEnregistrer.size && !etat.aSupprimer.size) return true; }
    if (!etat.aEnregistrer.size && !etat.aSupprimer.size) { statut('ok'); return true; }
    enCours = (async () => {
      statut('envoi');
      const ids = new Set(etat.aEnregistrer);
      const suppr = new Set(etat.aSupprimer);
      const noms = [...ids].map(id => (etat.modeles.find(m => m.id === id) || {}).nom).filter(Boolean);
      try {
        for (let essai = 0; essai < 4; essai++) {
          const { donnees, sha } = await lireFichier();
          let liste = donnees.modeles.filter(m => !suppr.has(m.id));
          for (const id of ids) {
            const m = etat.modeles.find(x => x.id === id);
            if (!m) continue;
            const k = liste.findIndex(x => x.id === id);
            if (k >= 0) liste[k] = clone(m); else liste.push(clone(m));
          }
          const message = noms.length === 1 ? `Atelier : modèle « ${noms[0]} » enregistré` : suppr.size && !ids.size ? 'Atelier : modèle supprimé' : 'Atelier : modèles enregistrés';
          const res = await ecrireFichier({ ...donnees, format: 1, modeles: liste }, sha, message.slice(0, 200));
          if (res.conflit) continue;
          etat.sha = res.sha;
          ids.forEach(id => etat.aEnregistrer.delete(id));
          suppr.forEach(id => etat.aSupprimer.delete(id));
          // Garde l'ordre local, ajoute ce qui vient d'un autre appareil
          const locaux = new Set(etat.modeles.map(m => m.id));
          liste.filter(m => !locaux.has(m.id) && !etat.aSupprimer.has(m.id)).forEach(m => etat.modeles.push(m));
          garderBrouillon();
          statut(etat.aEnregistrer.size ? 'modifie' : 'ok');
          rendreCote();
          return true;
        }
        throw new ErreurAtelier('Le fichier a changé plusieurs fois en même temps. Réessaie.');
      } catch (e) {
        statut('erreur', e.message);
        toast(`Enregistrement impossible : ${e.message}`);
        return false;
      }
    })();
    try { return await enCours; } finally { enCours = null; }
  }

  /* ---------- Connexion ---------- */
  const app = $('#app');
  const ecranConnexion = $('#connexion');
  function montrerConnexion(message) {
    app.hidden = true;
    ecranConnexion.hidden = false;
    ecranConnexion.classList.remove('is-chargement');
    $('#c-erreur').textContent = message || '';
    $('#c-discord').href = `${SERVEUR}/connexion?vers=atelier`;
    if (!SERVEUR) $('#c-erreur').textContent = "L'adresse du serveur manque dans agenda/config.js.";
  }
  function deconnecter(message) {
    stock.effacer(STOCK.session);
    etat.session = null;
    montrerConnexion(message);
  }
  async function demarrer() {
    if (!etat.session) { montrerConnexion(messageConnexion); return; }
    ecranConnexion.hidden = false;
    ecranConnexion.classList.add('is-chargement');
    try {
      const { donnees, sha } = await lireFichier();
      etat.sha = sha;
      etat.modeles = donnees.modeles;
      // Modifications pas encore enregistrées lors de la dernière visite
      const b = stock.lire(STOCK.brouillon, null);
      if (b && ((b.aEnregistrer || []).length || (b.aSupprimer || []).length)) {
        (b.aSupprimer || []).forEach(id => { etat.aSupprimer.add(id); etat.modeles = etat.modeles.filter(m => m.id !== id); });
        (b.aEnregistrer || []).forEach(id => {
          const m = (b.modeles || []).find(x => x.id === id);
          if (!m) return;
          const k = etat.modeles.findIndex(x => x.id === id);
          if (k >= 0) etat.modeles[k] = m; else etat.modeles.push(m);
          etat.aEnregistrer.add(id);
        });
        if (etat.aEnregistrer.size || etat.aSupprimer.size) { toast('Tes dernières modifications ont été récupérées.'); enregistrer(); }
      }
      ecranConnexion.hidden = true;
      app.hidden = false;
      const dernier = stock.lire(STOCK.dernier, null);
      etat.id = (etat.modeles.find(m => m.id === dernier) || etat.modeles[0] || {}).id || null;
      etat.vue = etat.id ? 'modele' : 'accueil';
      statut(etat.aEnregistrer.size ? 'modifie' : 'ok');
      rendreTout();
    } catch (e) {
      if (e.status === 401) return;
      montrerConnexion(e.message);
    }
  }

  /* ---------- Rendu : côté et en-tête ---------- */
  function rendreTout() { rendreCote(); rendreMain(); }
  function rendreCote() {
    $('#modeles').innerHTML = etat.modeles.length ? etat.modeles.map(m => `<li><button type="button" class="at-modele${etat.vue === 'modele' && m.id === etat.id ? ' is-actif' : ''}" data-ouvrir="${esc(m.id)}">`
      + `<span class="at-modele-ic">${esc((m.nom || '?').trim().charAt(0).toUpperCase())}</span><span><b>${esc(m.nom || 'Sans nom')}</b><small>${m.roles.length} rôles · ${nbSalons(m)} salons${etat.aEnregistrer.has(m.id) ? ' · non enregistré' : ''}</small></span></button></li>`).join('')
      : '<li class="at-modeles-vide">Pas encore de modèle.</li>';
    $$('[data-outil]').forEach(b => b.classList.toggle('is-actif', etat.vue === b.dataset.outil));
  }
  const nbSalons = m => m.libres.length + m.categories.reduce((t, c) => t + c.salons.length, 0);
  const tousSalons = m => [...m.libres.map(s => ({ s, c: null })), ...m.categories.flatMap(c => c.salons.map(s => ({ s, c })))];
  const salonDe = (m, id) => (tousSalons(m).find(x => x.s.id === id) || {}).s || null;
  const roleDe = (m, id) => m.roles.find(r => r.id === id) || null;

  function rendreMain() {
    const main = $('#main');
    if (etat.vue === 'envoyer') { rendreEnvoyer(main); return; }
    if (etat.vue === 'importer') { rendreImporter(main); return; }
    const m = modele();
    if (!m) { rendreAccueil(main); return; }
    stock.ecrire(STOCK.dernier, m.id);
    const onglets = [['roles', 'Rôles', m.roles.length], ['salons', 'Salons', nbSalons(m)], ['messages', 'Messages', m.messages.length], ['reglages', 'Réglages', '']];
    main.innerHTML = `<div class="at-tete"><div class="at-titre"><input class="at-nom" id="m-nom" value="${esc(m.nom)}" maxlength="60" aria-label="Nom du modèle" autocomplete="off">`
      + `<input class="at-desc" id="m-desc" value="${esc(m.description || '')}" maxlength="200" placeholder="Description (pour toi)" aria-label="Description" autocomplete="off"></div>`
      + `<div class="at-actions"><button type="button" class="icone-btn" data-m="dupliquer" title="Dupliquer" aria-label="Dupliquer le modèle">${icone('copie')}</button>`
      + `<button type="button" class="icone-btn icone-btn--danger" data-m="supprimer" title="Supprimer" aria-label="Supprimer le modèle">${icone('corbeille')}</button>`
      + `<button type="button" class="btn btn--primaire" data-m="appliquer">${icone('fusee')}Appliquer à un serveur</button></div></div>`
      + `<nav class="at-onglets" role="tablist">${onglets.map(([id, nom, n]) => `<button type="button" role="tab" aria-selected="${etat.onglet === id}" data-onglet="${id}">${nom}${n !== '' ? ` <small>${n}</small>` : ''}</button>`).join('')}</nav>`
      + `<section class="at-panneau" id="panneau"></section>`;
    rendrePanneau();
  }
  function rendrePanneau() {
    const m = modele();
    const p = $('#panneau');
    if (!m || !p) return;
    if (etat.onglet === 'roles') p.innerHTML = `<div class="at-deux"><div>${panneauRoles(m)}</div>${apercuServeur(m)}</div>`;
    else if (etat.onglet === 'salons') p.innerHTML = `<div class="at-deux"><div>${panneauSalons(m)}</div>${apercuServeur(m)}</div>`;
    else if (etat.onglet === 'messages') p.innerHTML = panneauMessages(m);
    else p.innerHTML = panneauReglages(m);
    $$('.at-onglets [data-onglet]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.onglet === etat.onglet)));
  }
  function majCompteurs() {
    const m = modele();
    if (!m) return;
    const n = { roles: m.roles.length, salons: nbSalons(m), messages: m.messages.length };
    $$('.at-onglets [data-onglet]').forEach(b => { const s = $('small', b); if (s && n[b.dataset.onglet] !== undefined) s.textContent = n[b.dataset.onglet]; });
    const ap = $('.at-apercu');
    if (ap) ap.outerHTML = apercuServeur(m);
  }

  function rendreAccueil(main) {
    main.innerHTML = `<div class="vide at-accueil"><span class="vide-icone">${icone('atelier')}</span><h3>Construis ton premier serveur</h3>`
      + `<p>Pars d'un modèle prêt à l'emploi (communauté, créateur de contenu, gaming…) ou copie un serveur que tu as déjà fait, puis adapte-le.</p>`
      + `<div class="r-boutons"><button type="button" class="btn btn--primaire" data-action="nouveau">${icone('plus')}Nouveau modèle</button><button type="button" class="btn btn--ghost" data-outil="importer">${icone('importer')}Copier un serveur</button></div></div>`;
  }

  /* ---------- Aperçu façon Discord (liste des salons et des rôles) ---------- */
  function accesTexte(a, m, type) {
    if (!a) return 'Comme la catégorie';
    const noms = ids => ids.map(id => (roleDe(m, id) || {}).nom).filter(Boolean).join(', ') || 'aucun rôle';
    const voir = { tous: 'Tout le monde', membres: 'Membres', nouveaux: 'Nouveaux', staff: 'Staff', roles: noms(a.voirRoles || []) }[a.voir] || 'Tout le monde';
    const ecrire = { tous: '', staff: estVocal(type) ? ' · parole : staff' : ' · écriture : staff', roles: ` · ${estVocal(type) ? 'parole' : 'écriture'} : ${noms(a.ecrireRoles || [])}`, personne: estVocal(type) ? ' · muet' : ' · lecture seule' }[a.ecrire] || '';
    return voir + ecrire;
  }
  const restreint = a => !!a && (a.voir !== 'tous' || a.ecrire !== 'tous');
  function apercuServeur(m) {
    const ligne = (s, c) => {
      const a = s.perms ? { voir: 'roles' } : s.acces || (c && (c.perms ? { voir: 'roles' } : c.acces));
      const verrou = a && a.voir && a.voir !== 'tous';
      return `<li class="d-salon${estVocal(s.type) ? ' is-vocal' : ''}">${icone(TYPES[s.type] ? TYPES[s.type].icone : 'texte')}<span>${esc(nomDiscord(s.nom, s.type) || 'salon')}</span>${verrou ? icone('cadenas', 'i d-verrou') : ''}</li>`;
    };
    return `<aside class="at-apercu" aria-label="Aperçu dans Discord"><div class="d-serveur"><b>${esc(m.nom || 'Serveur')}</b>${icone('bas')}</div>`
      + `<ul class="d-salons">${m.libres.map(s => ligne(s, null)).join('')}${m.categories.map(c => `<li class="d-cat">${icone('bas')}<span>${esc((c.nom || 'catégorie').toUpperCase())}</span></li>${c.salons.map(s => ligne(s, c)).join('')}`).join('')}</ul>`
      + `<div class="d-roles"><small>RÔLES</small>${m.roles.map(r => `<span style="--c:${couleurSure(r.couleur) || '#b5bac1'}"><i></i>${esc(r.nom || 'rôle')}</span>`).join('')}</div></aside>`;
  }

  /* ---------- Onglet Rôles ---------- */
  function panneauRoles(m) {
    const groupe = r => (r.groupe === 'staff' ? '<em class="at-badge" style="--c:#5b8def">Staff</em>' : r.groupe === 'membre' ? '<em class="at-badge" style="--c:#3ddc84">Membre vérifié</em>' : '');
    const grille = (perms, attr) => GROUPES.map(g => `<fieldset class="at-perms-groupe"><legend>${g}</legend>${PERMS.filter(p => p[3] === g).map(([k, , nom]) => `<label class="at-case${k === 'ADMINISTRATOR' ? ' is-danger' : ''}"><input type="checkbox" ${attr}="${k}"${perms.includes(k) ? ' checked' : ''}><span>${esc(nom)}</span></label>`).join('')}</fieldset>`).join('');
    const ligne = (r, k) => {
      const ouvert = etat.ouverts.has(r.id);
      const niveau = niveauDe(r.perms);
      return `<li class="at-role${ouvert ? ' is-ouvert' : ''}" data-role="${esc(r.id)}">`
        + `<div class="at-ligne"><span class="at-ordre"><button type="button" class="icone-btn" data-r="monter" aria-label="Monter"${k ? '' : ' disabled'}>${icone('haut')}</button><button type="button" class="icone-btn" data-r="descendre" aria-label="Descendre"${k < m.roles.length - 1 ? '' : ' disabled'}>${icone('bas')}</button></span>`
        + `<label class="at-couleur" style="--c:${couleurSure(r.couleur) || '#b5bac1'}" title="Couleur"><input type="color" value="${couleurSure(r.couleur) || '#b5bac1'}" data-r-champ="couleur" aria-label="Couleur du rôle"></label>`
        + `<input class="at-champ-nom" value="${esc(r.nom)}" maxlength="100" data-r-champ="nom" aria-label="Nom du rôle" placeholder="Nom du rôle">`
        + `${groupe(r)}<select class="at-select" data-r-champ="niveau" aria-label="Permissions">${NIVEAUX.map(([id, nom]) => `<option value="${id}"${niveau === id ? ' selected' : ''}>${nom}</option>`).join('')}${niveau === 'perso' ? '<option value="perso" selected>Personnalisé</option>' : ''}</select>`
        + `<button type="button" class="icone-btn" data-r="ouvrir" aria-expanded="${ouvert}" aria-label="Détails du rôle">${icone(ouvert ? 'haut' : 'reglages')}</button>`
        + `<button type="button" class="icone-btn icone-btn--danger" data-r="supprimer" aria-label="Supprimer le rôle">${icone('corbeille')}</button></div>`
        + (ouvert ? `<div class="at-details"><div class="at-options">`
          + `<label class="champ"><span>Rôle utilisé pour l'accès aux salons</span><select data-r-champ="groupe"><option value="">Aucun</option><option value="staff"${r.groupe === 'staff' ? ' selected' : ''}>Staff (voit les salons « Staff »)</option><option value="membre"${r.groupe === 'membre' ? ' selected' : ''}>Membre vérifié (voit les salons « Membres »)</option></select></label>`
          + `<label class="interrupteur"><input type="checkbox" data-r-champ="separe"${r.separe ? ' checked' : ''}><span aria-hidden="true"></span>Afficher à part dans la liste des membres</label>`
          + `<label class="interrupteur"><input type="checkbox" data-r-champ="mentionnable"${r.mentionnable ? ' checked' : ''}><span aria-hidden="true"></span>Tout le monde peut le mentionner</label></div>`
          + (r.perms.includes('ADMINISTRATOR') ? `<p class="at-alerte">${icone('alerte')}Administrateur donne <b>toutes</b> les permissions, partout. À réserver aux personnes de confiance.</p>` : '')
          + `<div class="at-perms">${grille(r.perms, 'data-r-perm')}</div></div>` : '')
        + '</li>';
    };
    const ouvertEv = etat.ouverts.has('@everyone');
    return `<div class="at-section-tete"><div><h2>Rôles</h2><p class="r-aide">Du plus important au moins important. Le rôle du bot doit rester au-dessus des rôles qu'il distribue : ceux créés par l'atelier le sont automatiquement.</p></div>`
      + `<button type="button" class="btn btn--ghost btn--petit" data-r="ajouter">${icone('plus')}Ajouter un rôle</button></div>`
      + `<ul class="at-liste">${m.roles.map(ligne).join('')}</ul>`
      + `<div class="at-role at-everyone${ouvertEv ? ' is-ouvert' : ''}"><div class="at-ligne"><span class="at-couleur" style="--c:#b5bac1"></span><b class="at-champ-nom">@everyone <small>tout le monde, y compris les nouveaux</small></b>`
      + `<span class="at-resume">${m.everyone.length} permissions</span><button type="button" class="icone-btn" data-r="everyone" aria-expanded="${ouvertEv}" aria-label="Permissions de @everyone">${icone(ouvertEv ? 'haut' : 'reglages')}</button></div>`
      + (ouvertEv ? `<div class="at-details"><p class="r-aide">Ce que chacun peut faire par défaut. Les salons réservés (membres, staff) se règlent dans l'onglet Salons.</p><div class="r-boutons"><button type="button" class="btn btn--ghost btn--petit" data-r="everyone-base">Permissions de base</button></div><div class="at-perms">${grille(m.everyone, 'data-e-perm')}</div></div>` : '')
      + '</div>';
  }

  /* ---------- Onglet Salons ---------- */
  function editeurAcces(a, m, type, cible) {
    const voix = estVocal(type);
    const cases = (champ, ids) => `<div class="at-roles-choix">${m.roles.map(r => `<label class="choix" style="--c:${couleurSure(r.couleur) || '#b5bac1'}"><input type="checkbox" data-acces-role="${champ}" value="${esc(r.id)}"${ids.includes(r.id) ? ' checked' : ''}><span>${esc(r.nom)}</span></label>`).join('')}</div>`;
    return `<div class="at-acces" data-acces="${esc(cible)}">`
      + `<label class="champ"><span>Qui voit ${voix ? 'et rejoint ' : ''}?</span><select data-acces-champ="voir">${VOIR.map(([v, t]) => `<option value="${v}"${a.voir === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`
      + (a.voir === 'roles' ? cases('voirRoles', a.voirRoles || []) : '')
      + `<label class="champ"><span>${voix ? 'Qui peut parler ?' : 'Qui peut écrire ?'}</span><select data-acces-champ="ecrire">${(voix ? PARLER : ECRIRE).map(([v, t]) => `<option value="${v}"${a.ecrire === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`
      + (a.ecrire === 'roles' ? cases('ecrireRoles', a.ecrireRoles || []) : '')
      + '</div>';
  }
  function panneauSalons(m) {
    const ligneSalon = (s, c, k, n) => {
      const ouvert = etat.ouverts.has(s.id);
      const a = s.acces;
      return `<li class="at-salon${ouvert ? ' is-ouvert' : ''}" data-salon="${esc(s.id)}">`
        + `<div class="at-ligne"><span class="at-ordre"><button type="button" class="icone-btn" data-s="monter" aria-label="Monter"${k ? '' : ' disabled'}>${icone('haut')}</button><button type="button" class="icone-btn" data-s="descendre" aria-label="Descendre"${k < n - 1 ? '' : ' disabled'}>${icone('bas')}</button></span>`
        + `<label class="at-type" title="Type de salon">${icone(TYPES[s.type].icone)}<select data-s-champ="type" aria-label="Type de salon">${Object.entries(TYPES).map(([t, x]) => `<option value="${t}"${s.type === t ? ' selected' : ''}>${x.nom}</option>`).join('')}</select></label>`
        + `<input class="at-champ-nom" value="${esc(s.nom)}" maxlength="100" data-s-champ="nom" aria-label="Nom du salon" placeholder="nom-du-salon">`
        + `<button type="button" class="at-puce${s.perms ? ' is-avance' : restreint(a) ? ' is-restreint' : ''}" data-s="ouvrir">${s.perms ? 'Permissions copiées' : esc(accesTexte(a, m, s.type))}</button>`
        + `<button type="button" class="icone-btn" data-s="ouvrir" aria-expanded="${ouvert}" aria-label="Détails du salon">${icone(ouvert ? 'haut' : 'reglages')}</button>`
        + `<button type="button" class="icone-btn icone-btn--danger" data-s="supprimer" aria-label="Supprimer le salon">${icone('corbeille')}</button></div>`
        + (ouvert ? `<div class="at-details"><div class="at-options">`
          + (estVocal(s.type) ? `<label class="champ"><span>Places (0 = illimité)</span><input type="number" min="0" max="99" value="${Number(s.limite) || 0}" data-s-champ="limite"></label>`
            : `<label class="champ at-large"><span>Sujet du salon</span><input value="${esc(s.sujet || '')}" maxlength="1024" data-s-champ="sujet" placeholder="Affiché en haut du salon" autocomplete="off"></label>`
            + `<label class="champ"><span>Mode lent</span><select data-s-champ="lent">${[[0, 'Désactivé'], [5, '5 s'], [10, '10 s'], [30, '30 s'], [60, '1 min'], [300, '5 min'], [900, '15 min'], [3600, '1 h']].map(([v, t]) => `<option value="${v}"${Number(s.lent) === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`)
          + `<label class="champ"><span>Catégorie</span><select data-s-champ="categorie"><option value="">Sans catégorie</option>${m.categories.map(x => `<option value="${esc(x.id)}"${c && c.id === x.id ? ' selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label></div>`
          + (TYPES[s.type].communaute ? `<p class="r-aide">${icone('info')}Les salons ${TYPES[s.type].nom.toLowerCase()} demandent que la Communauté soit activée sur le serveur (onglet Réglages). Sinon, il sera créé comme salon ${TYPES[TYPES[s.type].repli].nom.toLowerCase()}.</p>` : '')
          + (s.perms ? `<p class="at-alerte">${icone('info')}Permissions copiées d'un serveur existant (${s.perms.length} règles). <button type="button" class="btn--lien lien-tab" data-s="simplifier">Les remplacer par des réglages simples</button></p>`
            : `<label class="interrupteur"><input type="checkbox" data-s-champ="perso"${a ? ' checked' : ''}><span aria-hidden="true"></span>Accès différent de la catégorie</label>${a ? editeurAcces(a, m, s.type, `s:${s.id}`) : ''}`)
          + '</div>' : '')
        + '</li>';
    };
    const bloc = (c, k) => {
      const salons = c ? c.salons : m.libres;
      const ouvert = c && etat.ouverts.has(c.id);
      return `<section class="at-cat" data-cat="${c ? esc(c.id) : ''}">`
        + (c ? `<div class="at-ligne at-cat-tete"><span class="at-ordre"><button type="button" class="icone-btn" data-c="monter" aria-label="Monter la catégorie"${k ? '' : ' disabled'}>${icone('haut')}</button><button type="button" class="icone-btn" data-c="descendre" aria-label="Descendre la catégorie"${k < m.categories.length - 1 ? '' : ' disabled'}>${icone('bas')}</button></span>`
          + `<input class="at-champ-nom at-cat-nom" value="${esc(c.nom)}" maxlength="100" data-c-champ="nom" aria-label="Nom de la catégorie" placeholder="Catégorie">`
          + `<button type="button" class="at-puce${c.perms ? ' is-avance' : restreint(c.acces) ? ' is-restreint' : ''}" data-c="ouvrir">${c.perms ? 'Permissions copiées' : esc(accesTexte(c.acces, m, 'texte'))}</button>`
          + `<button type="button" class="icone-btn" data-c="ouvrir" aria-expanded="${!!ouvert}" aria-label="Accès de la catégorie">${icone(ouvert ? 'haut' : 'reglages')}</button>`
          + `<button type="button" class="icone-btn icone-btn--danger" data-c="supprimer" aria-label="Supprimer la catégorie">${icone('corbeille')}</button></div>`
          + (ouvert ? `<div class="at-details">${c.perms ? `<p class="at-alerte">${icone('info')}Permissions copiées d'un serveur existant. <button type="button" class="btn--lien lien-tab" data-c="simplifier">Les remplacer par des réglages simples</button></p>` : `<p class="r-aide">Les salons de la catégorie suivent ces réglages, sauf s'ils ont un accès différent.</p>${editeurAcces(c.acces, m, 'texte', `c:${c.id}`)}`}</div>` : '')
          : `<div class="at-cat-tete at-cat-libre"><b>Sans catégorie</b><small>en haut de la liste</small></div>`)
        + `<ul class="at-liste">${salons.map((s, j) => ligneSalon(s, c, j, salons.length)).join('')}</ul>`
        + `<div class="at-ajout-salon"><button type="button" class="btn btn--lien btn--petit" data-s="ajouter" data-type="texte">${icone('texte')}Salon textuel</button><button type="button" class="btn btn--lien btn--petit" data-s="ajouter" data-type="vocal">${icone('vocal')}Salon vocal</button></div></section>`;
    };
    return `<div class="at-section-tete"><div><h2>Catégories et salons</h2><p class="r-aide">Règle qui voit et qui écrit dans chaque catégorie. « Membres vérifiés » = les rôles marqués Membre (par exemple après avoir accepté le règlement) et le staff.</p></div>`
      + `<button type="button" class="btn btn--ghost btn--petit" data-c="ajouter">${icone('plus')}Ajouter une catégorie</button></div>`
      + (m.libres.length ? bloc(null, -1) : '') + m.categories.map(bloc).join('');
  }

  /* ---------- Onglet Réglages ---------- */
  function panneauReglages(m) {
    const r = m.reglages;
    const textes = tousSalons(m).filter(x => !estVocal(x.s.type) && x.s.type !== 'forum');
    const vocaux = tousSalons(m).filter(x => estVocal(x.s.type));
    const choixSalon = (champ, liste, vide) => `<select data-g-champ="${champ}"><option value="">${vide}</option>${liste.map(x => `<option value="${esc(x.s.id)}"${r[champ] === x.s.id ? ' selected' : ''}>${esc(nomDiscord(x.s.nom, x.s.type))}</option>`).join('')}</select>`;
    return `<div class="at-section-tete"><div><h2>Réglages du serveur</h2><p class="r-aide">Appliqués en même temps que le modèle (tu peux les ignorer au moment d'appliquer).</p></div></div>`
      + `<div class="at-reglages">`
      + `<label class="champ"><span>Niveau de vérification</span><select data-g-champ="verification">${[[0, 'Aucun'], [1, 'Faible : e-mail vérifié'], [2, 'Moyen : inscrit depuis 5 min'], [3, 'Élevé : membre depuis 10 min'], [4, 'Maximum : téléphone vérifié']].map(([v, t]) => `<option value="${v}"${Number(r.verification) === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`
      + `<label class="champ"><span>Notifications par défaut</span><select data-g-champ="notifications"><option value="mentions"${r.notifications === 'mentions' ? ' selected' : ''}>Mentions seulement (conseillé)</option><option value="tous"${r.notifications === 'tous' ? ' selected' : ''}>Tous les messages</option></select></label>`
      + `<label class="champ"><span>Filtre des médias explicites</span><select data-g-champ="filtre">${[[0, 'Désactivé'], [1, 'Membres sans rôle'], [2, 'Tous les membres (conseillé)']].map(([v, t]) => `<option value="${v}"${Number(r.filtre) === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`
      + `<label class="champ"><span>Messages de bienvenue de Discord</span>${choixSalon('bienvenue', textes, 'Aucun salon')}</label>`
      + `<label class="champ"><span>Salon AFK</span>${choixSalon('afk', vocaux, 'Aucun')}</label>`
      + `<label class="champ"><span>Délai avant AFK</span><select data-g-champ="afkDelai">${[[60, '1 min'], [300, '5 min'], [900, '15 min'], [1800, '30 min'], [3600, '1 h']].map(([v, t]) => `<option value="${v}"${Number(r.afkDelai) === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div>`
      + `<section class="at-communaute"><label class="interrupteur"><input type="checkbox" data-g-champ="communaute"${r.communaute ? ' checked' : ''}><span aria-hidden="true"></span>Activer la Communauté Discord</label>`
      + `<p class="r-aide">Débloque les salons d'annonces, les forums, les conférences et l'écran d'accueil. Discord demande alors un salon de règlement, un salon de mises à jour pour le staff, la vérification par e-mail et le filtre sur tous les membres (réglés automatiquement).</p>`
      + `<div class="at-reglages"><label class="champ"><span>Salon du règlement</span>${choixSalon('reglement', textes, '—')}</label><label class="champ"><span>Mises à jour de Discord (staff)</span>${choixSalon('majs', textes, '—')}</label></div></section>`;
  }

  /* ---------- Messages : éditeur et aperçu ---------- */
  // Contexte : dans un modèle, les salons et rôles sont ceux du modèle ({salon:id}, {role:id}) ;
  // dans « Envoyer », ce sont ceux du vrai serveur (<#id>, <@&id>).
  const ctxModele = m => ({ reel: false, serveur: m.nom, roles: m.roles.map(r => ({ id: r.id, nom: r.nom, couleur: couleurSure(r.couleur), perms: r.perms })), salons: tousSalons(m).map(x => ({ id: x.s.id, nom: nomDiscord(x.s.nom, x.s.type), type: x.s.type })) });
  const STYLES = [['vert', 'Vert', 3], ['bleu', 'Bleu', 1], ['gris', 'Gris', 2], ['rouge', 'Rouge', 4]];
  const nouveauMessage = salonId => ({ id: nouvelId('m'), salon: salonId || '', contenu: '', mentions: false, embeds: [embed('', '', '#e8b46a')], boutons: [] });

  // Markdown de Discord (le principal) → HTML de l'aperçu
  function markdown(texte, ctx) {
    const morceaux = [];
    const garder = html => { morceaux.push(html); return `\u0000${morceaux.length - 1}\u0000`; };
    let s = esc(texte || '');
    s = s.replace(/```(?:[a-z]*\n)?([\s\S]*?)```/g, (_, c) => garder(`<pre>${c}</pre>`));
    s = s.replace(/`([^`\n]+)`/g, (_, c) => garder(`<code>${c}</code>`));
    const mention = (t, couleur) => garder(`<span class="dc-mention"${couleur ? ` style="--c:${couleur}"` : ''}>${esc(t)}</span>`);
    const role = id => ctx.roles.find(r => r.id === id);
    const salonNom = id => (ctx.salons.find(x => x.id === id) || {}).nom;
    s = s.replace(/\{salon:([\w-]+)\}/g, (x, id) => mention(`#${salonNom(id) || 'salon-inconnu'}`))
      .replace(/\{role:([\w-]+)\}/g, (x, id) => mention(`@${(role(id) || {}).nom || 'rôle-inconnu'}`, (role(id) || {}).couleur))
      .replace(/&lt;#(\d+)&gt;/g, (x, id) => mention(`#${salonNom(id) || 'salon'}`))
      .replace(/&lt;@&amp;(\d+)&gt;/g, (x, id) => mention(`@${(role(id) || {}).nom || 'rôle'}`, (role(id) || {}).couleur))
      .replace(/@(everyone|here)\b/g, (x, n) => mention(`@${n}`))
      .replace(/\{serveur\}/g, esc(ctx.serveur || 'Ton serveur'));
    const enLigne = x => x
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<span class="dc-lien">$1</span>')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/__(.+?)__/g, '<u>$1</u>').replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, '$1<i>$2</i>').replace(/(^|[\s(])_([^_]+?)_(?=[\s).,!?]|$)/g, '$1<i>$2</i>')
      .replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/\|\|(.+?)\|\|/g, '<span class="dc-spoiler">$1</span>')
      .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<span class="dc-lien">$2</span>');
    const lignes = s.split('\n');
    let html = '';
    let liste = false;
    lignes.forEach((l, k) => {
      const puce = /^\s*[-*] (.*)$/.exec(l);
      if (puce) { html += `${liste ? '' : '<ul>'}<li>${enLigne(puce[1])}</li>`; liste = true; return; }
      if (liste) { html += '</ul>'; liste = false; }
      const t = /^(#{1,3}) (.*)$/.exec(l);
      if (t) html += `<span class="dc-h${t[1].length}">${enLigne(t[2])}</span>`;
      else if (/^-# /.test(l)) html += `<small class="dc-sous">${enLigne(l.slice(3))}</small>`;
      else if (/^&gt; /.test(l)) html += `<span class="dc-citation">${enLigne(l.slice(5))}</span>`;
      else html += enLigne(l) + (k < lignes.length - 1 ? '<br>' : '');
    });
    if (liste) html += '</ul>';
    return html.replace(/\u0000(\d+)\u0000/g, (_, i) => morceaux[Number(i)]);
  }
  const emojiDe = e => { const x = /^<(a?):(\w+):(\d+)>$/.exec(String(e || '').trim()); return x ? { name: x[2], id: x[3], animated: !!x[1] } : String(e || '').trim() ? { name: String(e).trim() } : null; };
  function apercuMessage(msg, ctx) {
    const embeds = msg.embeds.filter(e => e.titre || e.description || e.champs.some(f => f.nom || f.valeur) || e.image || e.auteur || e.pied || e.miniature);
    const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `<div class="dc-msg"><span class="dc-avatar">${icone('atelier')}</span><div class="dc-corps"><div class="dc-entete"><b>Ton bot</b><span class="dc-app">APP</span><small>Aujourd'hui à ${heure}</small></div>`
      + (msg.contenu ? `<div class="dc-texte">${markdown(msg.contenu, ctx)}</div>` : '')
      + embeds.map(e => `<div class="dc-embed" style="--c:${couleurSure(e.couleur) || '#1e1f22'}"><div class="dc-embed-corps">`
        + (e.auteur ? `<span class="dc-auteur">${markdown(e.auteur, ctx)}</span>` : '')
        + (e.titre ? `<span class="dc-titre${e.url ? ' is-lien' : ''}">${markdown(e.titre, ctx)}</span>` : '')
        + (e.description ? `<div class="dc-desc">${markdown(e.description, ctx)}</div>` : '')
        + (e.champs.some(f => f.nom || f.valeur) ? `<div class="dc-champs">${e.champs.filter(f => f.nom || f.valeur).map(f => `<div class="dc-champ${f.ligne ? ' is-ligne' : ''}"><b>${markdown(f.nom, ctx)}</b><div>${markdown(f.valeur, ctx)}</div></div>`).join('')}</div>` : '')
        + (/^https:\/\//.test(e.image) ? `<img class="dc-image" src="${esc(e.image)}" alt="" loading="lazy">` : '')
        + (e.pied || e.horodatage ? `<small class="dc-pied">${esc(e.pied || '')}${e.pied && e.horodatage ? ' • ' : ''}${e.horodatage ? `Aujourd'hui à ${heure}` : ''}</small>` : '')
        + `</div>${/^https:\/\//.test(e.miniature) ? `<img class="dc-miniature" src="${esc(e.miniature)}" alt="" loading="lazy">` : ''}</div>`).join('')
      + (msg.boutons.length ? `<div class="dc-boutons">${msg.boutons.map(b => `<span class="dc-btn dc-btn--${b.type === 'lien' ? 'lien' : b.style || 'gris'}">${esc(b.emoji || '')}${b.emoji && b.texte ? ' ' : ''}${esc(b.texte || (b.emoji ? '' : 'Bouton'))}${b.type === 'lien' ? icone('lien') : ''}</span>`).join('')}</div>` : '')
      + (!msg.contenu && !embeds.length ? '<p class="dc-vide">Le message est vide : écris un texte ou remplis l\'embed.</p>' : '')
      + '</div></div>';
  }
  function barreInserer(ctx, cible) {
    return `<select class="at-inserer" data-inserer="${cible}" aria-label="Insérer un salon ou un rôle"><option value="">Insérer…</option>`
      + `<optgroup label="Salons">${ctx.salons.filter(x => !estVocal(x.type)).map(x => `<option value="${ctx.reel ? `<#${x.id}>` : `{salon:${x.id}}`}">#${esc(x.nom)}</option>`).join('')}</optgroup>`
      + `<optgroup label="Rôles">${ctx.roles.map(r => `<option value="${ctx.reel ? `<@&${r.id}>` : `{role:${r.id}}`}">@${esc(r.nom)}</option>`).join('')}</optgroup>`
      + `<optgroup label="Autre"><option value="{serveur}">Nom du serveur</option><option value="**texte en gras**">Gras</option><option value="# Grand titre">Titre</option><option value="- élément de liste">Liste</option></optgroup></select>`;
  }
  function editeurMessage(msg, ctx, contexte) {
    const embedEd = (e, k) => `<fieldset class="at-embed" data-e="${k}" style="--c:${couleurSure(e.couleur) || '#4e5058'}"><legend>Embed${msg.embeds.length > 1 ? ` ${k + 1}` : ''}</legend>`
      + `<button type="button" class="icone-btn icone-btn--danger at-embed-suppr" data-mx="embed-suppr" data-e="${k}" aria-label="Retirer l'embed">${icone('corbeille')}</button>`
      + `<div class="at-embed-ligne"><label class="at-couleur" style="--c:${couleurSure(e.couleur) || '#4e5058'}" title="Couleur de la barre"><input type="color" value="${couleurSure(e.couleur) || '#4e5058'}" data-ec="couleur" aria-label="Couleur"></label>`
      + `<label class="champ"><span>Titre</span><input data-ec="titre" value="${esc(e.titre)}" maxlength="256" autocomplete="off"></label></div>`
      + `<label class="champ"><span>Description ${barreInserer(ctx, `e${k}`)}</span><textarea data-ec="description" rows="6" maxlength="4096">${esc(e.description)}</textarea></label>`
      + `<div class="at-champs">${e.champs.map((f, j) => `<div class="at-champ-l" data-f="${j}"><input data-fc="nom" value="${esc(f.nom)}" maxlength="256" placeholder="Nom du champ" aria-label="Nom du champ"><input data-fc="valeur" value="${esc(f.valeur)}" maxlength="1024" placeholder="Valeur" aria-label="Valeur du champ">`
        + `<label class="at-case" title="Sur la même ligne"><input type="checkbox" data-fc="ligne"${f.ligne ? ' checked' : ''}><span>Côte à côte</span></label><button type="button" class="icone-btn" data-mx="champ-suppr" data-f="${j}" aria-label="Retirer le champ">${icone('fermer')}</button></div>`).join('')}</div>`
      + `<button type="button" class="btn btn--lien btn--petit" data-mx="champ-ajouter">${icone('plus')}Ajouter un champ</button>`
      + `<details class="at-plus"${e.auteur || e.url || e.image || e.miniature || e.pied || e.horodatage ? ' open' : ''}><summary>Auteur, lien, images, pied de page</summary><div class="at-embed-grille">`
      + `<label class="champ"><span>Auteur (petit texte en haut)</span><input data-ec="auteur" value="${esc(e.auteur)}" maxlength="256" autocomplete="off"></label>`
      + `<label class="champ"><span>Lien du titre</span><input data-ec="url" value="${esc(e.url)}" placeholder="https://…" autocomplete="off"></label>`
      + `<label class="champ"><span>Grande image (adresse https)</span><input data-ec="image" value="${esc(e.image)}" placeholder="https://…" autocomplete="off"></label>`
      + `<label class="champ"><span>Miniature (adresse https)</span><input data-ec="miniature" value="${esc(e.miniature)}" placeholder="https://…" autocomplete="off"></label>`
      + `<label class="champ"><span>Pied de page</span><input data-ec="pied" value="${esc(e.pied)}" maxlength="2048" autocomplete="off"></label>`
      + `<label class="interrupteur"><input type="checkbox" data-ec="horodatage"${e.horodatage ? ' checked' : ''}><span aria-hidden="true"></span>Afficher la date d'envoi</label></div></details></fieldset>`;
    const boutonEd = (b, k) => {
      const r = ctx.roles.find(x => x.id === b.role);
      const sensible = r && (r.perms || []).some(p => SENSIBLES.includes(p));
      return `<div class="at-bouton" data-b="${k}"><select data-bc="type" aria-label="Type de bouton"><option value="role"${b.type === 'role' ? ' selected' : ''}>Rôle</option><option value="lien"${b.type === 'lien' ? ' selected' : ''}>Lien</option></select>`
        + `<input class="at-emoji" data-bc="emoji" value="${esc(b.emoji)}" maxlength="60" placeholder="🙂" aria-label="Émoji">`
        + `<input data-bc="texte" value="${esc(b.texte)}" maxlength="80" placeholder="Texte du bouton" aria-label="Texte du bouton">`
        + (b.type === 'lien' ? `<input class="at-large" data-bc="url" value="${esc(b.url)}" placeholder="https://…" aria-label="Adresse du lien">`
          : `<select data-bc="role" aria-label="Rôle donné"><option value="">— Rôle —</option>${ctx.roles.map(x => `<option value="${esc(x.id)}"${x.id === b.role ? ' selected' : ''}>${esc(x.nom)}</option>`).join('')}</select>`
          + `<select data-bc="mode" aria-label="Effet du clic"><option value="b"${b.mode !== 'a' ? ' selected' : ''}>Donne ou retire</option><option value="a"${b.mode === 'a' ? ' selected' : ''}>Donne seulement</option></select>`
          + `<select data-bc="style" aria-label="Couleur">${STYLES.map(([v, t]) => `<option value="${v}"${b.style === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`)
        + `<button type="button" class="icone-btn icone-btn--danger" data-mx="bouton-suppr" data-b="${k}" aria-label="Retirer le bouton">${icone('corbeille')}</button>`
        + (sensible ? `<p class="at-alerte">${icone('alerte')}Ce rôle a des permissions de modération : le bot refusera de le donner par un bouton.</p>` : '')
        + '</div>';
    };
    return `<div class="at-msg-ed" data-msg-ed="${esc(contexte)}"><div class="at-msg-form">`
      + `<label class="champ"><span>Texte au-dessus des embeds (facultatif) ${barreInserer(ctx, 'contenu')}</span><textarea data-mc="contenu" rows="2" maxlength="2000">${esc(msg.contenu)}</textarea></label>`
      + `<label class="interrupteur"><input type="checkbox" data-mc="mentions"${msg.mentions ? ' checked' : ''}><span aria-hidden="true"></span>Notifier les rôles mentionnés dans le texte</label>`
      + msg.embeds.map(embedEd).join('')
      + (msg.embeds.length < 10 ? `<button type="button" class="btn btn--ghost btn--petit" data-mx="embed-ajouter">${icone('plus')}Ajouter un embed</button>` : '')
      + `<h4 class="at-h4">${icone('bouton')}Boutons</h4><p class="r-aide">Un bouton de rôle donne (ou retire) un rôle à celui qui clique : vérification, notifications, jeux… Un bouton lien ouvre une page.</p>`
      + `<div class="at-boutons">${msg.boutons.map(boutonEd).join('')}</div>`
      + (msg.boutons.length < 25 ? `<button type="button" class="btn btn--ghost btn--petit" data-mx="bouton-ajouter">${icone('plus')}Ajouter un bouton</button>` : '')
      + `</div><div class="at-msg-apercu"><small class="at-apercu-titre">${icone('oeil')}Aperçu</small><div data-apercu>${apercuMessage(msg, ctx)}</div></div></div>`;
  }
  function panneauMessages(m) {
    const ctx = ctxModele(m);
    const salons = tousSalons(m).filter(x => !estVocal(x.s.type));
    const resume = msg => { const e = msg.embeds.find(x => x.titre || x.description); return (e && (e.titre || e.description).replace(/\{serveur\}/g, m.nom).slice(0, 70)) || msg.contenu.slice(0, 70) || 'Message vide'; };
    return `<div class="at-section-tete"><div><h2>Messages</h2><p class="r-aide">Publiés par ton bot quand tu appliques le modèle : règlement, bienvenue, choix des rôles… <code>{serveur}</code> devient le nom du serveur ; le menu « Insérer » ajoute un salon ou un rôle du modèle.</p></div>`
      + `<button type="button" class="btn btn--ghost btn--petit" data-msg="ajouter">${icone('plus')}Ajouter un message</button></div>`
      + (m.messages.length ? `<ul class="at-msgs">${m.messages.map((msg, k) => {
        const ouvert = etat.message === msg.id;
        const s = salonDe(m, msg.salon);
        return `<li class="at-msg${ouvert ? ' is-ouvert' : ''}" data-msg-id="${esc(msg.id)}"><div class="at-ligne">`
          + `<span class="at-ordre"><button type="button" class="icone-btn" data-msg="monter" aria-label="Monter"${k ? '' : ' disabled'}>${icone('haut')}</button><button type="button" class="icone-btn" data-msg="descendre" aria-label="Descendre"${k < m.messages.length - 1 ? '' : ' disabled'}>${icone('bas')}</button></span>`
          + `<select class="at-select" data-msg-salon aria-label="Salon du message"><option value="">— Salon —</option>${salons.map(x => `<option value="${esc(x.s.id)}"${x.s.id === msg.salon ? ' selected' : ''}>#${esc(nomDiscord(x.s.nom, x.s.type))}</option>`).join('')}</select>`
          + `<button type="button" class="at-msg-titre" data-msg="ouvrir">${esc(resume(msg))}${msg.boutons.length ? ` <small>· ${msg.boutons.length} bouton${msg.boutons.length > 1 ? 's' : ''}</small>` : ''}${!s ? ' <em class="at-badge" style="--c:#ff6b8b">sans salon</em>' : ''}</button>`
          + `<button type="button" class="icone-btn" data-msg="ouvrir" aria-expanded="${ouvert}" aria-label="Modifier">${icone(ouvert ? 'haut' : 'reglages')}</button>`
          + `<button type="button" class="icone-btn icone-btn--danger" data-msg="supprimer" aria-label="Supprimer le message">${icone('corbeille')}</button></div>`
          + (ouvert ? editeurMessage(msg, ctx, `modele:${msg.id}`) : '') + '</li>';
      }).join('')}</ul>` : `<div class="vide"><span class="vide-icone">${icone('message')}</span><h3>Pas de message</h3><p>Ajoute un règlement avec un bouton « J'accepte », un message de bienvenue ou un choix de rôles.</p></div>`);
  }
  // Message en cours d'édition (dans un modèle ou dans « Envoyer »)
  function messageEdite(el) {
    const ed = el.closest('[data-msg-ed]');
    if (!ed) return null;
    const c = ed.dataset.msgEd;
    if (c === 'envoi') return etat.envoi && etat.envoi.message ? { msg: etat.envoi.message, ctx: etat.envoi.ctx, ed, modele: false } : null;
    const m = modele();
    const msg = m && m.messages.find(x => x.id === c.slice(7));
    return msg ? { msg, ctx: ctxModele(m), ed, modele: true } : null;
  }
  function rafraichirEditeur(x) {
    const ouvert = $$('details.at-plus', x.ed).map(d => d.open);
    const html = editeurMessage(x.msg, x.ctx, x.ed.dataset.msgEd);
    x.ed.outerHTML = html;
    const nouvel = $(`[data-msg-ed="${CSS.escape(x.ed.dataset.msgEd)}"]`);
    $$('details.at-plus', nouvel).forEach((d, k) => { if (ouvert[k]) d.open = true; });
  }
  const rafraichirApercu = x => { $('[data-apercu]', x.ed).innerHTML = apercuMessage(x.msg, x.ctx); };

  // Charge Discord : remplace les variables, prépare embeds et boutons
  function chargeMessage(msg, res) {
    const remplacer = t => String(t || '').replace(/\{serveur\}/g, res.serveur || '')
      .replace(/\{salon:([\w-]+)\}/g, (x, id) => (res.salon(id) ? `<#${res.salon(id)}>` : x))
      .replace(/\{role:([\w-]+)\}/g, (x, id) => (res.role(id) ? `<@&${res.role(id)}>` : x));
    const https = u => (/^https?:\/\/\S+$/.test(String(u || '').trim()) ? String(u).trim() : undefined);
    const nettoyer = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
    const embeds = msg.embeds.map(e => nettoyer({
      title: remplacer(e.titre).slice(0, 256), description: remplacer(e.description).slice(0, 4096), url: e.titre ? https(e.url) : undefined,
      color: couleurSure(e.couleur) ? parseInt(e.couleur.slice(1), 16) : undefined,
      author: e.auteur ? { name: remplacer(e.auteur).slice(0, 256) } : undefined, image: https(e.image) ? { url: https(e.image) } : undefined,
      thumbnail: https(e.miniature) ? { url: https(e.miniature) } : undefined, footer: e.pied ? { text: remplacer(e.pied).slice(0, 2048) } : undefined,
      timestamp: e.horodatage ? new Date().toISOString() : undefined,
      fields: e.champs.filter(f => f.nom || f.valeur).slice(0, 25).map(f => ({ name: remplacer(f.nom).slice(0, 256) || '​', value: remplacer(f.valeur).slice(0, 1024) || '​', inline: !!f.ligne })),
    })).filter(e => Object.keys(e).some(k => k !== 'color'));
    const boutons = msg.boutons.map(b => {
      const emoji = emojiDe(b.emoji);
      const label = String(b.texte || '').slice(0, 80);
      if (!label && !emoji) return null;
      if (b.type === 'lien') return https(b.url) ? nettoyer({ type: 2, style: 5, label, url: https(b.url), emoji }) : null;
      const id = res.role(b.role);
      if (!id) return null;
      return nettoyer({ type: 2, style: (STYLES.find(s => s[0] === b.style) || STYLES[2])[2], label, emoji, custom_id: `role|${id}|${b.mode === 'a' ? 'a' : 'b'}` });
    }).filter(Boolean);
    const components = [];
    for (let i = 0; i < boutons.length; i += 5) components.push({ type: 1, components: boutons.slice(i, i + 5) });
    return { content: remplacer(msg.contenu).slice(0, 2000), embeds, components, mentions: !!msg.mentions };
  }
  const messageVide = msg => !String(msg.contenu || '').trim() && !msg.embeds.some(e => e.titre || e.description || e.image || e.champs.some(f => f.nom || f.valeur));

  /* ---------- Serveurs Discord du bot ---------- */
  async function chargerGuildes(forcer) {
    if (etat.guildes && !forcer) return etat.guildes;
    etat.guildes = await api('/atelier/serveurs');
    return etat.guildes;
  }
  async function chargerServeur(id, forcer) {
    if (etat.serveurs.has(id) && !forcer) return etat.serveurs.get(id);
    const s = await api(`/atelier/serveur?id=${encodeURIComponent(id)}`);
    etat.serveurs.set(id, s);
    return s;
  }
  const initiales = nom => String(nom || '?').split(/\s+/).map(x => x.charAt(0)).join('').slice(0, 3).toUpperCase();
  const pastilleServeur = g => (g.icone ? `<img class="at-g-ic" src="${esc(g.icone)}" alt="" width="44" height="44">` : `<span class="at-g-ic">${esc(initiales(g.nom))}</span>`);
  function choixServeurs(liste, bouton) {
    const g = etat.guildes;
    return `<div class="at-etapes-invit"><b>Nouveau serveur ?</b><ol><li>Dans Discord, clique sur <b>+</b> → <b>Créer le mien</b> (laisse-le vide).</li><li><a href="${esc(g.invitation)}" target="_blank" rel="noopener">Invite ton bot sur ce serveur</a> (avec la permission Administrateur).</li><li>Reviens ici et clique sur <b>Actualiser</b>.</li></ol></div>`
      + `<div class="at-guildes-tete"><b>Serveurs où ton bot est présent</b><button type="button" class="btn btn--ghost btn--petit" data-guildes="actualiser">${icone('actualiser')}Actualiser</button></div>`
      + (liste.length ? `<ul class="at-guildes">${liste.map(x => `<li><button type="button" class="at-guilde" data-guilde="${esc(x.id)}">${pastilleServeur(x)}<span class="at-guilde-txt"><b>${esc(x.nom)}</b><small>${x.admin ? `${icone('coche')}Bot administrateur` : `${icone('alerte')}Bot sans le rôle administrateur`}</small></span><em>${esc(bouton)}</em></button></li>`).join('')}</ul>`
        : `<p class="av-vide">Ton bot n'est encore sur aucun serveur.</p>`);
  }

  /* ---------- Appliquer un modèle ---------- */
  const appDlg = $('#appliquer');
  const cleNom = n => sansAccents(n).replace(/[\s_]+/g, '-').replace(/-+/g, '-').trim();
  const DEFAUTS = ['general', 'salons-textuels', 'salons-vocaux', 'text-channels', 'voice-channels'];
  async function ouvrirAppliquer() {
    const m = modele();
    if (!m) return;
    etat.app = { etape: 'choix', modele: m.id, guilde: null };
    appDlg.showModal();
    rendreAppliquer(true);
    enregistrer();
  }
  async function rendreAppliquer(charger) {
    const a = etat.app;
    const corps = $('#appliquer-corps');
    const m = etat.modeles.find(x => x.id === a.modele);
    $('#appliquer-titre').textContent = a.etape === 'choix' ? `Appliquer « ${m.nom} »` : a.serveur ? `${m.nom} → ${a.serveur.nom}` : 'Appliquer';
    if (a.etape === 'choix') {
      if (charger || !etat.guildes) {
        corps.innerHTML = `<div class="e-chargement">${'<span class="c-roue" aria-hidden="true"></span>'}Recherche de tes serveurs…</div>`;
        try { await chargerGuildes(charger === 'forcer'); } catch (e) { corps.innerHTML = `<p class="at-alerte">${icone('alerte')}${esc(e.message)}</p>`; return; }
      }
      corps.innerHTML = `<p class="r-aide">Choisis le serveur à construire. Ce qui existe déjà et porte le même nom est réutilisé : rien n'est supprimé sans ton accord.</p>` + choixServeurs(etat.guildes.guildes, 'Choisir');
      return;
    }
    if (a.etape === 'verif') { rendreVerif(corps, m); return; }
    rendreConstruction(corps, m);
  }
  function rendreVerif(corps, m) {
    const a = etat.app;
    const s = a.serveur;
    const plan = preparer(m, s, a.options);
    a.plan = plan.etapes;
    a.bilan = plan;
    const defauts = s.salons.filter(c => DEFAUTS.includes(cleNom(c.nom)));
    const neuf = s.salons.length <= 6 && defauts.length > 0;
    const opt = (cle, texte, aide) => `<label class="interrupteur"><input type="checkbox" data-opt="${cle}"${a.options[cle] ? ' checked' : ''}><span aria-hidden="true"></span>${texte}</label>${aide ? `<p class="r-aide r-aide--apres">${aide}</p>` : ''}`;
    const nbRoles = s.roles.filter(r => r.id !== s.id && !r.gere).length;
    corps.innerHTML = `<div class="at-cible">${pastilleServeur(s)}<span class="at-cible-txt"><b>${esc(s.nom)}</b><small>${nbRoles} rôle${nbRoles > 1 ? 's' : ''} · ${s.salons.length} salon${s.salons.length > 1 ? 's' : ''} aujourd'hui${s.features.includes('COMMUNITY') ? ' · Communauté activée' : ''}</small></span><button type="button" class="btn btn--lien btn--petit" data-app="changer">Changer de serveur</button></div>`
      + (s.bot.admin ? '' : `<p class="at-alerte">${icone('alerte')}<span>Ton bot n'est pas administrateur sur ce serveur : plusieurs étapes vont échouer. Dans Discord, donne-lui un rôle avec « Administrateur », ou <a href="${esc(etat.guildes.invitation)}" target="_blank" rel="noopener">ré-invite-le</a>.</span></p>`)
      + plan.avertissements.map(t => `<p class="at-info">${icone('info')}<span>${esc(t)}</span></p>`).join('')
      + `<div class="at-options-app">`
      + opt('reutiliser', 'Réutiliser ce qui existe déjà (même nom)', 'Sinon, tout est créé en double à côté de l\'existant.')
      + (defauts.length ? opt('defauts', `Retirer les salons créés par Discord (${defauts.map(c => c.nom).join(', ')})`, neuf ? '' : 'Attention : ce serveur n\'a pas l\'air neuf.') : '')
      + opt('messages', `Publier les messages du modèle (${m.messages.length})`)
      + opt('reglages', 'Appliquer les réglages du serveur (vérification, notifications, salon AFK…)')
      + `</div><div class="cartes at-bilan"><div class="carte"><small>Rôles</small><b>${plan.compte.roles}</b><span>${plan.compte.rolesGardes ? `${plan.compte.rolesGardes} déjà là` : 'à créer'}</span></div>`
      + `<div class="carte"><small>Salons</small><b>${plan.compte.salons}</b><span>${plan.compte.salonsGardes ? `${plan.compte.salonsGardes} déjà là` : `dans ${m.categories.length} catégories`}</span></div>`
      + `<div class="carte"><small>Messages</small><b>${a.options.messages ? plan.compte.messages : 0}</b><span>publiés par le bot</span></div></div>`
      + `<div class="r-boutons at-lancer"><button type="button" class="btn btn--primaire" data-app="lancer"${plan.etapes.length ? '' : ' disabled'}>${icone('fusee')}Construire le serveur (${plan.etapes.length} étapes)</button></div>`;
  }
  // Surcharges de permissions d'un salon ou d'une catégorie
  function surcharges(m, def, type, ctx) {
    const o = new Map();
    const ajouter = (id, champ, bits) => { if (!id || !bits) return; const x = o.get(id) || { allow: 0n, deny: 0n }; x[champ] |= bits; o.set(id, x); };
    if (def.perms) {
      def.perms.forEach(p => {
        const id = p.cible === '@everyone' ? ctx.guilde : ctx.roles.get(p.cible);
        ajouter(id, 'allow', bitsDe(p.allow) | BigInt(p.allowExtra || 0));
        ajouter(id, 'deny', bitsDe(p.deny) | BigInt(p.denyExtra || 0));
      });
    } else if (def.acces) {
      const a = def.acces;
      const voix = estVocal(type);
      const VOIR_B = PERM.VIEW_CHANNEL.bit | (voix ? PERM.CONNECT.bit : 0n);
      const ECRIRE_B = voix ? PERM.SPEAK.bit : type === 'forum' ? PERM.SEND_MESSAGES.bit | PERM.SEND_MESSAGES_IN_THREADS.bit | PERM.CREATE_PUBLIC_THREADS.bit
        : PERM.SEND_MESSAGES.bit | PERM.SEND_MESSAGES_IN_THREADS.bit | PERM.CREATE_PUBLIC_THREADS.bit | PERM.CREATE_PRIVATE_THREADS.bit;
      const ids = liste => liste.map(r => ctx.roles.get(r.id)).filter(Boolean);
      const staffR = m.roles.filter(r => r.groupe === 'staff');
      const membresR = m.roles.filter(r => r.groupe === 'membre');
      const choisis = cles => m.roles.filter(r => (cles || []).includes(r.id));
      if (a.voir === 'membres') { ajouter(ctx.guilde, 'deny', VOIR_B); ids([...membresR, ...staffR]).forEach(id => ajouter(id, 'allow', VOIR_B)); }
      else if (a.voir === 'staff') { ajouter(ctx.guilde, 'deny', VOIR_B); ids(staffR).forEach(id => ajouter(id, 'allow', VOIR_B)); }
      else if (a.voir === 'roles') { ajouter(ctx.guilde, 'deny', VOIR_B); ids(choisis(a.voirRoles)).forEach(id => ajouter(id, 'allow', VOIR_B)); }
      else if (a.voir === 'nouveaux') { ids(membresR).forEach(id => ajouter(id, 'deny', VOIR_B)); ids(staffR).forEach(id => ajouter(id, 'allow', VOIR_B)); }
      if (a.ecrire === 'staff') { ajouter(ctx.guilde, 'deny', ECRIRE_B); ids(staffR).forEach(id => ajouter(id, 'allow', ECRIRE_B)); }
      else if (a.ecrire === 'roles') { ajouter(ctx.guilde, 'deny', ECRIRE_B); ids(choisis(a.ecrireRoles)).forEach(id => ajouter(id, 'allow', ECRIRE_B)); }
      else if (a.ecrire === 'personne') ajouter(ctx.guilde, 'deny', ECRIRE_B);
    }
    return [...o].map(([id, x]) => ({ id, type: 0, allow: String(x.allow & ~x.deny), deny: String(x.deny) }));
  }
  // Le plan : une liste d'étapes, chacune = un appel au serveur (exécutées dans l'ordre)
  function preparer(m, s, opt) {
    const ctx = { guilde: s.id, roles: new Map(), cats: new Map(), salons: new Map() };
    const etapes = [];
    const avertissements = [];
    const compte = { roles: 0, rolesGardes: 0, salons: 0, salonsGardes: 0, messages: 0 };
    const existants = { roles: s.roles.filter(r => !r.gere && r.id !== s.id), cats: s.salons.filter(c => c.type === 4), salons: s.salons.filter(c => c.type !== 4) };
    const pris = new Set();
    const trouver = (liste, nom, ok = () => true) => (opt.reutiliser ? liste.find(x => !pris.has(x.id) && cleNom(x.nom) === cleNom(nom) && ok(x)) : null);
    const action = (type, donnees) => api('/atelier/action', { method: 'POST', body: JSON.stringify({ guilde: s.id, type, ...donnees }) });
    const veutCommunaute = opt.reglages && m.reglages.communaute && !s.features.includes('COMMUNITY');
    const communaute = s.features.includes('COMMUNITY') || veutCommunaute;
    if (veutCommunaute && (!salonDe(m, m.reglages.reglement) || !salonDe(m, m.reglages.majs))) avertissements.push('Pour activer la Communauté, choisis le salon du règlement et celui des mises à jour (onglet Réglages). Elle ne sera pas activée.');
    const communauteOk = s.features.includes('COMMUNITY') || (veutCommunaute && salonDe(m, m.reglages.reglement) && salonDe(m, m.reglages.majs));
    const replis = tousSalons(m).filter(x => TYPES[x.s.type].communaute && !communauteOk);
    if (replis.length) avertissements.push(`Sans la Communauté, ${replis.length} salon${replis.length > 1 ? 's' : ''} (${replis.map(x => nomDiscord(x.s.nom, x.s.type)).slice(0, 3).join(', ')}${replis.length > 3 ? '…' : ''}) ${replis.length > 1 ? 'seront créés' : 'sera créé'} en salon simple. Active-la dans l'onglet Réglages pour avoir les annonces et les forums.`);
    if (!communaute) { /* rien de plus */ }

    // 1. Permissions de @everyone
    if (opt.reglages) etapes.push({ titre: 'Permissions de @everyone', faire: () => action('modifierRole', { id: s.id, donnees: { permissions: String(bitsDe(m.everyone)) } }) });
    // 2. Rôles, du haut vers le bas : Discord place chaque nouveau rôle tout en bas (juste au-dessus de @everyone)
    m.roles.forEach(r => {
      const deja = trouver(existants.roles, r.nom);
      if (deja) { pris.add(deja.id); ctx.roles.set(r.id, deja.id); compte.rolesGardes++; return; }
      compte.roles++;
      etapes.push({ titre: `Rôle « ${r.nom} »`, faire: async () => {
        const res = await action('role', { donnees: { name: r.nom, permissions: String(bitsDe(r.perms) | BigInt(r.extra || 0)), color: couleurSure(r.couleur) ? parseInt(r.couleur.slice(1), 16) : 0, hoist: !!r.separe, mentionable: !!r.mentionnable } });
        ctx.roles.set(r.id, res.id);
      } });
    });
    // 3. Catégories, puis salons (les types « Communauté » après son activation)
    m.categories.forEach(c => {
      const deja = trouver(existants.cats, c.nom);
      if (deja) { pris.add(deja.id); ctx.cats.set(c.id, deja.id); return; }
      etapes.push({ titre: `Catégorie « ${c.nom} »`, faire: async () => {
        const res = await action('salon', { donnees: { name: c.nom, type: 4, permission_overwrites: surcharges(m, c, 'texte', ctx) } });
        ctx.cats.set(c.id, res.id);
      } });
    });
    const apres = [];
    tousSalons(m).forEach(({ s: x, c }) => {
      const t = TYPES[x.type];
      const type = t.communaute && !communauteOk ? t.repli : x.type;
      const deja = trouver(existants.salons, nomDiscord(x.nom, x.type), e => (estVocal(type) ? [2, 13] : [0, 5, 15]).includes(e.type));
      if (deja) { pris.add(deja.id); ctx.salons.set(x.id, deja.id); compte.salonsGardes++; return; }
      compte.salons++;
      const etape = { titre: `Salon ${estVocal(type) ? '🔊 ' : '#'}${nomDiscord(x.nom, x.type)}`, faire: async () => {
        const def = x.perms || x.acces ? x : c || { acces: null };
        const res = await action('salon', { donnees: {
          name: x.nom, type: TYPES[type].discord, parent_id: c ? ctx.cats.get(c.id) : undefined, topic: x.sujet || undefined,
          rate_limit_per_user: Number(x.lent) || 0, user_limit: Number(x.limite) || 0, nsfw: !!x.nsfw, permission_overwrites: surcharges(m, def, type, ctx),
        } });
        ctx.salons.set(x.id, res.id);
      } };
      if (t.communaute && communauteOk && !s.features.includes('COMMUNITY')) apres.push(etape); else etapes.push(etape);
    });
    // 4. Salons par défaut de Discord
    if (opt.defauts) s.salons.filter(c => DEFAUTS.includes(cleNom(c.nom)) && !pris.has(c.id)).sort((a, b) => b.type - a.type)
      .forEach(c => etapes.push({ titre: `Retirer « ${c.nom} » (créé par Discord)`, faire: () => action('supprimerSalon', { id: c.id }) }));
    // 5. Réglages du serveur (et la Communauté)
    if (opt.reglages) {
      const r = m.reglages;
      etapes.push({ titre: communauteOk && !s.features.includes('COMMUNITY') ? 'Réglages du serveur et activation de la Communauté' : 'Réglages du serveur', faire: () => {
        const id = sid => (sid && ctx.salons.get(sid)) || null;
        const donnees = {
          verification_level: Math.max(Number(r.verification) || 0, communauteOk ? 1 : 0),
          default_message_notifications: r.notifications === 'tous' ? 0 : 1,
          explicit_content_filter: communauteOk ? 2 : Number(r.filtre) || 0,
          system_channel_id: id(r.bienvenue), afk_channel_id: id(r.afk), afk_timeout: Number(r.afkDelai) || 300,
        };
        if (communauteOk) Object.assign(donnees, { rules_channel_id: id(r.reglement), public_updates_channel_id: id(r.majs), ...(s.features.includes('COMMUNITY') ? {} : { features: ['COMMUNITY'] }) });
        return action('serveur', { donnees });
      } });
    }
    etapes.push(...apres);
    // 6. Ordre des catégories et des salons
    if (m.categories.length || m.libres.length) etapes.push({ titre: 'Ordre des catégories et des salons', faire: () => {
      const positions = [];
      m.categories.forEach((c, k) => { if (ctx.cats.get(c.id)) positions.push({ id: ctx.cats.get(c.id), position: k }); });
      m.libres.forEach((x, k) => { if (ctx.salons.get(x.id)) positions.push({ id: ctx.salons.get(x.id), position: k, parent_id: null }); });
      m.categories.forEach(c => c.salons.forEach((x, k) => { if (ctx.salons.get(x.id) && ctx.cats.get(c.id)) positions.push({ id: ctx.salons.get(x.id), position: k, parent_id: ctx.cats.get(c.id) }); }));
      return positions.length ? action('positions', { positions }) : Promise.resolve();
    } });
    // 7. Messages
    if (opt.messages) m.messages.forEach(msg => {
      const x = salonDe(m, msg.salon);
      if (!x) { avertissements.push(`Un message n'a pas de salon : il ne sera pas publié.`); return; }
      if (messageVide(msg)) return;
      compte.messages++;
      etapes.push({ titre: `Message dans #${nomDiscord(x.nom, x.type)}`, faire: () => {
        const salonId = ctx.salons.get(msg.salon);
        if (!salonId) throw new ErreurAtelier(`Le salon #${nomDiscord(x.nom, x.type)} n'a pas été créé.`);
        return action('message', { salon: salonId, donnees: chargeMessage(msg, { serveur: s.nom, salon: id => ctx.salons.get(id), role: id => ctx.roles.get(id) }) });
      } });
    });
    return { etapes, avertissements, compte, ctx };
  }
  function rendreConstruction(corps, m) {
    const a = etat.app;
    const fait = a.plan.filter(e => e.etat === 'ok' || e.etat === 'passe').length;
    const pct = Math.round(fait / a.plan.length * 100);
    const courante = a.plan[a.index];
    if (a.etape === 'fini') {
      const passes = a.plan.filter(e => e.etat === 'passe');
      corps.innerHTML = `<div class="at-fini"><span class="vide-icone">${icone('coche')}</span><h3>${esc(a.serveur.nom)} est prêt !</h3>`
        + `<p>${a.bilan.compte.roles} rôle${a.bilan.compte.roles > 1 ? 's' : ''}, ${a.bilan.compte.salons} salon${a.bilan.compte.salons > 1 ? 's' : ''} et ${a.options.messages ? a.bilan.compte.messages : 0} message${a.bilan.compte.messages > 1 ? 's' : ''} ${a.bilan.compte.roles + a.bilan.compte.salons > 1 ? 'ont été créés' : 'a été créé'}.${passes.length ? ` ${passes.length} étape${passes.length > 1 ? 's' : ''} passée${passes.length > 1 ? 's' : ''}.` : ''}</p>`
        + `<div class="r-boutons"><a class="btn btn--primaire" href="https://discord.com/channels/${esc(a.serveur.id)}" target="_blank" rel="noopener"><svg class="i i--plein" aria-hidden="true"><use href="#b-discord"/></svg>Ouvrir le serveur dans Discord</a><button type="button" class="btn btn--ghost" data-fermer>Fermer</button></div>`
        + `<p class="r-aide">Pense à vérifier dans Discord que le rôle de ton bot reste au-dessus des rôles donnés par les boutons.</p></div>`;
      return;
    }
    corps.innerHTML = `<div class="at-progres"><div class="at-barre-progres"><i style="width:${pct}%"></i></div><b>${pct} %</b></div>`
      + (a.pause && courante ? `<div class="at-erreur"><p>${icone('alerte')}<span><b>${esc(courante.titre)}</b> : ${esc(courante.erreur || 'erreur')}</span></p><div class="r-boutons"><button type="button" class="btn btn--primaire btn--petit" data-app="reessayer">Réessayer</button><button type="button" class="btn btn--ghost btn--petit" data-app="passer">Passer cette étape</button><button type="button" class="btn btn--danger btn--petit" data-app="arreter">Arrêter</button></div></div>`
        : courante ? `<p class="at-encours"><span class="c-roue" aria-hidden="true"></span>${esc(courante.titre)}${courante.attente ? ` · Discord demande de patienter ${Math.ceil(courante.attente / 1000)} s` : '…'}</p>` : '')
      + `<ol class="at-journal">${a.plan.map((e, k) => `<li class="is-${e.etat || (k === a.index ? 'cours' : 'attente')}">${icone(e.etat === 'ok' ? 'coche' : e.etat === 'erreur' ? 'alerte' : e.etat === 'passe' ? 'fermer' : 'dossier')}<span>${esc(e.titre)}</span></li>`).join('')}</ol>`;
    const enCoursEl = $('.at-journal .is-cours', corps);
    if (enCoursEl) enCoursEl.scrollIntoView({ block: 'nearest' });
  }
  async function construire() {
    const a = etat.app;
    a.pause = false;
    while (a.index < a.plan.length) {
      if (a.arret || !appDlg.open) return;
      const e = a.plan[a.index];
      rendreAppliquer();
      try {
        await e.faire();
        e.etat = 'ok';
        e.attente = 0;
        a.index++;
      } catch (err) {
        if (err.status === 429 && err.attente) { e.attente = err.attente; rendreAppliquer(); await attendre(err.attente); continue; }
        e.etat = 'erreur';
        e.erreur = err.message;
        a.pause = true;
        rendreAppliquer();
        return;
      }
    }
    a.etape = 'fini';
    etat.serveurs.delete(a.serveur.id);
    rendreAppliquer();
  }
  appDlg.addEventListener('click', async e => {
    const a = etat.app;
    if (!a) return;
    const g = e.target.closest('[data-guilde]');
    if (g) {
      $('#appliquer-corps').innerHTML = '<div class="e-chargement"><span class="c-roue" aria-hidden="true"></span>Lecture du serveur…</div>';
      try {
        a.serveur = await chargerServeur(g.dataset.guilde, true);
        a.guilde = a.serveur.id;
        const defauts = a.serveur.salons.some(c => DEFAUTS.includes(cleNom(c.nom)));
        a.options = { reutiliser: true, defauts: defauts && a.serveur.salons.length <= 6, messages: true, reglages: true };
        a.etape = 'verif';
      } catch (err) { toast(err.message); a.etape = 'choix'; }
      rendreAppliquer();
      return;
    }
    if (e.target.closest('[data-guildes="actualiser"]')) { rendreAppliquer('forcer'); return; }
    const b = e.target.closest('[data-app]');
    if (!b) return;
    if (b.dataset.app === 'changer') { a.etape = 'choix'; rendreAppliquer(); }
    else if (b.dataset.app === 'lancer') { a.etape = 'construction'; a.index = 0; a.arret = false; construire(); }
    else if (b.dataset.app === 'reessayer') { a.plan[a.index].etat = null; construire(); }
    else if (b.dataset.app === 'passer') { a.plan[a.index].etat = 'passe'; a.index++; construire(); }
    else if (b.dataset.app === 'arreter') { a.arret = true; appDlg.close(); toast('Construction arrêtée. Relance-la : ce qui est déjà créé sera réutilisé.'); }
  });
  appDlg.addEventListener('change', e => {
    const o = e.target.closest('[data-opt]');
    if (o && etat.app) { etat.app.options[o.dataset.opt] = o.checked; rendreAppliquer(); }
  });
  appDlg.addEventListener('close', () => { if (etat.app && etat.app.etape === 'construction' && !etat.app.pause) etat.app.arret = true; });

  /* ---------- Outil : envoyer ou modifier un message ---------- */
  async function rendreEnvoyer(main) {
    const env = etat.envoi || (etat.envoi = { guilde: '', salon: '', messageId: null, message: nouveauMessage(''), ctx: { reel: true, serveur: '', roles: [], salons: [] } });
    main.innerHTML = `<div class="at-tete"><div class="at-titre"><h1 class="at-h1">Envoyer ou modifier un message</h1><p class="r-aide">Compose un message avec embeds et boutons de rôle, puis envoie-le avec ton bot. Pour corriger un message déjà envoyé par le bot, colle son lien.</p></div></div>`
      + `<div class="at-envoi" id="envoi-cible"><div class="e-chargement"><span class="c-roue" aria-hidden="true"></span>Recherche de tes serveurs…</div></div>`
      + `<div id="envoi-editeur">${editeurMessage(env.message, env.ctx, 'envoi')}</div>`
      + `<div class="at-envoi-actions"><button type="button" class="btn btn--primaire" data-env="envoyer">${icone('envoyer')}${env.messageId ? 'Mettre à jour le message' : 'Envoyer'}</button>`
      + `<button type="button" class="btn btn--ghost" data-env="nouveau">${icone('plus')}Nouveau message</button><p class="f-erreur" id="envoi-erreur" role="alert"></p></div>`;
    try { await chargerGuildes(); } catch (e) { $('#envoi-cible').innerHTML = `<p class="at-alerte">${icone('alerte')}${esc(e.message)}</p>`; return; }
    rendreEnvoiCible();
  }
  function rendreEnvoiCible() {
    const env = etat.envoi;
    const srv = env.guilde ? etat.serveurs.get(env.guilde) : null;
    const salons = srv ? srv.salons.filter(c => [0, 5].includes(c.type)) : [];
    const cats = srv ? new Map(srv.salons.filter(c => c.type === 4).map(c => [c.id, c.nom])) : new Map();
    const modelesMsgs = etat.modeles.flatMap(m => m.messages.filter(x => !messageVide(x)).map(x => ({ m, x })));
    $('#envoi-cible').innerHTML = `<label class="champ"><span>Serveur</span><select data-env="guilde"><option value="">— Choisis un serveur —</option>${etat.guildes.guildes.map(g => `<option value="${esc(g.id)}"${g.id === env.guilde ? ' selected' : ''}>${esc(g.nom)}</option>`).join('')}</select></label>`
      + `<label class="champ"><span>Salon</span><select data-env="salon"${srv ? '' : ' disabled'}><option value="">— Salon —</option>${salons.sort((a, b) => String(cats.get(a.parent) || '').localeCompare(String(cats.get(b.parent) || '')) || a.position - b.position).map(c => `<option value="${esc(c.id)}"${c.id === env.salon ? ' selected' : ''}>#${esc(c.nom)}${c.parent && cats.get(c.parent) ? ` — ${esc(cats.get(c.parent))}` : ''}</option>`).join('')}</select></label>`
      + `<label class="champ at-large"><span>Modifier un message déjà envoyé (lien du message)</span><span class="at-lien-ligne"><input data-env="lien" placeholder="https://discord.com/channels/…" value="${esc(env.lien || '')}" autocomplete="off"><button type="button" class="btn btn--ghost btn--petit" data-env="charger">Charger</button></span></label>`
      + (modelesMsgs.length ? `<label class="champ"><span>Partir d'un message d'un modèle</span><select data-env="depuis"><option value="">—</option>${modelesMsgs.map(({ m, x }, k) => `<option value="${k}">${esc(m.nom)} · ${esc(((x.embeds.find(e => e.titre) || {}).titre || x.contenu || 'message').replace(/\{serveur\}/g, '…').slice(0, 50))}</option>`).join('')}</select></label>` : '')
      + (env.messageId ? `<p class="at-info">${icone('info')}<span>Tu modifies un message existant. <button type="button" class="btn--lien lien-tab" data-env="nouveau">Écrire un nouveau message à la place</button></span></p>` : '')
      + (env.guilde && etat.guildes.guildes.find(g => g.id === env.guilde && !g.admin) ? `<p class="at-alerte">${icone('alerte')}Ton bot n'est pas administrateur sur ce serveur : il lui faut au moins le droit d'écrire dans le salon.</p>` : '');
    const bouton = $('[data-env="envoyer"]');
    if (bouton) bouton.innerHTML = `${icone('envoyer')}${env.messageId ? 'Mettre à jour le message' : `Envoyer${env.salon && srv ? ` dans #${esc((srv.salons.find(c => c.id === env.salon) || {}).nom || '')}` : ''}`}`;
  }
  async function choisirGuildeEnvoi(id) {
    const env = etat.envoi;
    env.guilde = id;
    env.salon = '';
    if (!id) { env.ctx = { reel: true, serveur: '', roles: [], salons: [] }; rendreEnvoiCible(); rafraichirEnvoi(); return; }
    try {
      const srv = await chargerServeur(id);
      env.ctx = { reel: true, serveur: srv.nom, roles: srv.roles.filter(r => !r.gere && r.id !== srv.id).sort((a, b) => b.position - a.position).map(r => ({ id: r.id, nom: r.nom, couleur: r.couleur ? `#${r.couleur.toString(16).padStart(6, '0')}` : '', perms: clesDe(BigInt(r.permissions || '0')) })),
        salons: srv.salons.filter(c => c.type !== 4).map(c => ({ id: c.id, nom: c.nom, type: TYPE_DISCORD[c.type] || 'texte' })) };
    } catch (e) { toast(e.message); }
    rendreEnvoiCible();
    rafraichirEnvoi();
  }
  const rafraichirEnvoi = () => { const ed = $('#envoi-editeur'); if (ed) ed.innerHTML = editeurMessage(etat.envoi.message, etat.envoi.ctx, 'envoi'); };
  // Message d'un modèle → message pour ce serveur (salons et rôles retrouvés par leur nom)
  function adapterMessage(m, x) {
    const env = etat.envoi;
    const msg = clone(x);
    msg.id = nouvelId('m');
    const manque = [];
    const salonReel = id => { const s = salonDe(m, id); const r = s && env.ctx.salons.find(c => cleNom(c.nom) === cleNom(nomDiscord(s.nom, s.type))); if (s && !r) manque.push(`#${nomDiscord(s.nom, s.type)}`); return r ? `<#${r.id}>` : s ? `#${nomDiscord(s.nom, s.type)}` : '#salon'; };
    const roleReel = id => { const r = roleDe(m, id); const x2 = r && env.ctx.roles.find(c => cleNom(c.nom) === cleNom(r.nom)); if (r && !x2) manque.push(`@${r.nom}`); return x2 ? `<@&${x2.id}>` : r ? `@${r.nom}` : '@rôle'; };
    const conv = t => String(t || '').replace(/\{salon:([\w-]+)\}/g, (_, id) => salonReel(id)).replace(/\{role:([\w-]+)\}/g, (_, id) => roleReel(id)).replace(/\{serveur\}/g, env.ctx.serveur || '{serveur}');
    msg.contenu = conv(msg.contenu);
    msg.embeds.forEach(e => { ['titre', 'description', 'auteur', 'pied'].forEach(k => { e[k] = conv(e[k]); }); e.champs.forEach(f => { f.nom = conv(f.nom); f.valeur = conv(f.valeur); }); });
    msg.boutons.forEach(b => {
      if (b.type !== 'role') return;
      const r = roleDe(m, b.role);
      const reel = r && env.ctx.roles.find(c => cleNom(c.nom) === cleNom(r.nom));
      if (r && !reel) manque.push(`@${r.nom}`);
      b.role = reel ? reel.id : '';
    });
    return { msg, manque: [...new Set(manque)] };
  }
  // Message Discord (lu avec son lien) → message de l'éditeur
  function depuisDiscord(d) {
    const hex = n => (Number.isFinite(n) ? `#${n.toString(16).padStart(6, '0')}` : '');
    const boutons = [];
    let ignores = 0;
    (d.components || []).forEach(row => (row.components || []).forEach(c => {
      if (c.type !== 2) return;
      const emoji = c.emoji ? (c.emoji.id ? `<${c.emoji.animated ? 'a' : ''}:${c.emoji.name}:${c.emoji.id}>` : c.emoji.name) : '';
      const role = /^role\|(\d+)\|([ab])$/.exec(c.custom_id || '');
      if (c.style === 5) boutons.push({ id: nouvelId('b'), type: 'lien', texte: c.label || '', emoji, url: c.url || '', role: '', mode: 'b', style: 'gris' });
      else if (role) boutons.push({ id: nouvelId('b'), type: 'role', texte: c.label || '', emoji, role: role[1], mode: role[2], style: (STYLES.find(s => s[2] === c.style) || STYLES[2])[0], url: '' });
      else ignores++;
    }));
    return {
      ignores,
      msg: { id: nouvelId('m'), salon: '', contenu: d.content || '', mentions: false, boutons,
        embeds: (d.embeds || []).filter(e => e.type === 'rich' || !e.type).map(e => embed(e.title || '', e.description || '', hex(e.color) || '#4e5058', {
          url: e.url || '', auteur: (e.author && e.author.name) || '', image: (e.image && e.image.url) || '', miniature: (e.thumbnail && e.thumbnail.url) || '',
          pied: (e.footer && e.footer.text) || '', horodatage: !!e.timestamp, champs: (e.fields || []).map(f => ({ nom: f.name, valeur: f.value, ligne: !!f.inline })),
        })) },
    };
  }

  /* ---------- Outil : copier un serveur existant ---------- */
  async function rendreImporter(main) {
    main.innerHTML = `<div class="at-tete"><div class="at-titre"><h1 class="at-h1">Copier un serveur existant</h1><p class="r-aide">Ses rôles, ses catégories, ses salons et leurs permissions deviennent un nouveau modèle, que tu pourras modifier puis appliquer à un autre serveur. Les messages ne sont pas copiés.</p></div></div>`
      + `<div id="importer-liste"><div class="e-chargement"><span class="c-roue" aria-hidden="true"></span>Recherche de tes serveurs…</div></div>`;
    try { await chargerGuildes(); } catch (e) { $('#importer-liste').innerHTML = `<p class="at-alerte">${icone('alerte')}${esc(e.message)}</p>`; return; }
    $('#importer-liste').innerHTML = choixServeurs(etat.guildes.guildes, 'Copier');
  }
  function modeleDepuisServeur(s) {
    const hex = n => (n ? `#${Number(n).toString(16).padStart(6, '0')}` : '');
    const connus = BigInt.asUintN(64, TOUS_BITS);
    const ids = new Map(); // id Discord → id local
    const roles = s.roles.filter(r => !r.gere && r.id !== s.id).sort((a, b) => b.position - a.position).map(r => {
      const id = nouvelId('r');
      ids.set(r.id, id);
      const bits = BigInt(r.permissions || '0');
      const perms = clesDe(bits);
      const groupe = perms.includes('ADMINISTRATOR') || perms.includes('BAN_MEMBERS') || perms.includes('KICK_MEMBERS') || perms.includes('MODERATE_MEMBERS') ? 'staff' : /membre|member|v[ée]rifi/i.test(r.nom) ? 'membre' : '';
      return { id, nom: r.nom, couleur: hex(r.couleur), separe: r.separe, mentionnable: r.mentionnable, perms, extra: String(bits & ~connus), groupe };
    });
    const everyone = s.roles.find(r => r.id === s.id);
    const regles = liste => (liste || []).filter(o => o.type === 0 && (o.id === s.id || ids.has(o.id))).map(o => {
      const allow = BigInt(o.allow || '0'), deny = BigInt(o.deny || '0');
      return { cible: o.id === s.id ? '@everyone' : ids.get(o.id), allow: clesDe(allow), deny: clesDe(deny), allowExtra: String(allow & ~connus), denyExtra: String(deny & ~connus) };
    });
    const memes = (a, b) => JSON.stringify([...(a || [])].sort((x, y) => x.id.localeCompare(y.id))) === JSON.stringify([...(b || [])].sort((x, y) => x.id.localeCompare(y.id)));
    const salonsIds = new Map();
    const versSalon = c => {
      const id = nouvelId('s');
      salonsIds.set(c.id, id);
      const type = TYPE_DISCORD[c.type] || 'texte';
      return { id, nom: c.nom, type, sujet: c.sujet || '', lent: c.lent || 0, limite: c.limite || 0, acces: null, _perms: c.perms };
    };
    const cats = s.salons.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
    const enfants = parent => s.salons.filter(c => c.type !== 4 && TYPE_DISCORD[c.type] && c.parent === parent).sort((a, b) => (estVocal(TYPE_DISCORD[a.type]) - estVocal(TYPE_DISCORD[b.type])) || a.position - b.position);
    const finir = (x, parentPerms) => { if (!memes(x._perms, parentPerms) && (x._perms || []).length) x.perms = regles(x._perms); delete x._perms; return x; };
    const categories = cats.map(c => {
      const p = regles(c.perms);
      return { id: nouvelId('c'), nom: c.nom, acces: p.length ? null : accesDefaut(), ...(p.length ? { perms: p } : {}), salons: enfants(c.id).map(versSalon).map(x => finir(x, c.perms)) };
    });
    const libres = enfants(null).map(versSalon).map(x => finir(x, []));
    const local = id => (id && salonsIds.get(id)) || '';
    const instant = new Date().toISOString();
    return {
      id: nouvelId('mod'), nom: `Copie de ${s.nom}`, description: `Copié le ${new Date().toLocaleDateString('fr-FR')} depuis « ${s.nom} ».`,
      everyone: everyone ? clesDe(BigInt(everyone.permissions || '0')) : [...BASE], roles, libres, categories, messages: [],
      reglages: reglagesDefaut({ verification: s.verification || 0, notifications: s.notifications === 0 ? 'tous' : 'mentions', filtre: s.filtre || 0, bienvenue: local(s.systeme), reglement: local(s.reglement), majs: local(s.majs), communaute: s.features.includes('COMMUNITY'), afk: local(s.afk), afkDelai: s.afkDelai || 300 }),
      cree: instant, modifie: instant,
    };
  }

  /* ---------- Galerie : nouveau modèle ---------- */
  const galerie = $('#galerie');
  function ouvrirGalerie() {
    $('#galerie-corps').innerHTML = `<p class="r-aide">Choisis un point de départ : tout se modifie ensuite (rôles, salons, permissions, messages).</p><ul class="at-galerie">`
      + Object.entries(MODELES).map(([id, x]) => {
        const exemple = x.creer();
        const nb = exemple.libres.length + exemple.categories.reduce((t, c) => t + c.salons.length, 0);
        return `<li><button type="button" class="at-carte-modele" data-creer="${id}"><b>${esc(x.nom)}</b><span>${esc(x.resume)}</span>`
          + `<small>${exemple.roles.length} rôles · ${exemple.categories.length} catégories · ${nb} salons · ${exemple.messages.length} message${exemple.messages.length > 1 ? 's' : ''}</small></button></li>`;
      }).join('') + '</ul>';
    galerie.showModal();
  }
  galerie.addEventListener('click', e => {
    const b = e.target.closest('[data-creer]');
    if (!b) return;
    const m = nouveauModele(b.dataset.creer);
    etat.modeles.unshift(m);
    etat.id = m.id;
    etat.vue = 'modele';
    etat.onglet = 'roles';
    etat.ouverts.clear();
    galerie.close();
    changer(m.id);
    rendreTout();
    toast(`Modèle « ${m.nom} » créé`);
  });

  /* ---------- Modifications du modèle ---------- */
  const main = $('#main');
  const deplacer = (liste, i, sens) => { const j = i + sens; if (j < 0 || j >= liste.length) return; [liste[i], liste[j]] = [liste[j], liste[i]]; };
  // Où se trouve un salon : sa liste et sa position
  function placeSalon(m, id) {
    for (const liste of [m.libres, ...m.categories.map(c => c.salons)]) { const k = liste.findIndex(s => s.id === id); if (k >= 0) return { liste, k, c: m.categories.find(c => c.salons === liste) || null }; }
    return null;
  }
  function retirerRole(m, id) {
    m.roles = m.roles.filter(r => r.id !== id);
    const nettoyer = a => { if (!a) return; a.voirRoles = (a.voirRoles || []).filter(x => x !== id); a.ecrireRoles = (a.ecrireRoles || []).filter(x => x !== id); };
    m.categories.forEach(c => { nettoyer(c.acces); if (c.perms) c.perms = c.perms.filter(p => p.cible !== id); });
    tousSalons(m).forEach(({ s }) => { nettoyer(s.acces); if (s.perms) s.perms = s.perms.filter(p => p.cible !== id); });
    m.messages.forEach(msg => msg.boutons.forEach(b => { if (b.role === id) b.role = ''; }));
  }
  function retirerSalons(m, ids) {
    m.messages.forEach(msg => { if (ids.includes(msg.salon)) msg.salon = ''; });
    ['bienvenue', 'reglement', 'majs', 'afk'].forEach(k => { if (ids.includes(m.reglages[k])) m.reglages[k] = ''; });
  }
  const majApercu = () => { const m = modele(); const ap = $('.at-apercu'); if (m && ap) ap.outerHTML = apercuServeur(m); };

  main.addEventListener('input', e => {
    const m = modele();
    const t = e.target;
    // Messages (modèle ou « Envoyer »)
    const x = messageEdite(t);
    if (x && (t.dataset.mc || t.dataset.ec || t.dataset.fc || t.dataset.bc)) {
      if (t.type === 'checkbox' || t.tagName === 'SELECT') return; // traité par « change »
      if (t.dataset.mc) x.msg[t.dataset.mc] = t.value;
      else if (t.dataset.ec || t.dataset.fc) {
        const em = x.msg.embeds[Number(t.closest('[data-e]').dataset.e)];
        if (t.dataset.ec) { em[t.dataset.ec] = t.value; if (t.dataset.ec === 'couleur') { const f = t.closest('.at-embed'); f.style.setProperty('--c', t.value); t.closest('.at-couleur').style.setProperty('--c', t.value); } }
        else em.champs[Number(t.closest('[data-f]').dataset.f)][t.dataset.fc] = t.value;
      } else x.msg.boutons[Number(t.closest('[data-b]').dataset.b)][t.dataset.bc] = t.value;
      rafraichirApercu(x);
      if (x.modele) { changer(); const titre = t.closest('.at-msg'); if (titre && (t.dataset.ec === 'titre' || t.dataset.ec === 'description' || t.dataset.mc === 'contenu')) { /* le résumé se met à jour à la fermeture */ } }
      return;
    }
    if (!m) return;
    if (t.id === 'm-nom') { m.nom = t.value; changer(); rendreCote(); majApercu(); return; }
    if (t.id === 'm-desc') { m.description = t.value; changer(); return; }
    const li = t.closest('[data-role]');
    if (li && (t.dataset.rChamp === 'nom' || t.dataset.rChamp === 'couleur')) {
      const r = roleDe(m, li.dataset.role);
      r[t.dataset.rChamp] = t.value;
      if (t.dataset.rChamp === 'couleur') t.closest('.at-couleur').style.setProperty('--c', t.value);
      changer(); majApercu();
      return;
    }
    const ls = t.closest('[data-salon]');
    if (ls && (t.dataset.sChamp === 'nom' || t.dataset.sChamp === 'sujet' || t.dataset.sChamp === 'limite')) {
      const s = salonDe(m, ls.dataset.salon);
      s[t.dataset.sChamp] = t.dataset.sChamp === 'limite' ? Math.max(0, Math.min(99, Number(t.value) || 0)) : t.value;
      changer(); majApercu();
      return;
    }
    const lc = t.closest('[data-cat]');
    if (lc && t.dataset.cChamp === 'nom') { m.categories.find(c => c.id === lc.dataset.cat).nom = t.value; changer(); majApercu(); }
  });

  main.addEventListener('change', e => {
    const m = modele();
    const t = e.target;
    const x = messageEdite(t);
    if (x && (t.dataset.mc || t.dataset.ec || t.dataset.fc || t.dataset.bc)) {
      const val = t.type === 'checkbox' ? t.checked : t.value;
      if (t.dataset.mc) x.msg[t.dataset.mc] = val;
      else if (t.dataset.ec) x.msg.embeds[Number(t.closest('[data-e]').dataset.e)][t.dataset.ec] = val;
      else if (t.dataset.fc) x.msg.embeds[Number(t.closest('[data-e]').dataset.e)].champs[Number(t.closest('[data-f]').dataset.f)][t.dataset.fc] = val;
      else {
        const b = x.msg.boutons[Number(t.closest('[data-b]').dataset.b)];
        b[t.dataset.bc] = val;
        if (t.dataset.bc === 'type' || t.dataset.bc === 'role') { rafraichirEditeur(x); if (x.modele) changer(); return; }
      }
      rafraichirApercu(x);
      if (x.modele) changer();
      return;
    }
    // Insérer un salon, un rôle… dans un texte
    if (t.dataset.inserer !== undefined) {
      const valeur = t.value;
      t.value = '';
      const ed = t.closest('[data-msg-ed]');
      const cible = t.dataset.inserer === 'contenu' ? $('[data-mc="contenu"]', ed) : $(`[data-e="${t.dataset.inserer.slice(1)}"] [data-ec="description"]`, ed);
      if (!valeur || !cible) return;
      const [a, b] = [cible.selectionStart ?? cible.value.length, cible.selectionEnd ?? cible.value.length];
      cible.value = cible.value.slice(0, a) + valeur + cible.value.slice(b);
      cible.focus();
      cible.setSelectionRange(a + valeur.length, a + valeur.length);
      cible.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (t.closest('#envoi-cible')) { changementEnvoi(t); return; }
    if (!m) return;
    // Rôles
    const li = t.closest('[data-role]');
    if (li) {
      const r = roleDe(m, li.dataset.role);
      if (t.dataset.rChamp === 'niveau') { if (t.value !== 'perso') r.perms = permsNiveau(t.value); }
      else if (t.dataset.rChamp === 'groupe') r.groupe = t.value;
      else if (t.dataset.rChamp === 'separe' || t.dataset.rChamp === 'mentionnable') r[t.dataset.rChamp] = t.checked;
      else if (t.dataset.rPerm) r.perms = t.checked ? [...new Set([...r.perms, t.dataset.rPerm])] : r.perms.filter(p => p !== t.dataset.rPerm);
      else return;
      changer(); rendrePanneau();
      return;
    }
    if (t.dataset.ePerm) { m.everyone = t.checked ? [...new Set([...m.everyone, t.dataset.ePerm])] : m.everyone.filter(p => p !== t.dataset.ePerm); changer(); rendrePanneau(); return; }
    // Accès d'une catégorie ou d'un salon
    const acc = t.closest('[data-acces]');
    if (acc) {
      const [genre, id] = [acc.dataset.acces.slice(0, 1), acc.dataset.acces.slice(2)];
      const cible = genre === 'c' ? m.categories.find(c => c.id === id) : salonDe(m, id);
      const a = cible.acces;
      if (t.dataset.accesChamp) a[t.dataset.accesChamp] = t.value;
      else if (t.dataset.accesRole) { const l = a[t.dataset.accesRole] || []; a[t.dataset.accesRole] = t.checked ? [...new Set([...l, t.value])] : l.filter(v => v !== t.value); }
      changer(); rendrePanneau();
      return;
    }
    // Salons
    const ls = t.closest('[data-salon]');
    if (ls) {
      const s = salonDe(m, ls.dataset.salon);
      if (t.dataset.sChamp === 'type') s.type = t.value;
      else if (t.dataset.sChamp === 'lent') s.lent = Number(t.value) || 0;
      else if (t.dataset.sChamp === 'perso') { const p = placeSalon(m, s.id); s.acces = t.checked ? clone((p.c && p.c.acces) || accesDefaut()) : null; }
      else if (t.dataset.sChamp === 'categorie') {
        const p = placeSalon(m, s.id);
        p.liste.splice(p.k, 1);
        (t.value ? m.categories.find(c => c.id === t.value).salons : m.libres).push(s);
      } else return;
      changer(); rendrePanneau();
      return;
    }
    if (t.dataset.gChamp) {
      const k = t.dataset.gChamp;
      m.reglages[k] = t.type === 'checkbox' ? t.checked : ['verification', 'filtre', 'afkDelai'].includes(k) ? Number(t.value) : t.value;
      changer();
      return;
    }
    if (t.matches('[data-msg-salon]')) { const msg = m.messages.find(x2 => x2.id === t.closest('[data-msg-id]').dataset.msgId); msg.salon = t.value; changer(); rendrePanneau(); }
  });

  main.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-action="nouveau"]')) { ouvrirGalerie(); return; }
    const outil = t.closest('[data-outil]');
    if (outil) { ouvrirOutil(outil.dataset.outil); return; }
    const onglet = t.closest('[data-onglet]');
    if (onglet) { etat.onglet = onglet.dataset.onglet; rendrePanneau(); return; }
    // Copier un serveur
    const g = t.closest('[data-guilde]');
    if (g && etat.vue === 'importer') {
      g.disabled = true;
      try {
        const s = await chargerServeur(g.dataset.guilde, true);
        const m = modeleDepuisServeur(s);
        etat.modeles.unshift(m);
        etat.id = m.id; etat.vue = 'modele'; etat.onglet = 'salons'; etat.ouverts.clear();
        changer(m.id);
        rendreTout();
        toast(`« ${s.nom} » copié : ${m.roles.length} rôles, ${nbSalons(m)} salons`);
      } catch (err) { toast(err.message); g.disabled = false; }
      return;
    }
    if (t.closest('[data-guildes="actualiser"]')) {
      try { await chargerGuildes(true); } catch (err) { toast(err.message); return; }
      if (etat.vue === 'importer') $('#importer-liste').innerHTML = choixServeurs(etat.guildes.guildes, 'Copier');
      return;
    }
    // Éditeur de message (structure)
    const mx = t.closest('[data-mx]');
    if (mx) {
      const x = messageEdite(mx);
      if (!x) return;
      const k = n => Number(mx.closest(`[data-${n}]`) ? mx.closest(`[data-${n}]`).dataset[n] : mx.dataset[n]);
      const a = mx.dataset.mx;
      if (a === 'embed-ajouter') x.msg.embeds.push(embed('', '', x.msg.embeds.length ? x.msg.embeds[x.msg.embeds.length - 1].couleur : '#e8b46a'));
      else if (a === 'embed-suppr') x.msg.embeds.splice(Number(mx.dataset.e), 1);
      else if (a === 'champ-ajouter') x.msg.embeds[k('e')].champs.push({ nom: '', valeur: '', ligne: false });
      else if (a === 'champ-suppr') x.msg.embeds[k('e')].champs.splice(Number(mx.dataset.f), 1);
      else if (a === 'bouton-ajouter') x.msg.boutons.push(x.ctx.roles.length ? btnRole('', '', '', 'b', 'gris') : { id: nouvelId('b'), type: 'lien', texte: '', emoji: '', url: '', role: '', mode: 'b', style: 'gris' });
      else if (a === 'bouton-suppr') x.msg.boutons.splice(Number(mx.dataset.b), 1);
      rafraichirEditeur(x);
      if (x.modele) changer();
      return;
    }
    // Envoyer
    const env = t.closest('[data-env]');
    if (env && t.tagName !== 'SELECT' && t.tagName !== 'INPUT') { await actionEnvoi(env.dataset.env); return; }
    const m = modele();
    if (!m) return;
    const b = t.closest('[data-m], [data-r], [data-s], [data-c], [data-msg]');
    if (!b) return;
    if (b.dataset.m === 'appliquer') { ouvrirAppliquer(); return; }
    if (b.dataset.m === 'dupliquer') {
      const copie = { ...clone(m), id: nouvelId('mod'), nom: `${m.nom} (copie)`, cree: new Date().toISOString() };
      etat.modeles.splice(etat.modeles.indexOf(m) + 1, 0, copie);
      etat.id = copie.id;
      changer(copie.id); rendreTout(); toast('Modèle dupliqué');
      return;
    }
    if (b.dataset.m === 'supprimer') {
      if (!(await confirmer(`Supprimer « ${m.nom} » ?`, 'Le modèle disparaît de ton atelier (il reste dans l\'historique du dépôt). Les serveurs déjà construits ne changent pas.', 'Supprimer'))) return;
      etat.modeles = etat.modeles.filter(x => x.id !== m.id);
      etat.aEnregistrer.delete(m.id);
      etat.aSupprimer.add(m.id);
      etat.id = (etat.modeles[0] || {}).id || null;
      etat.vue = etat.id ? 'modele' : 'accueil';
      garderBrouillon(); enregistrer(); rendreTout();
      return;
    }
    // Rôles
    if (b.dataset.r) {
      const a = b.dataset.r;
      const li = b.closest('[data-role]');
      const i = li ? m.roles.findIndex(r => r.id === li.dataset.role) : -1;
      if (a === 'ajouter') { const r = role(nouvelId('r'), 'nouveau rôle', '#99aab5', 'aucune'); m.roles.push(r); etat.ouverts.add(r.id); }
      else if (a === 'monter' || a === 'descendre') deplacer(m.roles, i, a === 'monter' ? -1 : 1);
      else if (a === 'ouvrir') { const id = m.roles[i].id; if (etat.ouverts.has(id)) etat.ouverts.delete(id); else etat.ouverts.add(id); rendrePanneau(); return; }
      else if (a === 'supprimer') retirerRole(m, m.roles[i].id);
      else if (a === 'everyone') { if (etat.ouverts.has('@everyone')) etat.ouverts.delete('@everyone'); else etat.ouverts.add('@everyone'); rendrePanneau(); return; }
      else if (a === 'everyone-base') m.everyone = [...BASE];
      changer(); rendrePanneau(); majCompteurs();
      if (a === 'ajouter') { const champ = $(`[data-role="${CSS.escape(m.roles[m.roles.length - 1].id)}"] [data-r-champ="nom"]`); champ.focus(); champ.select(); }
      return;
    }
    // Catégories
    if (b.dataset.c) {
      const a = b.dataset.c;
      const sec = b.closest('[data-cat]');
      const i = sec ? m.categories.findIndex(c => c.id === sec.dataset.cat) : -1;
      if (a === 'ajouter') { const c = cat(nouvelId('c'), 'Nouvelle catégorie', {}, []); m.categories.push(c); }
      else if (a === 'monter' || a === 'descendre') deplacer(m.categories, i, a === 'monter' ? -1 : 1);
      else if (a === 'ouvrir') { const id = m.categories[i].id; if (etat.ouverts.has(id)) etat.ouverts.delete(id); else etat.ouverts.add(id); rendrePanneau(); return; }
      else if (a === 'simplifier') { delete m.categories[i].perms; m.categories[i].acces = accesDefaut(); }
      else if (a === 'supprimer') {
        const c = m.categories[i];
        if (c.salons.length && !(await confirmer(`Supprimer « ${c.nom} » ?`, `Ses ${c.salons.length} salons seront supprimés du modèle aussi.`, 'Supprimer'))) return;
        retirerSalons(m, c.salons.map(s => s.id));
        m.categories.splice(i, 1);
      }
      changer(); rendrePanneau(); majCompteurs();
      if (a === 'ajouter') { const champ = $$('.at-cat-nom').pop(); champ.focus(); champ.select(); }
      return;
    }
    // Salons
    if (b.dataset.s) {
      const a = b.dataset.s;
      if (a === 'ajouter') {
        const sec = b.closest('[data-cat]');
        const c = sec && sec.dataset.cat ? m.categories.find(x2 => x2.id === sec.dataset.cat) : null;
        const s = salon(nouvelId('s'), b.dataset.type === 'vocal' ? 'Nouveau vocal' : 'nouveau-salon', b.dataset.type);
        (c ? c.salons : m.libres).push(s);
        changer(); rendrePanneau(); majCompteurs();
        const champ = $(`[data-salon="${CSS.escape(s.id)}"] [data-s-champ="nom"]`);
        champ.focus(); champ.select();
        return;
      }
      const ls = b.closest('[data-salon]');
      const p = placeSalon(m, ls.dataset.salon);
      if (a === 'monter' || a === 'descendre') deplacer(p.liste, p.k, a === 'monter' ? -1 : 1);
      else if (a === 'ouvrir') { const id = p.liste[p.k].id; if (etat.ouverts.has(id)) etat.ouverts.delete(id); else etat.ouverts.add(id); rendrePanneau(); return; }
      else if (a === 'simplifier') { delete p.liste[p.k].perms; p.liste[p.k].acces = null; }
      else if (a === 'supprimer') { retirerSalons(m, [p.liste[p.k].id]); p.liste.splice(p.k, 1); }
      changer(); rendrePanneau(); majCompteurs();
      return;
    }
    // Messages
    if (b.dataset.msg) {
      const a = b.dataset.msg;
      const li = b.closest('[data-msg-id]');
      const i = li ? m.messages.findIndex(x2 => x2.id === li.dataset.msgId) : -1;
      if (a === 'ajouter') { const premier = tousSalons(m).find(x2 => !estVocal(x2.s.type)); const msg = nouveauMessage(premier ? premier.s.id : ''); m.messages.push(msg); etat.message = msg.id; }
      else if (a === 'monter' || a === 'descendre') deplacer(m.messages, i, a === 'monter' ? -1 : 1);
      else if (a === 'ouvrir') { etat.message = etat.message === m.messages[i].id ? null : m.messages[i].id; rendrePanneau(); return; }
      else if (a === 'supprimer') {
        const ancien = m.messages[i];
        m.messages.splice(i, 1);
        toast('Message supprimé', { texte: 'Annuler', faire: () => { m.messages.splice(i, 0, ancien); changer(m.id); if (etat.id === m.id) { rendrePanneau(); majCompteurs(); } } });
      }
      changer(); rendrePanneau(); majCompteurs();
    }
  });

  /* ---------- Envoyer : actions ---------- */
  async function changementEnvoi(t) {
    const env = etat.envoi;
    if (t.dataset.env === 'guilde') await choisirGuildeEnvoi(t.value);
    else if (t.dataset.env === 'salon') { env.salon = t.value; env.messageId = null; rendreEnvoiCible(); }
    else if (t.dataset.env === 'lien') env.lien = t.value;
    else if (t.dataset.env === 'depuis' && t.value !== '') {
      const liste = etat.modeles.flatMap(m => m.messages.filter(x => !messageVide(x)).map(x => ({ m, x })));
      const choix = liste[Number(t.value)];
      if (!choix) return;
      if (!env.guilde) { toast("Choisis d'abord le serveur, pour retrouver ses salons et ses rôles."); t.value = ''; return; }
      const { msg, manque } = adapterMessage(choix.m, choix.x);
      env.message = msg;
      env.messageId = null;
      rafraichirEnvoi();
      rendreEnvoiCible();
      if (manque.length) toast(`Introuvable sur ce serveur : ${manque.slice(0, 4).join(', ')}${manque.length > 4 ? '…' : ''}`, null, 7000);
    }
  }
  async function actionEnvoi(a) {
    const env = etat.envoi;
    const erreur = $('#envoi-erreur');
    if (erreur) erreur.textContent = '';
    if (a === 'nouveau') { env.message = nouveauMessage(''); env.messageId = null; env.lien = ''; rendreEnvoiCible(); rafraichirEnvoi(); return; }
    if (a === 'charger') {
      const champ = $('[data-env="lien"]');
      const x = /discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/.exec(champ ? champ.value : '');
      if (!x) { erreur.textContent = 'Colle le lien du message (clic droit sur le message → Copier le lien du message).'; return; }
      try {
        if (env.guilde !== x[1]) await choisirGuildeEnvoi(x[1]);
        const d = await api('/atelier/action', { method: 'POST', body: JSON.stringify({ guilde: x[1], type: 'lireMessage', salon: x[2], message: x[3] }) });
        if (!d.duBot) { erreur.textContent = "Ce message n'a pas été envoyé par ton bot : il ne peut modifier que ses propres messages. Tu peux le recopier en nouveau message."; }
        const { msg, ignores } = depuisDiscord(d);
        env.message = msg;
        env.salon = x[2];
        env.messageId = d.duBot ? x[3] : null;
        env.lien = champ.value;
        rendreEnvoiCible(); rafraichirEnvoi();
        if (ignores) toast(`${ignores} bouton${ignores > 1 ? 's' : ''} d'un autre bot ne peu${ignores > 1 ? 'vent' : 't'} pas être repris.`);
      } catch (e) { erreur.textContent = e.message; }
      return;
    }
    if (a === 'envoyer') {
      if (!env.guilde || !env.salon) { erreur.textContent = 'Choisis le serveur et le salon.'; return; }
      if (messageVide(env.message)) { erreur.textContent = "Le message est vide : écris un texte ou remplis l'embed."; return; }
      const charge = chargeMessage(env.message, { serveur: env.ctx.serveur, salon: id => id, role: id => id });
      const sansRole = env.message.boutons.filter(b => b.type === 'role' && !b.role).length;
      if (sansRole) { erreur.textContent = `${sansRole} bouton${sansRole > 1 ? 's' : ''} de rôle sans rôle choisi.`; return; }
      const bouton = $('[data-env="envoyer"]');
      bouton.disabled = true;
      try {
        const r = await api('/atelier/action', { method: 'POST', body: JSON.stringify(env.messageId
          ? { guilde: env.guilde, type: 'modifierMessage', salon: env.salon, message: env.messageId, donnees: charge }
          : { guilde: env.guilde, type: 'message', salon: env.salon, donnees: charge }) });
        toast(env.messageId ? 'Message mis à jour ✅' : 'Message envoyé ✅', { texte: 'Voir', faire: () => window.open(`https://discord.com/channels/${env.guilde}/${env.salon}/${r.id}`, '_blank', 'noopener') });
        if (!env.messageId) { env.messageId = r.id; env.lien = `https://discord.com/channels/${env.guilde}/${env.salon}/${r.id}`; rendreEnvoiCible(); }
      } catch (e) {
        erreur.textContent = e.status === 429 ? 'Discord demande de patienter quelques secondes.' : e.message;
      } finally { bouton.disabled = false; }
    }
  }

  /* ---------- Côté, outils, navigation ---------- */
  function ouvrirOutil(nom) {
    etat.vue = nom;
    fermerCote();
    rendreTout();
  }
  $('#cote').addEventListener('click', e => {
    const o = e.target.closest('[data-ouvrir]');
    if (o) { etat.id = o.dataset.ouvrir; etat.vue = 'modele'; etat.ouverts.clear(); etat.message = null; fermerCote(); rendreTout(); return; }
    const outil = e.target.closest('[data-outil]');
    if (outil) ouvrirOutil(outil.dataset.outil);
  });
  $('#nouveau-modele').addEventListener('click', () => { fermerCote(); ouvrirGalerie(); });
  $('#synchro').addEventListener('click', () => enregistrer());
  $('#deconnexion').addEventListener('click', async () => {
    if ((etat.aEnregistrer.size || etat.aSupprimer.size) && !(await enregistrer()) && !(await confirmer('Se déconnecter ?', 'Des modifications ne sont pas enregistrées. Elles restent gardées sur cet appareil.', 'Se déconnecter'))) return;
    deconnecter();
  });
  const cote = $('#cote');
  const fermerCote = () => { cote.classList.remove('is-ouvert'); $('#ouvrir-cote').setAttribute('aria-expanded', 'false'); };
  $('#ouvrir-cote').addEventListener('click', () => { const o = !cote.classList.contains('is-ouvert'); cote.classList.toggle('is-ouvert', o); $('#ouvrir-cote').setAttribute('aria-expanded', String(o)); });
  document.addEventListener('click', e => {
    const fermer = e.target.closest('[data-fermer]');
    if (fermer) { fermer.closest('dialog').close(); return; }
    if (e.target.matches('dialog.dialogue') && e.target.id !== 'appliquer') e.target.close();
    if (cote.classList.contains('is-ouvert') && !e.target.closest('#cote, #ouvrir-cote')) fermerCote();
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); enregistrer(); }
  });
  window.addEventListener('beforeunload', e => { if (etat.aEnregistrer.size || etat.aSupprimer.size) { garderBrouillon(); e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Petits outils d'interface ---------- */
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
  function confirmer(titre, texte, bouton) {
    const d = $('#confirmer');
    $('#confirmer-titre').textContent = titre;
    $('#confirmer-texte').textContent = texte;
    $('#confirmer-ok').textContent = bouton;
    d.returnValue = '';
    d.showModal();
    return new Promise(resolve => d.addEventListener('close', () => resolve(d.returnValue === 'oui'), { once: true }));
  }

  demarrer();
})();
