/* ==========================================================================
   Atelier de Mvrius — modèles complets « Créateurs de contenu »
   Chargé avant atelier.js, qui les ajoute à la galerie (Nouveau modèle).

   Chaque modèle contient :
   - une hiérarchie du staff complète (créateur, bras droit, administrateur,
     responsable modération, modérateur, modérateur test, animateur,
     community manager, rôle « Staff » commun, bots) ;
   - l'équipe de contenu (montage, visuels…) avec sa catégorie Production ;
   - des rôles communautaires (partenaire, VIP, abonnés ou soutiens, ancien…) ;
   - 8 rôles de niveaux (1, 5, 10, 20, 30, 50, 75, 100) qui débloquent des
     avantages, pour un bot de niveaux (Arcane, DraftBot, MEE6…) ;
   - les rôles membres (Membre vérifié, profil), de notifications et de
     centres d'intérêt, à choisir avec des boutons ;
   - des rôles séparateurs pour que la liste des rôles reste lisible ;
   - les salons rangés par catégories et une douzaine de messages prêts à
     publier (bienvenue, règlement à accepter, rôles, niveaux, équipe…).
   ========================================================================== */
window.ModelesCreateurs = o => {
  'use strict';
  const { role, salon, cat, embed, btnRole, accesDefaut, reglagesDefaut, BASE, MODERATION, nouvelId } = o;

  /* ---------- Permissions ---------- */
  const EXTERNES = ['USE_EXTERNAL_EMOJIS', 'USE_EXTERNAL_STICKERS', 'USE_EXTERNAL_SOUNDS', 'SEND_VOICE_MESSAGES'];
  // @everyone : tout le nécessaire, sauf les « bonus » débloqués par les niveaux et les rôles de soutien
  const EVERYONE = BASE.filter(k => !EXTERNES.includes(k));
  const BONUS_5 = ['USE_EXTERNAL_EMOJIS', 'USE_EXTERNAL_STICKERS'];
  const BONUS_10 = [...BONUS_5, 'SEND_VOICE_MESSAGES', 'USE_EXTERNAL_SOUNDS'];
  // Modérateur test : exclure temporairement, gérer les messages, déplacer en vocal (pas d'expulsion ni de bannissement)
  const HELPER = [...BASE, 'MODERATE_MEMBERS', 'MANAGE_MESSAGES', 'MANAGE_THREADS', 'VIEW_AUDIT_LOG', 'MOVE_MEMBERS', 'MUTE_MEMBERS'];
  // Responsable modération : la modération, plus la gestion des rôles (sous le sien) et des événements
  const RESP_MODO = [...new Set([...MODERATION, 'MANAGE_ROLES', 'MANAGE_EVENTS', 'CREATE_EVENTS'])];
  // Rôles sans « Administrateur » qui doivent voir les zones réservées pour les modérer
  const MODOS = ['r_manager', 'r_admin', 'r_resp_modo', 'r_modo', 'r_helper'];

  /* ---------- Briques ---------- */
  const sep = (id, texte) => role(id, `────── ${texte} ──────`, '', 'aucune');
  const acces = o2 => ({ ...accesDefaut(), ...o2 });
  const ouvert = () => acces({ voir: 'membres', ecrire: 'tous' });
  const lectureMembres = () => acces({ voir: 'membres', ecrire: 'staff' });
  const msg = (salonId, embeds, boutons = []) => ({ id: nouvelId('m'), salon: salonId, contenu: '', mentions: false, embeds, boutons });
  const champ = (nom, valeur, ligne = false) => ({ nom, valeur, ligne });
  const PROFIL = [['r_il', '👦 Il', '👦', 'Il'], ['r_elle', '👧 Elle', '👧', 'Elle'], ['r_iel', '🧑 Iel', '🧑', 'Iel'], ['r_majeur', '🔞 Majeur', '🔞', '+18'], ['r_mineur', '🧃 Mineur', '🧃', '-18']];

  function rolesStaff(c) {
    return [
      sep('r_sep_staff', '👑 ÉQUIPE'),
      role('r_createur', c.createur[0], c.createur[1], 'admin', { separe: true, groupe: 'staff' }),
      role('r_manager', '🤝 Bras droit', '#f5c26b', 'gestion', { separe: true, groupe: 'staff' }),
      role('r_admin', '🛠️ Administrateur', '#e07a4c', 'gestion', { separe: true, groupe: 'staff' }),
      role('r_resp_modo', '⚖️ Responsable modération', '#3d6fe0', 'perso', { separe: true, groupe: 'staff', perms: [...RESP_MODO] }),
      role('r_modo', '🛡️ Modérateur', '#5b8def', 'moderation', { separe: true, mentionnable: true, groupe: 'staff' }),
      role('r_helper', '🔰 Modérateur test', '#8fb3ff', 'perso', { separe: true, groupe: 'staff', perms: [...HELPER] }),
      role('r_anim', '🎉 Animateur', '#c3a6ff', 'animation', { separe: true, groupe: 'staff' }),
      role('r_cm', '📣 Community manager', '#f78fd8', 'animation', { separe: true, groupe: 'staff' }),
      role('r_staff', '📌 Staff', '#9ba3ba', 'aucune', { groupe: 'staff' }),
      role('r_bots', '🤖 Bots', '#9ba3ba', 'aucune', { separe: true }),
    ];
  }

  // Le règlement, commun à tous les créateurs, avec les règles propres au modèle
  function texteRegles(propres) {
    const regles = [
      ['Respect', 'Pas d\'insultes, de harcèlement, de discrimination ni de propos haineux, envers les membres comme envers le créateur et le staff.'],
      ['Vie privée', 'Ne partage aucune information personnelle (adresse, numéro, photos…), ni sur toi ni sur les autres. Pas de questions sur la vie privée du créateur ou de ses proches.'],
      ['Pas de spam ni de pub', 'Pas de flood, de mentions inutiles ni de publicité en message privé. Ton contenu se partage seulement dans {salon:s_autopromo}.'],
      ['Contenu adapté', 'Rien de NSFW, choquant, violent ou illégal. Les spoilers se cachent entre balises ||comme ceci||.'],
      ...propres,
      ['Les bons salons', 'Chaque sujet a son salon : merci de les utiliser.'],
      ['Le staff', 'Les décisions du staff s\'appliquent. Pas de réclamation en public : ouvre un post dans {salon:s_aide}. Inutile de demander un rôle du staff ou VIP : on recrute dans {salon:s_recrutement}.'],
      ['Discord', 'Les [conditions d\'utilisation](https://discord.com/terms) et les [règles de la communauté](https://discord.com/guidelines) de Discord s\'appliquent ici aussi.'],
    ];
    return regles.map(([t, d], k) => `**${k + 1}. ${t}** — ${d}`).join('\n\n');
  }

  /* ---------- Fabrique d'un modèle complet ---------- */
  function construire(c) {
    const niveauxZone = c.niveaux.filter(([n]) => n >= 20).map(([n]) => `r_niv${n}`);
    const zoneRoles = [...c.communaute.filter(x => x[4]).map(x => x[0]), ...niveauxZone, ...MODOS, 'r_anim', 'r_cm'];
    const contenuIds = c.contenu.map(x => x[0]);
    const couleur = c.couleur;
    // Salons décrits par [id, nom, type, sujet, options] ; « lecture » : seul le staff écrit
    const salons = (liste, lecture) => liste.map(([id, nom, type = 'texte', sujet = '', opts = {}]) => {
      const { ouvert: estOuvert, lecture: estLecture, ...reste } = opts;
      const a = estOuvert ? ouvert() : estLecture && lecture ? lecture() : null;
      return salon(id, nom, type, { sujet, ...reste, ...(a ? { acces: a } : {}) });
    });

    const roles = [
      ...rolesStaff(c),
      sep('r_sep_contenu', '🎬 CONTENU'),
      ...c.contenu.map(([id, nom, coul]) => role(id, nom, coul, 'aucune', { separe: true, perms: [...BONUS_10] })),
      sep('r_sep_communaute', '💜 COMMUNAUTÉ'),
      ...c.communaute.map(([id, nom, coul, separe]) => role(id, nom, coul, 'aucune', { separe: !!separe, perms: [...BONUS_10] })),
      sep('r_sep_niveaux', '📈 NIVEAUX'),
      ...c.niveaux.map(([n, nom, coul]) => role(`r_niv${n}`, nom, coul, 'aucune', { separe: n >= 50, perms: n >= 10 ? [...BONUS_10] : n >= 5 ? [...BONUS_5] : [] })),
      sep('r_sep_membres', '✅ MEMBRES'),
      role('r_membre', '✅ Membre', '#3ddc84', 'aucune', { groupe: 'membre' }),
      sep('r_sep_profil', '🪪 PROFIL'),
      ...PROFIL.map(([id, nom]) => role(id, nom, '', 'aucune')),
      sep('r_sep_notifs', '🔔 NOTIFICATIONS'),
      ...c.notifs.map(([id, nom]) => role(id, nom, '', 'aucune')),
      sep('r_sep_interets', '🎯 CENTRES D\'INTÉRÊT'),
      ...c.interets.roles.map(([id, nom]) => role(id, nom, '', 'aucune')),
    ];

    const categories = [
      cat('c_accueil', '📌 Accueil', { voir: 'tous', ecrire: 'staff' }, [
        salon('s_bienvenue', '👋・bienvenue'),
        salon('s_reglement', '📜・règlement'),
        salon('s_annonces', '📣・annonces', 'annonces', { sujet: 'Les annonces importantes du serveur.' }),
        salon('s_roles', '🎭・rôles', 'texte', { sujet: 'Choisis tes notifications et tes rôles.', acces: lectureMembres() }),
        salon('s_niveaux', '📈・niveaux', 'texte', { sujet: 'Les rôles de niveaux et ce qu\'ils débloquent.', acces: lectureMembres() }),
        salon('s_equipe', '🛡️・l-équipe', 'texte', { sujet: 'Qui fait quoi dans le staff.' }),
        salon('s_reseaux', '🔗・réseaux', 'texte', { sujet: 'Tous les liens du créateur.' }),
        salon('s_partenaires', '🤝・partenaires', 'texte', { sujet: 'Nos partenaires et les conditions pour le devenir.' }),
      ]),
      cat(c.contenuCat.id, c.contenuCat.nom, { voir: 'membres', ecrire: 'staff' }, salons(c.contenuCat.salons, lectureMembres)),
      cat('c_communaute', '💬 Communauté', { voir: 'membres' }, [
        salon('s_general', '💬・général', 'texte', { sujet: 'Discussion libre, dans le respect du règlement.', lent: 2 }),
        salon('s_presentations', '🙋・présentations', 'texte', { sujet: 'Présente-toi en quelques mots : pseudo, passions, comment tu as découvert la chaîne.', lent: 300 }),
        salon('s_medias', '📸・médias', 'texte', { sujet: 'Images et vidéos, sans NSFW.' }),
        ...salons(c.communautePlus),
        salon('s_memes', '😂・memes'),
        salon('s_autopromo', '📢・autopromo', 'texte', { sujet: 'Ton contenu ici, et seulement ici : une publication par heure, avec une phrase pour la présenter.', lent: 3600 }),
        salon('s_suggestions', '💡・suggestions', 'forum', { sujet: 'Une idée pour le serveur ? Un post par idée ; votez avec les réactions.' }),
        salon('s_commandes', '🤖・commandes', 'texte', { sujet: 'Les commandes des bots (niveau, jeux…) se tapent ici.' }),
      ]),
      cat('c_evenements', '🎉 Événements', { voir: 'membres', ecrire: 'staff' }, [
        salon('s_evenements', '🎉・événements', 'texte', { sujet: 'Les prochains événements du serveur.' }),
        salon('s_giveaways', '🎁・giveaways', 'texte', { sujet: 'Concours et cadeaux : suis les consignes de chaque giveaway pour participer.' }),
        ...salons(c.evenementsPlus, lectureMembres),
        salon('s_participations', '🏆・participations', 'forum', { sujet: 'Un post par participation aux concours en cours (titre : le nom du concours).', acces: ouvert() }),
      ]),
      cat('c_zone', c.zone.nom, { voir: 'roles', voirRoles: zoneRoles }, salons(c.zone.salons, () => acces({ voir: 'roles', voirRoles: [...zoneRoles], ecrire: 'staff' }))),
      cat('c_vocal', '🔊 Vocal', { voir: 'membres' }, [
        salon('v_discussion', '🔊 Discussion', 'vocal'),
        salon('v_discussion2', '🔊 Discussion 2', 'vocal'),
        ...salons(c.vocal),
        salon('v_afk', '💤 AFK', 'vocal', { acces: acces({ voir: 'membres', ecrire: 'personne' }) }),
      ]),
      cat('c_support', '🆘 Support', { voir: 'membres' }, [
        salon('s_aide', '❓・aide', 'forum', { sujet: 'Une question, un problème, un signalement ? Crée un post : le staff te répond. Pour un sujet privé, écris à un modérateur en message privé.' }),
        salon('s_recrutement', '📝・recrutement', 'texte', { sujet: 'Les postes ouverts dans l\'équipe.', acces: lectureMembres() }),
      ]),
      cat('c_production', '🎬 Production', { voir: 'roles', voirRoles: ['r_manager', 'r_admin', 'r_cm', ...contenuIds] }, [
        ...salons(c.production),
        salon('v_production', '🔊 Réunion production', 'vocal'),
      ]),
      cat('c_staff', '🛡️ Staff', { voir: 'staff' }, [
        salon('s_staff_infos', '📌・infos-staff', 'texte', { sujet: 'Organisation, règles du staff et décisions importantes.', acces: acces({ voir: 'staff', ecrire: 'roles', ecrireRoles: ['r_createur', 'r_manager', 'r_admin', 'r_resp_modo'] }) }),
        salon('s_staff', '💬・staff'),
        salon('s_sanctions', '⚖️・sanctions', 'texte', { sujet: 'Une ligne par sanction : membre, motif, sanction, preuve.' }),
        salon('s_absences', '📆・absences', 'texte', { sujet: 'Préviens ici quand tu n\'es pas disponible.' }),
        salon('s_logs', '📋・logs', 'texte', { sujet: 'Journal des bots de modération.', acces: acces({ voir: 'staff', ecrire: 'personne' }) }),
        salon('s_direction', '🔒・direction', 'texte', { sujet: 'Décisions, partenariats, recrutements.', acces: acces({ voir: 'roles', voirRoles: ['r_manager', 'r_admin'] }) }),
        salon('v_staff', '🔊 Réunion staff', 'vocal'),
        salon('v_modo', '🔊 Bureau modération', 'vocal'),
      ]),
    ];

    const liste = (l, f) => l.map(f).join('\n');
    const niveauxTxt = c.niveaux.map(([n]) => n).join(', ');
    const messages = [
      // Bienvenue
      msg('s_bienvenue', [embed('👋 Bienvenue sur {serveur} !', `${c.bienvenue}\n\n**Pour bien commencer :**\n📜 Lis le règlement dans {salon:s_reglement} et accepte-le pour débloquer le serveur.\n🎭 Choisis tes notifications et tes rôles dans {salon:s_roles}.\n🙋 Présente-toi dans {salon:s_presentations}.\n💬 Puis viens discuter dans {salon:s_general} !`, couleur,
        { champs: c.bienvenueChamps.map(([n, v]) => champ(n, v, true)), pied: 'Bonne visite !' })]),
      // Règlement à accepter
      msg('s_reglement', [embed('📜 Règlement de {serveur}', texteRegles(c.regles), couleur, {
        champs: [
          champ('⚖️ Sanctions', 'Avertissement → exclusion 1 h → exclusion 24 h → expulsion → bannissement. Raid, doxx ou contenu illégal : bannissement direct.'),
          champ('✅ Pour accéder au serveur', 'Clique sur le bouton ci-dessous : tu acceptes ce règlement et tu débloques tous les salons.'),
        ],
        pied: 'Le staff adapte chaque sanction à la gravité des faits.',
      })], [btnRole('J\'accepte le règlement', '✅', 'r_membre', 'a', 'vert')]),
      // Rôles : notifications, profil, centres d'intérêt
      msg('s_roles', [embed('🔔 Tes notifications', `Clique sur un bouton pour recevoir le rôle et être prévenu ; clique à nouveau pour le retirer. Seule l'équipe peut mentionner ces rôles.\n\n${liste(c.notifs, ([id, , e, quoi]) => `${e} {role:${id}} : ${quoi}`)}`, couleur)],
        c.notifs.map(([id, , e, , texte], k) => btnRole(texte, e, id, 'b', k === 0 ? 'rouge' : 'gris'))),
      msg('s_roles', [embed('🪪 Ton profil', 'Facultatif : aide les autres à mieux te connaître.\n\n**Pronoms** : {role:r_il} · {role:r_elle} · {role:r_iel}\n**Âge** : {role:r_majeur} · {role:r_mineur}', '#9ba3ba')],
        PROFIL.map(([id, , e, texte]) => btnRole(texte, e, id, 'b', 'gris'))),
      msg('s_roles', [embed(c.interets.titre, `${c.interets.texte}\n\n${liste(c.interets.roles, ([id, , e]) => `${e} {role:${id}}`)}`, couleur)],
        c.interets.roles.map(([id, nom, e]) => btnRole(nom.replace(/^\S+\s/, ''), e, id, 'b', 'bleu'))),
      // Niveaux
      msg('s_niveaux', [embed('📈 Les rôles de niveaux', `Chaque message (sans spam) et le temps passé en vocal te font gagner de l'expérience. Regarde ton niveau avec la commande du bot de niveaux, dans {salon:s_commandes}.\n\n${liste(c.niveaux, ([n]) => `{role:r_niv${n}}`)}`, couleur, {
        champs: [champ('🎁 Ce que les niveaux débloquent', `**Niveau 5** : émojis et autocollants des autres serveurs\n**Niveau 10** : messages vocaux et sons externes du soundboard\n**Niveau 20** : accès à la catégorie « ${c.zone.nom} »\n**Niveau 50 et plus** : ton rôle s'affiche à part dans la liste des membres`)],
        pied: 'Le spam fait perdre de l\'expérience, et parfois plus.',
      })]),
      // L'équipe
      msg('s_equipe', [embed('🛡️ L\'équipe de {serveur}', 'Une question ? Ouvre un post dans {salon:s_aide} : un membre du staff te répond. En cas d\'urgence, mentionne {role:r_modo}.', couleur, {
        champs: [
          champ('👑 Direction', '{role:r_createur}\n{role:r_manager}\n{role:r_admin}\nDécisions, partenariats et gestion du serveur.', true),
          champ('🛡️ Modération', '{role:r_resp_modo}\n{role:r_modo}\n{role:r_helper}\nFont respecter le règlement et répondent à vos questions.', true),
          champ('🎉 Animation', '{role:r_anim}\n{role:r_cm}\nÉvénements, concours et vie du serveur.', true),
          champ('🎬 Contenu', `${liste(c.contenu, ([id]) => `{role:${id}}`)}\n${c.contenuMission}`, true),
        ],
      })]),
      // Réseaux
      msg('s_reseaux', [embed('🔗 Retrouve-moi partout', `${liste(c.reseaux, ([e, nom, lien]) => `${e} **${nom}** — ${lien}`)}\n\nActive les notifications pour ne rien rater, et prends les rôles de notification dans {salon:s_roles}.`, couleur)]),
      // Partenaires
      msg('s_partenaires', [embed('🤝 Partenariats', 'Tu as une communauté ou une chaîne et tu veux t\'associer avec nous ? Voici les conditions.', couleur, {
        champs: [
          champ('✅ Conditions', '• Une communauté active et sans contenu NSFW ou haineux\n• Un échange équitable (annonce contre annonce)\n• Le respect des règles de Discord'),
          champ('📩 Faire une demande', 'Écris à un {role:r_manager} en message privé, avec le lien de ta communauté et quelques chiffres.'),
        ],
      })]),
      // Recrutement
      msg('s_recrutement', [embed('📝 L\'équipe recrute', 'Tu veux aider à faire vivre {serveur} ? Voici les postes ouverts.', couleur, {
        champs: [
          champ('🔰 Modérateur test', 'Veiller au respect du règlement et accueillir les nouveaux. Première étape avant {role:r_modo}.', true),
          champ('🎉 Animateur', 'Organiser des événements, des jeux et des concours.', true),
          ...c.postes.map(([n, v]) => champ(n, v, true)),
          champ('📋 Ce qu\'on attend', '• Être actif sur le serveur depuis au moins un mois\n• Être calme, à l\'écoute, et respecter le règlement\n• Avoir activé l\'authentification à deux facteurs (A2F) sur ton compte Discord'),
          champ('📩 Postuler', 'Écris à un {role:r_resp_modo} en message privé : présente-toi, donne tes disponibilités et explique pourquoi toi.'),
        ],
      })]),
      // Espace réservé
      msg(c.zone.salons[0][0], [embed(c.zone.titre, c.zone.texte, couleur)]),
      // Organisation du staff
      msg('s_staff_infos', [embed('📌 Organisation du staff', 'À lire par chaque nouveau membre de l\'équipe.', couleur, {
        champs: [
          champ('🪜 Hiérarchie', '{role:r_createur} › {role:r_manager} › {role:r_admin} › {role:r_resp_modo} › {role:r_modo} › {role:r_helper}\n{role:r_anim} et {role:r_cm} : animation et communication. Tout le staff a aussi {role:r_staff}.'),
          champ('⚖️ Échelle des sanctions', '1. Avertissement\n2. Exclusion 1 h\n3. Exclusion 24 h\n4. Expulsion\n5. Bannissement\nRaid, doxx ou contenu illégal : bannissement direct.', true),
          champ('📋 Après chaque sanction', 'Note-la dans {salon:s_sanctions} : membre, motif, sanction et preuve (capture).', true),
          champ('🤝 Règles du staff', '• Ce qui se dit ici reste ici\n• Jamais de sanction dans un conflit personnel : passe la main\n• Un doute ? Demande à un {role:r_resp_modo}\n• Absent quelques jours ? Préviens dans {salon:s_absences}'),
          champ('🤖 À configurer', `• Bot de niveaux (Arcane, DraftBot, MEE6…) : donne les rôles des niveaux ${niveauxTxt}\n• Bot de notifications : mentionne les rôles de notifications à chaque nouveau contenu\n• ${c.soutiens}`),
        ],
      })]),
      ...c.messages(couleur, msg, champ),
    ];

    return {
      everyone: [...EVERYONE],
      roles,
      libres: [],
      categories,
      messages,
      reglages: reglagesDefaut({ verification: 2, notifications: 'mentions', filtre: 2, bienvenue: 's_general', reglement: 's_reglement', majs: 's_staff_infos', communaute: true, afk: 'v_afk', afkDelai: 900 }),
    };
  }

  /* ---------- Les modèles ---------- */
  const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const POINTS = ['Staff sur 8 rangs', '8 rôles de niveaux', 'Rôles communautaires', 'Zone réservée', 'Production', '13 messages prêts'];

  const twitch = {
    couleur: '#9146ff',
    createur: ['👑 Streamer', '#9146ff'],
    contenu: [['r_monteur', '🎬 Monteur', '#ff8a5b'], ['r_graphiste', '🖌️ Graphiste', '#ffb86b'], ['r_clippeur_off', '✂️ Clippeur officiel', '#ffd166'], ['r_regie', '🎛️ Régie live', '#6ee7ff']],
    contenuMission: 'Montage des vidéos, visuels, clips et régie pendant les lives.',
    communaute: [
      ['r_partenaire', '🤝 Partenaire', '#43b581', true, true], ['r_vip', '💎 VIP', '#ff73fa', true, true], ['r_abonne', '💜 Abonné Twitch', '#a970ff', true, true],
      ['r_ancien', '🎖️ Ancien', '#d4a373', false, true], ['r_gagnant', '🏆 Gagnant', '#ffd166'], ['r_artiste', '🎨 Artiste', '#f78fd8'], ['r_clippeur', '✂️ Clippeur', '#ffcf8a'], ['r_invite', '🎙️ Invité du live', '#6ee7ff'],
    ],
    niveaux: [[1, '🌱 Niv. 1 · Spectateur', '#a3b1c2'], [5, '👀 Niv. 5 · Viewer', '#8fd3c7'], [10, '💬 Niv. 10 · Chatteur', '#6ecb8f'], [20, '🔥 Niv. 20 · Habitué', '#f4b860'],
      [30, '⭐ Niv. 30 · Pilier du chat', '#f08a5d'], [50, '💎 Niv. 50 · Légende du live', '#b388ff'], [75, '👑 Niv. 75 · Mythique', '#ff6b8b'], [100, '🌌 Niv. 100 · Immortel', '#e8b46a']],
    notifs: [['r_notif_live', '🔴 Notif live', '🔴', 'quand le live commence', 'Lives'], ['r_notif_planning', '📅 Notif planning', '📅', 'le planning de la semaine', 'Planning'],
      ['r_notif_videos', '🎬 Notif vidéos', '🎬', 'les vidéos, best-of et rediffs', 'Vidéos'], ['r_notif_annonces', '📢 Notif annonces', '📢', 'les annonces importantes', 'Annonces'],
      ['r_notif_events', '🎉 Notif événements', '🎉', 'soirées viewers et tournois', 'Événements'], ['r_notif_giveaways', '🎁 Notif giveaways', '🎁', 'les concours et cadeaux', 'Giveaways']],
    interets: { titre: '🎮 Tes jeux', texte: 'Choisis tes styles de jeux : tu seras mentionné quand on cherche des joueurs pour une partie avec les viewers.',
      roles: [['r_fps', '🔫 FPS', '🔫'], ['r_moba', '⚔️ MOBA', '⚔️'], ['r_sandbox', '⛏️ Sandbox et survie', '⛏️'], ['r_course', '🏎️ Course', '🏎️'], ['r_horreur', '👻 Horreur', '👻'], ['r_indes', '🧩 Jeux indés', '🧩']] },
    contenuCat: { id: 'c_live', nom: '🔴 Le live', salons: [
      ['s_live', '🔴・live-en-cours', 'annonces', 'Chaque live est annoncé ici, avec le lien.'],
      ['s_planning', '📅・planning', 'texte', 'Le programme des lives de la semaine.'],
      ['s_rediffs', '📺・rediffs-et-vidéos', 'annonces', 'Rediffusions, best-of et vidéos YouTube.'],
      ['s_clips', '🎬・clips', 'texte', 'Les meilleurs moments des lives : un lien de clip par message.', { ouvert: true, lent: 30 }],
      ['s_idees', '💡・idées-de-live', 'forum', 'Un jeu, un défi, un format ? Un post par idée : le streamer pioche dedans.', { ouvert: true }],
      ['s_sondages', '🗳️・sondages', 'texte', 'Votez pour les prochains jeux et formats.'],
    ] },
    communautePlus: [
      ['s_fanart', '🎨・fan-art', 'texte', 'Tes créations sur la chaîne. Crédite l\'auteur si ce n\'est pas toi.'],
      ['s_lfg', '🎮・recherche-de-joueurs', 'texte', 'Jeu, plateforme, rang : trouve des coéquipiers parmi les viewers.', { lent: 30 }],
    ],
    evenementsPlus: [['s_tournois', '🏆・tournois-viewers', 'texte', 'Inscriptions, règles et résultats des tournois entre viewers.', { lecture: true }]],
    zone: { nom: '💜 Abonnés et habitués', titre: '💜 Merci pour ton soutien !', texte: 'Ici, c\'est le coin des abonnés, des VIP et des membres de niveau 20 et plus : discussions plus calmes, coulisses des lives et infos en avant-première.', salons: [
      ['s_zone', '💜・salon-privé', 'texte', 'Le coin des abonnés, des VIP et des habitués.'],
      ['s_coulisses', '🎟️・coulisses', 'texte', 'Coulisses, avant-premières et infos en avance.', { lecture: true }],
      ['v_zone', '💜 Vocal privé', 'vocal'],
    ] },
    vocal: [['v_viewers', '🎮 Jouer avec les viewers', 'vocal'], ['v_watch', '🍿 Watch party', 'vocal'], ['v_plateau', '🎙️ Plateau du live', 'scene', 'Les invités du live et les questions du public.'],
      ['v_duo', '👥 Duo', 'vocal', '', { limite: 2 }], ['v_squad', '👥 Squad', 'vocal', '', { limite: 5 }]],
    production: [
      ['s_prod_planning', '📋・planning-contenu', 'texte', 'Lives, vidéos et publications à venir.'],
      ['s_prod_montage', '🎬・montage', 'texte', 'Rushs, versions et retours sur les montages.'],
      ['s_prod_visuels', '🖼️・miniatures-et-visuels', 'texte', 'Miniatures, bannières, overlays et émotes.'],
      ['s_prod_clips', '✂️・clips-à-monter', 'texte', 'Les moments des lives à transformer en clips ou en shorts.'],
      ['s_prod_regie', '🎛️・régie-live', 'texte', 'Scènes OBS, alertes, overlays et commandes du chat.'],
    ],
    regles: [
      ['Pendant les lives', 'Pas de backseat (conseils de jeu non demandés), pas de spoilers du jeu en cours et pas de spam dans le chat du live.'],
      ['Les clips', 'Clipper, oui ; détourner un clip pour se moquer ou nuire, non.'],
    ],
    bienvenue: 'Ici se retrouve toute la communauté du live : discussions, clips, jeux entre viewers et événements.',
    bienvenueChamps: [['🔴 Les lives', 'Annoncés dans {salon:s_live}, programme dans {salon:s_planning}.'], ['🎬 Les clips', 'Partage les meilleurs moments dans {salon:s_clips}.'], ['🎮 Jouer ensemble', 'Trouve des coéquipiers dans {salon:s_lfg}.']],
    reseaux: [['🟣', 'Twitch', 'https://twitch.tv/ton-pseudo'], ['▶️', 'YouTube', 'https://youtube.com/@ton-pseudo'], ['🎵', 'TikTok', 'https://tiktok.com/@ton-pseudo'], ['📸', 'Instagram', 'https://instagram.com/ton-pseudo'], ['𝕏', 'X', 'https://x.com/ton-pseudo']],
    postes: [['✂️ Clippeur', 'Repérer les meilleurs moments et les monter en clips courts.'], ['🎛️ Régie live', 'Gérer les scènes, alertes et commandes pendant les lives.']],
    soutiens: 'Rôle {role:r_abonne} : relie Twitch dans Paramètres du serveur › Intégrations, ou donne-le à la main',
    messages: (couleur, m, ch) => [
      m('s_planning', [embed('📅 Planning de la semaine', 'Les horaires peuvent bouger : active {role:r_notif_live} pour être prévenu au lancement.', couleur, {
        champs: jours.map(j => ch(j, j === 'Dimanche' ? 'Repos' : '🔴 20 h — à définir', true)),
        pied: 'Mis à jour chaque lundi',
      })]),
    ],
  };

  const youtube = {
    couleur: '#ff3d57',
    createur: ['👑 YouTubeur', '#ff3d57'],
    contenu: [['r_monteur', '🎬 Monteur', '#ff8a5b'], ['r_miniaturiste', '🖌️ Miniaturiste', '#ffb86b'], ['r_scenariste', '✍️ Scénariste', '#ffd166'], ['r_cadreur', '📹 Cadreur', '#6ee7ff']],
    contenuMission: 'Écriture, tournage, montage et miniatures des vidéos.',
    communaute: [
      ['r_partenaire', '🤝 Partenaire', '#43b581', true, true], ['r_vip', '💎 VIP', '#ff73fa', true, true], ['r_membre_chaine', '❤️ Membre de la chaîne', '#ff5c7a', true, true],
      ['r_ancien', '🎖️ Ancien', '#d4a373', false, true], ['r_gagnant', '🏆 Gagnant', '#ffd166'], ['r_artiste', '🎨 Artiste', '#f78fd8'], ['r_createur_membre', '🎥 Créateur', '#8b9bff'], ['r_invite', '🎙️ Invité', '#6ee7ff'],
    ],
    niveaux: [[1, '🌱 Niv. 1 · Nouvel abonné', '#a3b1c2'], [5, '🔔 Niv. 5 · Cloche activée', '#8fd3c7'], [10, '👍 Niv. 10 · Pouce bleu', '#6ecb8f'], [20, '💬 Niv. 20 · Commentateur', '#f4b860'],
      [30, '🔥 Niv. 30 · Fidèle', '#f08a5d'], [50, '💎 Niv. 50 · Super fan', '#b388ff'], [75, '🏆 Niv. 75 · Légende', '#ff6b8b'], [100, '🌌 Niv. 100 · Icône', '#e8b46a']],
    notifs: [['r_notif_videos', '🎬 Notif vidéos', '🎬', 'chaque nouvelle vidéo', 'Vidéos'], ['r_notif_shorts', '📱 Notif shorts', '📱', 'les shorts', 'Shorts'],
      ['r_notif_premieres', '🔴 Notif lives et premières', '🔴', 'les lives et les premières', 'Lives'], ['r_notif_annonces', '📢 Notif annonces', '📢', 'les annonces importantes', 'Annonces'],
      ['r_notif_events', '🎉 Notif événements', '🎉', 'watch parties et événements', 'Événements'], ['r_notif_giveaways', '🎁 Notif giveaways', '🎁', 'les concours et cadeaux', 'Giveaways']],
    interets: { titre: '🍿 Tes formats préférés', texte: 'Dis-nous ce que tu aimes regarder : ça aide à choisir les prochaines vidéos.',
      roles: [['r_gaming', '🎮 Gaming', '🎮'], ['r_humour', '😂 Humour', '😂'], ['r_culture', '🧠 Culture et science', '🧠'], ['r_vlogs', '🎥 Vlogs', '🎥'], ['r_tutos', '📝 Tutos', '📝'], ['r_debats', '🎙️ Débats', '🎙️']] },
    contenuCat: { id: 'c_chaine', nom: '🎬 La chaîne', salons: [
      ['s_videos', '🎬・nouvelles-vidéos', 'annonces', 'Chaque nouvelle vidéo arrive ici.'],
      ['s_shorts', '📱・shorts', 'annonces', 'Les shorts de la chaîne.'],
      ['s_premieres', '🔴・lives-et-premières', 'annonces', 'Les lives et les premières, avec l\'heure et le lien.'],
      ['s_reactions', '💬・réactions-aux-vidéos', 'forum', 'Un post par vidéo : ton avis, tes moments préférés. Les spoilers sont permis ici.', { ouvert: true }],
      ['s_idees', '💡・idées-de-vidéos', 'forum', 'Une idée de vidéo ? Un post par idée : les plus votées sont étudiées.', { ouvert: true }],
      ['s_sondages', '🗳️・sondages', 'texte', 'Votez pour les prochains sujets et les miniatures.'],
      ['s_making_of', '🎞️・coulisses', 'texte', 'Photos de tournage, bêtisiers et making-of.'],
    ] },
    communautePlus: [
      ['s_fanart', '🎨・fan-art', 'texte', 'Tes créations sur la chaîne. Crédite l\'auteur si ce n\'est pas toi.'],
      ['s_debats', '🗣️・débats', 'texte', 'Les sujets des vidéos, en version discussion. On respecte les avis de chacun.', { lent: 10 }],
    ],
    evenementsPlus: [['s_watch_parties', '🍿・watch-parties', 'texte', 'Les prochaines soirées pour regarder les vidéos ensemble.', { lecture: true }]],
    zone: { nom: '❤️ Membres de la chaîne', titre: '❤️ Bienvenue chez les membres !', texte: 'Merci de soutenir la chaîne ! Ici : vidéos en avant-première, miniatures à départager et discussions avec l\'équipe. Les membres de niveau 20 et plus ont aussi accès à cet espace.', salons: [
      ['s_zone', '❤️・salon-des-membres', 'texte', 'Le coin des membres de la chaîne, des VIP et des habitués.'],
      ['s_avant_premieres', '🎟️・avant-premières', 'texte', 'Vidéos en avant-première et infos en avance. Rien ne sort d\'ici.', { lecture: true }],
      ['v_zone', '❤️ Vocal des membres', 'vocal'],
    ] },
    vocal: [['v_watch', '🍿 Watch party', 'vocal'], ['v_qr', '🎙️ Questions-réponses', 'scene', 'Les sessions de questions-réponses en direct.']],
    production: [
      ['s_prod_planning', '📋・planning-de-sortie', 'texte', 'Calendrier des tournages et des sorties.'],
      ['s_prod_scripts', '✍️・scripts', 'texte', 'Idées retenues, plans et scripts.'],
      ['s_prod_montage', '🎬・montage', 'texte', 'Rushs, versions et retours sur les montages.'],
      ['s_prod_miniatures', '🖼️・miniatures', 'texte', 'Propositions de miniatures et de titres.'],
      ['s_prod_sponsors', '💼・sponsors', 'texte', 'Placements de produit, briefs et échéances.'],
    ],
    regles: [
      ['Les vidéos', 'Pas de spoilers d\'une vidéo sortie depuis moins de 48 h en dehors de {salon:s_reactions}. Pas de réupload des vidéos sans accord.'],
      ['Les avant-premières', 'Ce qui est montré en avant-première reste sur le serveur : aucune fuite.'],
    ],
    bienvenue: 'Ici se retrouve la communauté de la chaîne : réactions aux vidéos, idées, coulisses et événements.',
    bienvenueChamps: [['🎬 Les vidéos', 'Chaque sortie arrive dans {salon:s_videos}.'], ['💬 Ton avis', 'Réagis dans {salon:s_reactions}.'], ['💡 Tes idées', 'Propose des vidéos dans {salon:s_idees}.']],
    reseaux: [['▶️', 'YouTube', 'https://youtube.com/@ton-pseudo'], ['🎵', 'TikTok', 'https://tiktok.com/@ton-pseudo'], ['📸', 'Instagram', 'https://instagram.com/ton-pseudo'], ['𝕏', 'X', 'https://x.com/ton-pseudo'], ['🟣', 'Twitch', 'https://twitch.tv/ton-pseudo']],
    postes: [['🖌️ Miniaturiste', 'Proposer des miniatures et des visuels pour les vidéos.'], ['🎬 Monteur', 'Monter les shorts et les vidéos à partir des rushs.']],
    soutiens: 'Rôle {role:r_membre_chaine} : relie YouTube dans Paramètres du serveur › Intégrations (adhésions à la chaîne), ou donne-le à la main',
    messages: (couleur, m, ch) => [
      m('s_videos', [embed('🎬 Les prochaines sorties', 'Le programme des vidéos à venir. Active {role:r_notif_videos} pour être prévenu à chaque sortie.', couleur, {
        champs: [ch('📅 Cette semaine', 'Vidéo — à définir', true), ch('📅 La semaine prochaine', 'Vidéo — à définir', true), ch('📱 Shorts', 'Tous les deux jours', true)],
      })]),
    ],
  };

  const tiktok = {
    couleur: '#fe2c55',
    createur: ['👑 Créateur', '#fe2c55'],
    contenu: [['r_monteur', '🎬 Monteur', '#ff8a5b'], ['r_photographe', '📸 Photographe', '#ffb86b'], ['r_veille', '📈 Veille tendances', '#25f4ee'], ['r_tournage', '🤳 Partenaire de tournage', '#ffd166']],
    contenuMission: 'Tournage, montage, photos et veille des tendances.',
    communaute: [
      ['r_partenaire', '🤝 Partenaire', '#43b581', true, true], ['r_vip', '💎 VIP', '#ff73fa', true, true], ['r_soutien', '💖 Soutien', '#fe2c55', true, true],
      ['r_topfan', '🔥 Top fan', '#ff9f43', false, true], ['r_ancien', '🎖️ Ancien', '#d4a373', false, true], ['r_gagnant', '🏆 Gagnant', '#ffd166'], ['r_artiste', '🎨 Artiste', '#f78fd8'], ['r_createur_membre', '🎥 Créateur', '#25f4ee'],
    ],
    niveaux: [[1, '🌱 Niv. 1 · Scrolleur', '#a3b1c2'], [5, '👆 Niv. 5 · Double tap', '#8fd3c7'], [10, '💬 Niv. 10 · En commentaire', '#6ecb8f'], [20, '🔁 Niv. 20 · Partageur', '#f4b860'],
      [30, '🔥 Niv. 30 · Pour toi', '#f08a5d'], [50, '💎 Niv. 50 · Viral', '#b388ff'], [75, '🚀 Niv. 75 · Tendance', '#ff6b8b'], [100, '🌌 Niv. 100 · Icône', '#e8b46a']],
    notifs: [['r_notif_tiktok', '📱 Notif TikTok', '📱', 'chaque nouveau TikTok', 'TikTok'], ['r_notif_insta', '📸 Notif Instagram', '📸', 'les posts et reels Instagram', 'Instagram'],
      ['r_notif_lives', '🔴 Notif lives', '🔴', 'les lives', 'Lives'], ['r_notif_annonces', '📢 Notif annonces', '📢', 'les annonces importantes', 'Annonces'],
      ['r_notif_defis', '🔥 Notif défis', '🔥', 'le défi de la semaine', 'Défis'], ['r_notif_giveaways', '🎁 Notif giveaways', '🎁', 'les concours et cadeaux', 'Giveaways']],
    interets: { titre: '✨ Ce que tu aimes', texte: 'Choisis tes univers préférés : ça aide à trouver des idées de vidéos et de duos.',
      roles: [['r_danse', '💃 Danse', '💃'], ['r_humour', '😂 Humour', '😂'], ['r_mode', '💄 Beauté et mode', '💄'], ['r_cuisine', '🍳 Cuisine', '🍳'], ['r_voyage', '✈️ Voyage', '✈️'], ['r_musique', '🎵 Musique', '🎵']] },
    contenuCat: { id: 'c_contenu', nom: '📱 Le contenu', salons: [
      ['s_tiktoks', '📱・nouveaux-tiktoks', 'annonces', 'Chaque nouveau TikTok arrive ici.'],
      ['s_insta', '📸・instagram', 'annonces', 'Posts, reels et stories à ne pas rater.'],
      ['s_lives', '🔴・lives', 'annonces', 'Les lives, avec l\'heure et le lien.'],
      ['s_tendances', '🎵・sons-et-tendances', 'texte', 'Partage les sons et les tendances du moment.', { ouvert: true, lent: 10 }],
      ['s_idees', '💡・idées-de-vidéos', 'forum', 'Une idée de vidéo ou de duo ? Un post par idée.', { ouvert: true }],
      ['s_sondages', '🗳️・sondages', 'texte', 'Votez pour les prochaines vidéos.'],
    ] },
    communautePlus: [
      ['s_duos', '🤳・vos-duos-et-reprises', 'texte', 'Tes duos, reprises et vidéos inspirées du créateur.'],
      ['s_fanart', '🎨・fan-art', 'texte', 'Tes créations sur le créateur. Crédite l\'auteur si ce n\'est pas toi.'],
    ],
    evenementsPlus: [['s_defis', '🔥・défi-de-la-semaine', 'texte', 'Un défi chaque semaine : participe avec le hashtag du serveur.', { lecture: true }]],
    zone: { nom: '💖 Soutiens et top fans', titre: '💖 Merci pour ton soutien !', texte: 'Le coin des soutiens, des top fans, des VIP et des membres de niveau 20 et plus : coulisses des tournages, vidéos en avance et votes réservés.', salons: [
      ['s_zone', '💖・salon-des-soutiens', 'texte', 'Le coin des soutiens, des top fans et des habitués.'],
      ['s_coulisses', '🎬・coulisses', 'texte', 'Coulisses de tournage et vidéos en avance.', { lecture: true }],
      ['v_zone', '💖 Vocal des soutiens', 'vocal'],
    ] },
    vocal: [['v_karaoke', '🎤 Karaoké', 'vocal'], ['v_live', '📱 Live avec le créateur', 'scene', 'Les lives et les sessions de questions en direct.']],
    production: [
      ['s_prod_calendrier', '📋・calendrier-de-publication', 'texte', 'Ce qui sort, où et quand.'],
      ['s_prod_idees', '💡・idées-et-scripts', 'texte', 'Concepts retenus, accroches et scripts.'],
      ['s_prod_montage', '🎬・montage', 'texte', 'Rushs, versions et retours.'],
      ['s_prod_shootings', '📸・shootings', 'texte', 'Organisation des tournages et des photos.'],
      ['s_prod_marques', '🤝・collabs-et-marques', 'texte', 'Partenariats, briefs des marques et échéances.'],
    ],
    regles: [
      ['Les vidéos', 'Pas de réupload ni de vol de contenu. Pour un duo ou une reprise, cite toujours le créateur.'],
      ['Les défis', 'Aucun défi dangereux : le staff retire toute participation qui met quelqu\'un en danger.'],
    ],
    bienvenue: 'Ici se retrouve la communauté du créateur : nouvelles vidéos, tendances, défis et duos.',
    bienvenueChamps: [['📱 Les vidéos', 'Elles arrivent dans {salon:s_tiktoks}.'], ['🔥 Le défi', 'Chaque semaine dans {salon:s_defis}.'], ['🎵 Les tendances', 'Partage-les dans {salon:s_tendances}.']],
    reseaux: [['🎵', 'TikTok', 'https://tiktok.com/@ton-pseudo'], ['📸', 'Instagram', 'https://instagram.com/ton-pseudo'], ['▶️', 'YouTube', 'https://youtube.com/@ton-pseudo'], ['👻', 'Snapchat', 'https://snapchat.com/add/ton-pseudo'], ['𝕏', 'X', 'https://x.com/ton-pseudo']],
    postes: [['📈 Veille tendances', 'Repérer les sons et les formats qui montent.'], ['🎬 Monteur', 'Monter des vidéos courtes et dynamiques.']],
    soutiens: 'Rôles {role:r_soutien} et {role:r_topfan} : à donner à la main (abonnements TikTok ou Instagram, top fans des lives)',
    messages: (couleur, m, ch) => [
      m('s_defis', [embed('🔥 Le défi de la semaine', 'Chaque lundi, un nouveau défi. Publie ta vidéo avec le hashtag du serveur, puis poste-la dans {salon:s_participations}.', couleur, {
        champs: [ch('🎯 Défi en cours', 'À définir', true), ch('🏁 Fin', 'Dimanche soir', true), ch('🏆 À gagner', 'Le rôle {role:r_gagnant} et un passage en story', true), ch('⚠️ Sécurité', 'Aucun défi dangereux n\'est accepté.')],
      })]),
    ],
  };

  const podcast = {
    couleur: '#ff9f43',
    createur: ['👑 Hôte', '#ff9f43'],
    contenu: [['r_ingeson', '🎚️ Ingé son', '#6ee7ff'], ['r_realisateur', '🎬 Réalisateur', '#ff8a5b'], ['r_chroniqueur', '📝 Chroniqueur', '#ffd166'], ['r_graphiste', '🖌️ Graphiste', '#ffb86b']],
    contenuMission: 'Préparation, enregistrement, son, montage et visuels de l\'émission.',
    communaute: [
      ['r_partenaire', '🤝 Partenaire', '#43b581', true, true], ['r_vip', '💎 VIP', '#ff73fa', true, true], ['r_soutien', '🎧 Soutien', '#ff9f43', true, true],
      ['r_invite', '🎙️ Ancien invité', '#6ee7ff', true, true], ['r_ancien', '🎖️ Ancien', '#d4a373', false, true], ['r_question', '❓ Question à l\'antenne', '#8fd3c7'], ['r_gagnant', '🏆 Gagnant', '#ffd166'], ['r_createur_membre', '🎥 Créateur', '#8b9bff'],
    ],
    niveaux: [[1, '🌱 Niv. 1 · Nouvel auditeur', '#a3b1c2'], [5, '🎧 Niv. 5 · Auditeur', '#8fd3c7'], [10, '📻 Niv. 10 · Fidèle de l\'antenne', '#6ecb8f'], [20, '💬 Niv. 20 · Habitué', '#f4b860'],
      [30, '🎙️ Niv. 30 · Voix du public', '#f08a5d'], [50, '⭐ Niv. 50 · Membre du club', '#b388ff'], [75, '🏆 Niv. 75 · Légende', '#ff6b8b'], [100, '🌌 Niv. 100 · Pilier de l\'émission', '#e8b46a']],
    notifs: [['r_notif_episodes', '🎧 Notif épisodes', '🎧', 'chaque nouvel épisode', 'Épisodes'], ['r_notif_direct', '🔴 Notif direct', '🔴', 'les enregistrements en direct', 'Direct'],
      ['r_notif_extraits', '✂️ Notif extraits', '✂️', 'les extraits et les shorts', 'Extraits'], ['r_notif_annonces', '📢 Notif annonces', '📢', 'les annonces importantes', 'Annonces'],
      ['r_notif_events', '🎉 Notif événements', '🎉', 'émissions publiques et événements', 'Événements'], ['r_notif_giveaways', '🎁 Notif giveaways', '🎁', 'les concours et cadeaux', 'Giveaways']],
    interets: { titre: '🗂️ Tes thèmes', texte: 'Choisis les sujets qui t\'intéressent : on s\'en sert pour choisir les prochains thèmes et invités.',
      roles: [['r_cinema', '🎬 Cinéma et séries', '🎬'], ['r_jv', '🎮 Jeux vidéo', '🎮'], ['r_culture', '📚 Culture', '📚'], ['r_sport', '⚽ Sport', '⚽'], ['r_business', '💼 Business', '💼'], ['r_societe', '🧠 Société', '🧠']] },
    contenuCat: { id: 'c_emission', nom: '🎙️ L\'émission', salons: [
      ['s_episodes', '🎧・épisodes', 'annonces', 'Chaque nouvel épisode, avec les liens d\'écoute.'],
      ['s_extraits', '✂️・extraits', 'annonces', 'Les meilleurs moments en vidéo courte.'],
      ['s_direct', '🔴・enregistrements-en-direct', 'annonces', 'Les enregistrements en public : heure, lien et invités.'],
      ['s_questions', '❓・vos-questions', 'forum', 'Une question pour la prochaine émission ? Un post par question : les plus votées passent à l\'antenne.', { ouvert: true }],
      ['s_debrief', '💬・débrief-des-épisodes', 'forum', 'Un post par épisode pour en discuter.', { ouvert: true }],
      ['s_sujets', '💡・idées-de-sujets', 'forum', 'Un sujet, un invité à proposer ? Un post par idée.', { ouvert: true }],
      ['s_invites_a_venir', '🎙️・invités-à-venir', 'texte', 'Les prochains invités de l\'émission.'],
    ] },
    communautePlus: [['s_debats', '🗣️・débats', 'texte', 'On débat des idées, jamais des personnes.', { lent: 10 }], ['s_recos', '📚・recommandations', 'texte', 'Livres, films, podcasts : partage tes coups de cœur.']],
    evenementsPlus: [['s_publiques', '🎟️・émissions-publiques', 'texte', 'Les enregistrements en public et les rencontres.', { lecture: true }]],
    zone: { nom: '🎧 Club des soutiens', titre: '🎧 Bienvenue au club !', texte: 'Merci de soutenir l\'émission ! Ici : épisodes en avance, coulisses des enregistrements et votes sur les prochains invités. Les membres de niveau 20 et plus y ont aussi accès.', salons: [
      ['s_zone', '🎧・le-club', 'texte', 'Le coin des soutiens, des anciens invités et des habitués.'],
      ['s_en_avance', '🎟️・épisodes-en-avance', 'texte', 'Les épisodes avant leur sortie publique. Rien ne sort d\'ici.', { lecture: true }],
      ['v_zone', '🎧 Vocal du club', 'vocal'],
    ] },
    vocal: [['v_plateau', '🎙️ Plateau en direct', 'scene', 'Les enregistrements en public et les questions des auditeurs.'], ['v_ecoute', '🎧 Écoute commune', 'vocal']],
    production: [
      ['s_prod_conducteur', '📋・conducteur', 'texte', 'Le déroulé de chaque épisode : thèmes, chroniques, timing.'],
      ['s_prod_planning', '🗓️・planning-des-enregistrements', 'texte', 'Dates, lieux et invités des prochains enregistrements.'],
      ['s_prod_son', '🎚️・son-et-montage', 'texte', 'Pistes, versions et retours sur le montage.'],
      ['s_prod_chroniques', '📝・chroniques', 'texte', 'Textes et sources des chroniqueurs.'],
      ['s_prod_invites', '🤝・invités-et-contacts', 'texte', 'Invités pressentis, contacts et confirmations.'],
      ['v_studio', '🎙️ Studio', 'vocal', '', { limite: 6 }],
    ],
    regles: [
      ['Les débats', 'On débat des idées, jamais des personnes. On reste courtois, même en désaccord.'],
      ['Les invités', 'Respect total envers les invités de l\'émission, ici comme ailleurs.'],
    ],
    bienvenue: 'Ici se retrouvent les auditeurs de l\'émission : épisodes, questions pour l\'antenne, débats et enregistrements en direct.',
    bienvenueChamps: [['🎧 Les épisodes', 'Ils arrivent dans {salon:s_episodes}.'], ['❓ Ta question', 'Pose-la dans {salon:s_questions}.'], ['🔴 En direct', 'Rejoins le plateau lors des enregistrements publics.']],
    reseaux: [['🎧', 'Spotify', 'https://open.spotify.com/show/ton-emission'], ['🍎', 'Apple Podcasts', 'https://podcasts.apple.com/ton-emission'], ['▶️', 'YouTube', 'https://youtube.com/@ton-emission'], ['📸', 'Instagram', 'https://instagram.com/ton-emission'], ['𝕏', 'X', 'https://x.com/ton-emission']],
    postes: [['📝 Chroniqueur', 'Préparer et présenter une chronique régulière.'], ['🎚️ Ingé son', 'Enregistrer, nettoyer et monter le son des épisodes.']],
    soutiens: 'Rôle {role:r_soutien} : relie Patreon dans Paramètres du serveur › Intégrations, ou donne-le à la main',
    messages: (couleur, m, ch) => [
      m('s_invites_a_venir', [embed('🎙️ Les prochains invités', 'Prépare tes questions dans {salon:s_questions} !', couleur, {
        champs: [ch('Épisode 1', 'Invité — à définir\nDate — à définir', true), ch('Épisode 2', 'Invité — à définir\nDate — à définir', true), ch('Épisode 3', 'Invité — à définir\nDate — à définir', true)],
      })]),
    ],
  };

  const artiste = {
    couleur: '#f78fd8',
    createur: ['👑 Artiste', '#f78fd8'],
    contenu: [['r_assistant', '🎨 Assistant artistique', '#ffb86b'], ['r_boutique', '🛍️ Gestion boutique', '#6ecb8f'], ['r_resp_commandes', '📋 Gestion des commandes', '#ffd166']],
    contenuMission: 'Commandes, boutique et préparation des publications.',
    communaute: [
      ['r_partenaire', '🤝 Partenaire', '#43b581', true, true], ['r_vip', '💎 VIP', '#ff73fa', true, true], ['r_soutien', '💖 Soutien', '#f78fd8', true, true],
      ['r_client', '🧾 Client', '#8fd3c7', false, true], ['r_ancien', '🎖️ Ancien', '#d4a373', false, true], ['r_artiste_confirme', '🖼️ Artiste confirmé', '#c3a6ff', true], ['r_gagnant', '🏆 Gagnant de défi', '#ffd166'], ['r_createur_membre', '🎥 Créateur', '#8b9bff'],
    ],
    niveaux: [[1, '✏️ Niv. 1 · Croquis', '#a3b1c2'], [5, '🖍️ Niv. 5 · Esquisse', '#8fd3c7'], [10, '🎨 Niv. 10 · Aquarelle', '#6ecb8f'], [20, '🖌️ Niv. 20 · Pinceau', '#f4b860'],
      [30, '🖼️ Niv. 30 · Toile', '#f08a5d'], [50, '🏛️ Niv. 50 · Exposition', '#b388ff'], [75, '💎 Niv. 75 · Chef-d\'œuvre', '#ff6b8b'], [100, '🌌 Niv. 100 · Musée', '#e8b46a']],
    notifs: [['r_notif_oeuvres', '🖼️ Notif œuvres', '🖼️', 'chaque nouvelle œuvre', 'Œuvres'], ['r_notif_lives', '🔴 Notif lives dessin', '🔴', 'les lives de dessin', 'Lives'],
      ['r_notif_commandes', '💼 Notif commandes', '💼', 'l\'ouverture des commandes', 'Commandes'], ['r_notif_annonces', '📢 Notif annonces', '📢', 'les annonces importantes', 'Annonces'],
      ['r_notif_defis', '🏆 Notif défis', '🏆', 'les défis artistiques', 'Défis'], ['r_notif_giveaways', '🎁 Notif giveaways', '🎁', 'les concours et cadeaux', 'Giveaways']],
    interets: { titre: '🎨 Ta pratique', texte: 'Choisis ce que tu pratiques : pour trouver des artistes qui partagent ta technique.',
      roles: [['r_trad', '✏️ Dessin traditionnel', '✏️'], ['r_num', '💻 Dessin numérique', '💻'], ['r_3d', '🧊 3D', '🧊'], ['r_peinture', '🎨 Peinture', '🎨'], ['r_photo', '📸 Photo', '📸'], ['r_ecriture', '✍️ Écriture', '✍️']] },
    contenuCat: { id: 'c_galerie', nom: '🖼️ La galerie', salons: [
      ['s_oeuvres', '🖼️・nouvelles-œuvres', 'annonces', 'Chaque nouvelle œuvre arrive ici.'],
      ['s_lives', '🔴・lives-dessin', 'annonces', 'Les lives de dessin, avec l\'heure et le lien.'],
      ['s_wip', '🚧・en-cours', 'texte', 'Croquis et travaux en cours.'],
      ['s_commandes', '💼・commandes', 'texte', 'Tarifs, délais et conditions des commandes.'],
      ['s_demandes', '🧾・demandes-de-commande', 'forum', 'Un post par demande : ce que tu veux, tes références, ton budget et ton délai.', { ouvert: true }],
      ['s_boutique', '🛍️・boutique', 'texte', 'Prints, stickers et produits disponibles.'],
    ] },
    communautePlus: [
      ['s_vos_oeuvres', '🎨・vos-créations', 'texte', 'Partage tes œuvres ! Une publication à la fois, avec un mot pour la présenter.', { lent: 60 }],
      ['s_critiques', '🧐・avis-et-critiques', 'forum', 'Demande un avis constructif sur ton travail : un post par œuvre.'],
      ['s_ressources', '📚・ressources-et-tutos', 'texte', 'Tutos, pinceaux, références et outils utiles.'],
      ['s_fanart', '💗・fan-art', 'texte', 'Tes fan-arts des personnages de l\'artiste.'],
    ],
    evenementsPlus: [['s_defis', '🏆・défis-artistiques', 'texte', 'Défis du mois, thèmes imposés, Inktober…', { lecture: true }]],
    zone: { nom: '💖 Soutiens et clients', titre: '💖 Merci pour ton soutien !', texte: 'Ici : œuvres en avant-première, fonds d\'écran, croquis exclusifs et accès prioritaire aux commandes. Les membres de niveau 20 et plus y ont aussi accès.', salons: [
      ['s_zone', '💖・salon-des-soutiens', 'texte', 'Le coin des soutiens, des clients et des habitués.'],
      ['s_bonus', '🎁・fonds-d-écran-et-bonus', 'texte', 'Fonds d\'écran, croquis exclusifs et fichiers bonus.', { lecture: true }],
      ['s_avant_premieres', '🎟️・avant-premières', 'texte', 'Les œuvres avant leur publication.', { lecture: true }],
      ['v_zone', '💖 Vocal des soutiens', 'vocal'],
    ] },
    vocal: [['v_dessin', '🎨 Dessiner ensemble', 'vocal'], ['v_live', '🖌️ Live dessin', 'scene', 'Les lives de dessin et les critiques en direct.']],
    production: [
      ['s_prod_commandes', '📋・suivi-des-commandes', 'texte', 'Une ligne par commande : client, demande, prix, échéance, état.'],
      ['s_prod_boutique', '🛍️・boutique-et-stocks', 'texte', 'Produits, stocks, envois.'],
      ['s_prod_publications', '📣・publications', 'texte', 'Calendrier des publications sur les réseaux.'],
      ['s_prod_retouches', '🎨・retouches', 'texte', 'Fichiers, versions et retouches.'],
    ],
    regles: [
      ['Les œuvres', 'Pas de vol ni de retouche d\'une œuvre sans accord. Crédite toujours l\'artiste. Les images générées par IA sont signalées comme telles.'],
      ['Les critiques', 'Les avis sont constructifs et bienveillants : on parle de l\'œuvre, pas de la personne.'],
      ['Les commandes', 'Tarifs et délais dans {salon:s_commandes}. Pas de négociation en public.'],
    ],
    bienvenue: 'Ici se retrouvent les amoureux de l\'art de l\'artiste : nouvelles œuvres, lives de dessin, défis et entraide entre artistes.',
    bienvenueChamps: [['🖼️ Les œuvres', 'Elles arrivent dans {salon:s_oeuvres}.'], ['🎨 Tes créations', 'Partage-les dans {salon:s_vos_oeuvres}.'], ['💼 Les commandes', 'Tout est expliqué dans {salon:s_commandes}.']],
    reseaux: [['📸', 'Instagram', 'https://instagram.com/ton-pseudo'], ['🎵', 'TikTok', 'https://tiktok.com/@ton-pseudo'], ['🦋', 'Bluesky', 'https://bsky.app/profile/ton-pseudo'], ['🛍️', 'Boutique', 'https://ta-boutique.fr'], ['☕', 'Ko-fi', 'https://ko-fi.com/ton-pseudo']],
    postes: [['📋 Gestion des commandes', 'Répondre aux demandes et suivre les commandes.'], ['🛍️ Gestion boutique', 'Mettre à jour la boutique et suivre les envois.']],
    soutiens: 'Rôles {role:r_soutien} et {role:r_client} : relie Patreon ou Ko-fi dans Paramètres du serveur › Intégrations, ou donne-les à la main',
    messages: (couleur, m, ch) => [
      m('s_commandes', [embed('💼 Les commandes', 'Tu veux une illustration rien que pour toi ? Voici comment ça marche. Statut actuel : **à définir** (ouvertes ou fermées).', couleur, {
        champs: [
          ch('🖼️ Buste', 'à partir de … €', true), ch('🧍 Personnage entier', 'à partir de … €', true), ch('🌄 Scène complète', 'sur devis', true),
          ch('⏱️ Délais', 'Comptez 2 à 4 semaines selon la demande.'),
          ch('📋 Comment commander', '1. Ouvre un post dans {salon:s_demandes} avec tes références\n2. On valide ensemble la demande et le prix\n3. Acompte de 50 %, croquis, puis version finale\n4. Paiement du solde et envoi du fichier en haute définition'),
          ch('🚫 Ce que je ne fais pas', 'NSFW, contenus haineux, reproduction du style d\'un autre artiste.'),
        ],
      })]),
    ],
  };

  const modele = (nom, resume, cfg) => ({ nom, resume, points: POINTS, theme: 'createurs', creer: () => construire(cfg) });
  return {
    streamer: modele('Streamer Twitch', 'Lives annoncés et planning, clips, idées de live, jeux et tournois entre viewers, plateau pour les invités, zone abonnés et habitués.', twitch),
    youtubeur: modele('YouTubeur', 'Nouvelles vidéos, shorts et premières, un post de réaction par vidéo, idées de vidéos, watch parties, espace des membres de la chaîne.', youtube),
    tiktok: modele('Créateur TikTok et réseaux', 'TikTok, Instagram et lives, sons et tendances, défi de la semaine, duos et reprises, zone soutiens et top fans.', tiktok),
    podcast: modele('Podcast et émission', 'Épisodes et extraits, questions pour l\'antenne, débrief par épisode, plateau en direct, club des soutiens, conducteur et studio pour l\'équipe.', podcast),
    artiste: modele('Artiste et illustrateur', 'Galerie et lives dessin, commandes avec forum de demandes, avis et critiques, défis artistiques, bonus pour les soutiens et suivi des commandes.', artiste),
  };
};
