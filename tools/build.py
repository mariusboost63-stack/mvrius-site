#!/usr/bin/env python3
"""Prépare le site avant publication.

Usage : python3 tools/build.py

1. Écrit les versions allégées (minifiées) de style.css, main.js et reservation.js
   (style.min.css, main.min.js, reservation.min.js : ce sont elles que les pages chargent),
   puis ajoute aux liens un numéro de version (?v=…) calculé à partir de leur contenu :
   les navigateurs rechargent ainsi les fichiers à chaque mise à jour au lieu de garder
   une ancienne version en mémoire. On modifie toujours les fichiers d'origine, jamais les .min.
2. Génère les pages « Conseils » (conseils/index.html et conseils/<article>/index.html)
   à partir des textes de tools/articles/, avec la navigation et le pied de page du site,
   et leur version anglaise (en/conseils/…) à partir de tools/articles/en/.
3. Génère les pages du site à partir de tools/site.html (toutes les sections) : l'accueil
   (index.html : présentation + menu des pages) et une page par section (services/,
   projets/, avis/, diagnostic/, faq/, contact/), en français puis en anglais (en/…).
   Chaque texte français de la table doit exister dans tools/site.html : si une phrase a
   été modifiée côté français, le script s'arrête et indique laquelle.
4. Génère sitemap.xml et robots.txt pour les moteurs de recherche.
5. Génère les pages des scores partagés du diagnostic express (diagnostic/<score>/).
"""
import hashlib
import json
import pathlib
import re
import sys
import unicodedata
import urllib.parse

from minify import minify_css, minify_js

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "site.html"  # source de l'accueil et des pages du site (toutes les sections)
STAMPED = ["tools/site.html", "staff/index.html", "liens/index.html", "404.html"]

# Articles « Conseils », du plus récent au plus ancien (textes dans tools/articles/<nom>.html,
# et leur traduction anglaise dans tools/articles/en/<nom>.html, obligatoire)
ARTICLES = [
    "securiser-serveur-discord", "reglement-serveur-discord", "relancer-serveur-discord-inactif",
    "bots-arvenis-discord", "organiser-evenement-discord", "discord-createurs-de-contenu",
    "erreurs-serveur-discord", "structurer-salons-discord", "recruter-equipe-moderation",
]
SITE = "https://mvriuus.fr/"
# Pages légales (textes dans tools/pages/<nom>.html)
PAGES = ["mentions-legales", "cgu"]
RESA = "rendez-vous"  # page « Réserver un appel » (créneaux venant du serveur de l'agenda)
SECTIONS = ("services", "projets", "avis", "diagnostic", "conseils", "faq", "reseaux", "contact")
# Une page par section de tools/site.html : titre et description (français, anglais).
# conseils/ et en/conseils/ sont les listes des articles (build_listing), pas des pages de section.
SITE_PAGES = {
    "services": (("Services", "Modération, administration technique, développement communautaire et réseaux sociaux : les services de Mvrius pour votre serveur Discord."),
                 ("Services", "Moderation, technical administration, community growth and social media: Mvrius's services for your Discord server.")),
    "projets": (("Projets", "Les communautés Discord que je gère et accompagne : Le Café Français, Arvenis, Nico Là, Byilhan et d'autres, avec leurs chiffres en direct."),
                ("Projects", "The Discord communities I run and support: Le Café Français, Arvenis, Nico Là, Byilhan and more, with live numbers.")),
    "avis": (("Avis clients", "Ce que disent les créateurs et les serveurs Discord accompagnés par Mvrius."),
             ("Client reviews", "What the creators and Discord servers I work with say about my work.")),
    "diagnostic": (("Diagnostic express", "6 questions, une minute : obtenez un score sur 100 et des conseils personnalisés pour votre serveur Discord."),
                   ("Quick check-up", "6 questions, one minute: get a score out of 100 and personalised tips for your Discord server.")),
    "conseils": (None, None),
    "faq": (("FAQ", "Tarifs, déroulé d'une mission, délais, paiement, accès : les réponses aux questions fréquentes."),
            ("FAQ", "Pricing, how a project works, timing, payment, access: answers to frequently asked questions.")),
    "reseaux": (("Réseaux", "Retrouvez Mvrius sur X (@mariusatqz), Instagram, Discord et Guns.lol."),
                ("Socials", "Find Mvrius on X (@mariusatqz), Instagram, Discord and Guns.lol.")),
    "contact": (("Contact", "Parlez-moi de votre projet Discord : demande de devis, e-mail ou appel."),
                ("Contact", "Tell me about your Discord project: quote request, email or call.")),
}

# (texte français, texte anglais, nombre d'occurrences attendu)
T = [
    # --- En-tête du document ---
    ('<html lang="fr">', '<html lang="en">', 1),
    ('<title>Mvrius — Community Manager Discord &amp; Réseaux sociaux</title>',
     '<title>Mvrius — Discord Community Manager &amp; Social Media</title>', 1),
    ('content="Marius (Mvrius), expert en gestion de communautés Discord : modération professionnelle, administration technique, stratégies d\'engagement et gestion des réseaux sociaux."',
     'content="Marius (Mvrius), Discord community management expert: professional moderation, technical administration, engagement strategies and social media management."', 1),
    ('<meta property="og:locale" content="fr_FR">',
     '<meta property="og:locale" content="en_US">\n  <meta property="og:locale:alternate" content="fr_FR">', 1),
    ('<meta property="og:title" content="Mvrius — Community Manager Discord">',
     '<meta property="og:title" content="Mvrius — Discord Community Manager">', 1),
    ('content="CEO d\'Arvenis, gérant du Café Français et administrateur des communautés de Nico Là et Byilhan. Modération, administration et stratégies d\'engagement sur Discord."',
     'content="CEO of Arvenis, manager of Le Café Français and administrator of the Nico Là and Byilhan communities. Moderation, administration and engagement strategies on Discord."', 1),
    ('content="Mvrius, Community Manager Discord : Le Café Français, Arvenis, Nico Là et Byilhan"',
     'content="Mvrius, Discord Community Manager: Le Café Français, Arvenis, Nico Là and Byilhan"', 1),

    # --- Navigation ---
    ('>Aller au contenu</a>', '>Skip to content</a>', 1),
    ('aria-label="Mvrius, retour en haut"', 'aria-label="Mvrius, back to top"', 1),
    ('aria-label="Navigation principale"', 'aria-label="Main navigation"', 1),
    ('data-text="Projets"><span>Projets</span>', 'data-text="Projects"><span>Projects</span>', 1),
    ('data-text="Avis"><span>Avis</span>', 'data-text="Reviews"><span>Reviews</span>', 1),
    ('<a href="staff/" data-text="Recrutement"><span>Recrutement</span></a>',
     '<a href="staff/" data-text="Join us"><span>Join us</span></a>', 1),
    ('<a href="staff/"><small>08</small>Recrutement</a>', '<a href="staff/"><small>08</small>Join us</a>', 1),
    ('<a class="lang" href="en/" hreflang="en" lang="en" aria-label="English version">EN</a>',
     '<a class="lang" href="" hreflang="fr" lang="fr" aria-label="Version française">FR</a>', 1),  # lien posé par build_site
    ('aria-label="Ouvrir le menu"', 'aria-label="Open menu"', 1),
    ('aria-label="Menu mobile"', 'aria-label="Mobile menu"', 1),
    ('<small>02</small>Projets</a>', '<small>02</small>Projects</a>', 1),
    ('<small>03</small>Avis</a>', '<small>03</small>Reviews</a>', 1),
    ('data-text="Diagnostic"><span>Diagnostic</span>', 'data-text="Check-up"><span>Check-up</span>', 1),
    ('data-text="Conseils"><span>Conseils</span>', 'data-text="Tips"><span>Tips</span>', 1),
    ('<small>04</small>Diagnostic</a>', '<small>04</small>Check-up</a>', 1),
    ('<small>05</small>Conseils</a>', '<small>05</small>Tips</a>', 1),
    ('<p>Expert en gestion de communautés Discord. Disponible pour de nouvelles collaborations.</p>',
     '<p>Discord community management expert. Available for new collaborations.</p>', 1),
    ('Disponible pour de nouvelles collaborations', 'Available for new collaborations', 2),

    # --- Accueil ---
    ('<span style="--i:0">Je fais grandir</span>', '<span style="--i:0">I grow your</span>', 1),
    ('<span style="--i:1">vos <em>communautés</em></span>', '<span style="--i:1"><em>communities</em></span>', 1),
    ('<span style="--i:2">Discord<span class="accent-dot">.</span></span>',
     '<span style="--i:2">on Discord<span class="accent-dot">.</span></span>', 1),
    ('Expert en gestion de communautés Discord&nbsp;: modération professionnelle, administration technique et stratégies d\'engagement pour créer des espaces sains, actifs et durables.',
     'Discord community management expert: professional moderation, technical administration and engagement strategies to build healthy, active and lasting spaces.', 1),
    ('<span>Voir mes projets</span>', '<span>See my projects</span>', 1),
    ('<span>Me contacter</span>', '<span>Contact me</span>', 1),
    ('<p>CEO d\'<b>Arvenis</b>, gérant du <b>Café Français</b> et administrateur des communautés de <b>Nico Là</b> et <b>Byilhan</b>.</p>',
     '<p>CEO of <b>Arvenis</b>, manager of <b>Le Café Français</b> and administrator of the <b>Nico Là</b> and <b>Byilhan</b> communities.</p>', 1),
    ('membres réunis dans mes communautés</p>', 'members across my communities</p>', 1),
    ('<b class="js-members">9 560</b> membres</span>', '<b class="js-members">9,560</b> members</span>', 1),
    ('<div class="mock__input">Envoyer un message dans #☕ | discussion</div>', '<div class="mock__input">Message #☕ | discussion</div>', 1),
    ('<use href="#i-shield"/></svg>Modération</div>', '<use href="#i-shield"/></svg>Moderation</div>', 1),
    ('<use href="#i-bot"/></svg>Bots &amp; automatisations</div>', '<use href="#i-bot"/></svg>Bots &amp; automations</div>', 1),
    ('aria-label="Défiler vers la suite"', 'aria-label="Scroll down"', 1),

    # --- Communautés (accueil, sous la présentation) ---
    ('aria-label="Communautés accompagnées"', 'aria-label="Communities I support"', 1),
    ('<p class="proof__title">Les communautés que je gère et accompagne</p>', '<p class="proof__title">The communities I run and support</p>', 1),
    ('>Voir les projets<svg', '>See the projects<svg', 1),
    ('<span class="proof__role">Gérant</span>', '<span class="proof__role">Manager</span>', 1),
    ('<span class="proof__role">Administrateur</span>', '<span class="proof__role">Administrator</span>', 5),
    ('<span class="proof__role">Créateur</span>', '<span class="proof__role">Creator</span>', 1),
    ('<b data-members></b>&nbsp;membres</span>', '<b data-members></b>&nbsp;members</span>', 8),

    # --- Services ---
    ('<h2 class="title" data-split>Une expertise <em>complète</em></h2>', '<h2 class="title" data-split>End-to-end <em>expertise</em></h2>', 1),
    ('Une approche professionnelle pour développer des communautés Discord saines et engagées.',
     'A professional approach to building healthy, engaged Discord communities.', 1),
    ('<h3>Modération professionnelle</h3>', '<h3>Professional moderation</h3>', 1),
    ('<p>Maintien d\'un environnement sain avec une application équitable des règles et une gestion des conflits.</p>',
     '<p>Keeping a healthy environment with fair rule enforcement and conflict management.</p>', 1),
    ('<li>Règlement</li><li>Gestion des conflits</li><li>Équipe de modération</li>',
     '<li>Rules</li><li>Conflict management</li><li>Moderation team</li>', 1),
    ('<h3>Administration technique</h3>', '<h3>Technical administration</h3>', 1),
    ('<p>Configuration optimale, automatisation et gestion avancée des permissions.</p>',
     '<p>Optimal setup, automation and advanced permission management.</p>', 1),
    ('<li>Rôles &amp; permissions</li><li>Bots</li><li>Automatisations</li>',
     '<li>Roles &amp; permissions</li><li>Bots</li><li>Automations</li>', 1),
    ('<h3>Développement communautaire</h3>', '<h3>Community growth</h3>', 1),
    ('<p>Stratégies d\'engagement pour fidéliser et faire grandir votre communauté.</p>',
     '<p>Engagement strategies to retain and grow your community.</p>', 1),
    ('<li>Événements</li><li>Fidélisation</li><li>Croissance</li>', '<li>Events</li><li>Retention</li><li>Growth</li>', 1),
    ('<h3>Gestion des réseaux sociaux</h3>', '<h3>Social media management</h3>', 1),
    ('<p>Aide à la gestion et au développement de votre présence sur les réseaux sociaux.</p>',
     '<p>Help managing and growing your presence on social media.</p>', 1),
    ('<li>Organisation</li><li>Rédaction</li><li>Stratégie</li>', '<li>Planning</li><li>Copywriting</li><li>Strategy</li>', 1),

    # --- Projets ---
    ('<p class="eyebrow" data-reveal>Mes projets</p>', '<p class="eyebrow" data-reveal>My projects</p>', 1),
    ('<h2 class="title" data-split>Des communautés que je fais <em>vivre</em>.</h2>',
     '<h2 class="title" data-split>Communities I bring to <em>life</em>.</h2>', 1),
    ('Mes propres serveurs, et ceux des créateurs que j\'accompagne. <span class="live-note"><i></i>Chiffres en direct depuis Discord</span>',
     'My own servers, and those of the creators I work with. <span class="live-note"><i></i>Live numbers from Discord</span>', 1),
    ('<span>Site web développé par moi : <b>cafe-fr.com</b></span>', '<span>Website I built: <b>cafe-fr.com</b></span>', 1),
    ('<span class="prow__desc">Communauté francophone</span>', '<span class="prow__desc">French-speaking community</span>', 1),
    ('<span class="prow__desc">Collectif de bots Discord</span>', '<span class="prow__desc">Discord bot collective</span>', 1),
    ('<span class="prow__desc">Communauté d\'influenceur</span>', '<span class="prow__desc">Influencer community</span>', 5),
    ('<span class="prow__desc">Communauté gaming</span>', '<span class="prow__desc">Gaming community</span>', 1),
    ('<b data-online></b> en ligne</span>', '<b data-online></b> online</span>', 8),
    ('<b data-members>9 560</b> membres</span>', '<b data-members>9,560</b> members</span>', 1),
    ('<b data-members></b> membres</span>', '<b data-members></b> members</span>', 7),
    ('<span class="pcard__count" hidden><b></b> membres</span>', '<span class="pcard__count" hidden><b></b> members</span>', 8),
    ('<span class="prow__role">Créateur du serveur</span>', '<span class="prow__role">Server creator</span>', 1),
    ("<span>Voir d'autres communautés</span>", '<span>See more communities</span>', 1),
    ('<span class="prow__role">Gérant</span>', '<span class="prow__role">Manager</span>', 1),
    ('<span class="prow__role">Administrateur</span>', '<span class="prow__role">Administrator</span>', 5),
    ('Votre serveur pourrait être le <em>prochain</em>.', 'Your server could be <em>next</em>.', 1),

    # --- Avis ---
    ('<p class="eyebrow" data-reveal>Avis</p>', '<p class="eyebrow" data-reveal>Reviews</p>', 1),
    ('<h2 class="title" data-split>Ils m\'ont fait <em>confiance</em>.</h2>', '<h2 class="title" data-split>They <em>trusted</em> me.</h2>', 1),
    ('<span class="dchan__topic">Ce que mes clients disent de mon travail</span>', '<span class="dchan__topic">What my clients say about my work</span>', 1),
    ('L\'action de Marius au sein du serveur a été bénéfique pour les membres et staffs. Sa restructuration professionnelle et complète a permis une meilleure inclusion des membres au sein du serveur. Sa mise en place efficace de recrutements Staff a également permis aux membres de profiter d\'une modération et animation de qualité et professionnelle. Ainsi, son action sur le serveur est qualitative et professionnelle&nbsp;! Merci à lui&nbsp;!',
     'Marius\'s work on the server has benefited both members and staff. His professional and complete restructuring led to better inclusion of members within the server. His efficient staff recruitment also gave members high-quality, professional moderation and activities. All in all, his work on the server is high-quality and professional! Thanks to him!', 1),
    ('Restructuration du serveur &amp; recrutements staff</p>', 'Server restructuring &amp; staff recruitment</p>', 1),
    ('Marius effectue un travail complet et sérieux. Toujours disponible et investi dans la tâche qui lui est confiée. Je travaille avec lui depuis plusieurs mois et pour l\'instant je n\'ai pas eu de retour négatif à lui transmettre. Il sait faire preuve de rigueur et de discipline dans le travail que nous avons pu effectuer en commun. Il a une très bonne aisance sur Discord, l\'utilisation de l\'application ainsi que l\'ensemble des fonctionnalités de celle-ci, et apporte un réel plus à l\'équipe.',
     'Marius does thorough and serious work. Always available and committed to the tasks he is given. I have been working with him for several months and so far I have had no negative feedback to pass on. He shows rigor and discipline in the work we have done together. He is very comfortable with Discord, both the app and all of its features, and brings real added value to the team.', 1),
    ('Influenceur · serveur Discord Byilhan</p>', 'Influencer · Byilhan Discord server</p>', 1),
    ('Marius a été rapide, efficace et à l\'écoute pour la création de mon serveur communautaire. Il a su proposer des solutions adaptées et livrer un travail pro et bien structuré. Je recommande sans hésitation&nbsp;!',
     'Marius was quick, efficient and attentive when creating my community server. He suggested tailored solutions and delivered professional, well-structured work. I highly recommend him!', 1),
    ('Création d\'un serveur communautaire</p>', 'Community server creation</p>', 1),
    ('Administration du serveur depuis 2&nbsp;ans</p>', 'Server administration for 2 years</p>', 1),
    ("Administrateur depuis 2 ans, je remercie Marius pour le travail qu'il a accompli et qu'il continue de fournir sur mon serveur. Toujours à l'écoute, réactif et professionnel, il assure une gestion impeccable, que ce soit en matière de sécurité ou d'animation de la communauté sur mon Discord.",
     'An administrator for 2 years, I thank Marius for the work he has done and keeps doing on my server. Always attentive, responsive and professional, he manages everything flawlessly, from security to community activities on my Discord.', 1),
    ('Création des serveurs, gestion du staff &amp; événements</p>', 'Server creation, staff management &amp; events</p>', 1),
    ("Par rapport à ton taff et tout, rien à dire, c'était parfait. Toujours carré, efficace. T'as géré de A à Z, que ce soit la création des serveurs, la gestion du staff ou l'organisation des événements. Franchement, un vrai atout. Merci pour tout ce que tu m'as apporté, t'es grave un bosseur&nbsp;!",
     "About your work and everything, nothing to say, it was perfect. Always on point, efficient. You handled everything from A to Z, from creating the servers to managing the staff and organising events. Honestly, a real asset. Thanks for everything you brought me, you're a seriously hard worker!", 1),
    ("Gestion du serveur Discord d'Evan</p>", "Managing Evan's Discord server</p>", 1),
    ("Marius a fait un super travail en aidant à gérer le Discord d'Evan pendant plusieurs mois. Il a su maintenir une bonne organisation, gérer les situations rapidement et veiller à une ambiance agréable pour tous. Tout s'est très bien passé grâce à son implication et son sérieux&nbsp;!",
     "Marius did a great job helping to manage Evan's Discord for several months. He kept things well organised, handled situations quickly and made sure the atmosphere was pleasant for everyone. Everything went very smoothly thanks to his commitment and reliability!", 1),
    ('Administration &amp; croissance du serveur</p>', 'Server administration &amp; growth</p>', 1),
    ("Très bon administrateur dévoué, qui aide à l'agrandissement de mon serveur de jour en jour.",
     'A very good, dedicated administrator who helps my server grow day after day.', 1),
    ('aria-label="Avis précédent"', 'aria-label="Previous review"', 1),
    ('aria-label="Avis suivant"', 'aria-label="Next review"', 1),
    ('aria-label="Mettre en pause le défilement des avis"', 'aria-label="Pause the reviews"', 1),
    ('aria-label="Avis de mes clients"', 'aria-label="Reviews from my clients"', 1),
    ('<small>Influenceur</small>', '<small>Influencer</small>', 1),
    ('<small>Administration · 2&nbsp;ans</small>', '<small>Administration · 2 years</small>', 1),
    ('<small>Restructuration &amp; staff</small>', '<small>Restructuring &amp; staff</small>', 1),
    ('<small>Création &amp; événements</small>', '<small>Creation &amp; events</small>', 1),
    ('<small>Gestion du serveur</small>', '<small>Server management</small>', 1),
    ('<small>Serveur communautaire</small>', '<small>Community server</small>', 1),
    ('<small>Croissance du serveur</small>', '<small>Server growth</small>', 1),

    # --- FAQ ---
    ('<h2 class="title" data-split>Vos questions, <em>mes réponses</em>.</h2>', '<h2 class="title" data-split>Your questions, <em>my answers</em>.</h2>', 1),
    ('Une autre question&nbsp;? <a class="faq__link" href="#contact">Écrivez-moi</a>, je vous réponds directement.',
     'Another question? <a class="faq__link" href="#contact">Write to me</a> and I will get back to you directly.', 1),
    ('Combien coûtent vos services&nbsp;?', 'How much do your services cost?', 1),
    ('Il n\'y a pas de prix fixe&nbsp;: chaque projet est différent. Je vous propose un devis sur mesure, adapté à vos besoins et à votre communauté.',
     'There is no fixed price: every project is different. I will send you a custom quote tailored to your needs and your community.', 1),
    ('Comment se déroule une mission&nbsp;?', 'How does a project work?', 1),
    ('Tout commence par une prise de contact. Nous fixons ensuite un appel pour échanger sur vos objectifs, puis je mets en place le projet.',
     'It all starts with getting in touch. We then schedule a call to discuss your goals, and I set up the project.', 1),
    ('Sous quel délai répondez-vous&nbsp;?', 'How quickly do you respond?', 1),
    ('Je réponds à chaque demande en une semaine maximum.', 'I respond to every request within one week at most.', 1),
    ('Quels moyens de paiement acceptez-vous&nbsp;?', 'Which payment methods do you accept?', 1),
    ('Le paiement se fait par virement bancaire ou par PayPal.', 'Payment is made by bank transfer or PayPal.', 1),
    ('Proposez-vous une gestion sur la durée&nbsp;?', 'Do you offer long-term management?', 1),
    ('Oui. Au-delà de la mise en place, je peux assurer la gestion de votre communauté sur le long terme.',
     'Yes. Beyond the initial setup, I can manage your community over the long term.', 1),
    ('Avec qui travaillez-vous&nbsp;?', 'Who do you work with?', 1),
    ('J\'accompagne principalement des créateurs de contenu et des entreprises.', 'I mainly work with content creators and businesses.', 1),
    ('De quels accès avez-vous besoin&nbsp;?', 'What access do you need?', 1),
    ('Sur Discord, j\'ai besoin de la totalité des accès au serveur. Pour les réseaux sociaux, les accès demandés dépendent de la mission.',
     'On Discord, I need full access to the server. For social media, the access required depends on the project.', 1),
    ('Quels bots utilisez-vous&nbsp;?', 'Which bots do you use?', 1),
    ('J\'utilise les bots développés par Arvenis, le collectif que je dirige.', 'I use the bots developed by Arvenis, the collective I run.', 1),
    ('Découvrez-les ici</a>.', 'Discover them here</a>.', 1),
    ('<span>Voir toutes les questions</span>', '<span>See all questions</span>', 1),
    ('Pouvez-vous recruter et gérer un staff&nbsp;?', 'Can you recruit and manage a staff team?', 1),
    ('Envie d\'en faire partie&nbsp;? <a class="faq__link" href="staff/">Postulez ici</a>.',
     'Want to join? <a class="faq__link" href="staff/">Apply here</a>.', 1),
    ('Oui. Je dispose d\'équipes et je mène des recrutements pour constituer un staff adapté à votre communauté.',
     'Yes. I have teams and I run recruitment to build a staff that fits your community.', 1),
    ('Pouvez-vous intervenir sur un serveur existant&nbsp;?', 'Can you work on an existing server?', 1),
    ('Oui. Je peux reprendre et restructurer un serveur déjà en place, comme en créer un de zéro.',
     'Yes. I can take over and restructure an existing server, or build one from scratch.', 1),

    # --- Contact & devis (les valeurs envoyées restent en français pour les e-mails reçus) ---
    ('Prêt à développer <em>votre communauté</em>&nbsp;?', 'Ready to grow <em>your community</em>?', 1),
    ('Parlez-moi de votre projet&nbsp;: je reviens vers vous rapidement avec une proposition adaptée.',
     'Tell me about your project: I will get back to you quickly with a tailored proposal.', 1),
    ('data-mail-subject="Demande de devis"', 'data-mail-subject="Quote request"', 1),
    ('<span>Demander un devis</span>', '<span>Request a quote</span>', 1),
    ('value="Nouvelle demande de devis — mvriuus.fr"', 'value="Nouvelle demande de devis (version anglaise) — mvriuus.fr"', 1),
    ('<legend>Type de projet</legend>', '<legend>Project type</legend>', 1),
    ('<span>Création de serveur</span>', '<span>Server creation</span>', 1),
    ('<span>Restructuration</span>', '<span>Restructuring</span>', 1),
    ('<span>Gestion &amp; modération</span>', '<span>Management &amp; moderation</span>', 1),
    ('<span>Réseaux sociaux</span></label>', '<span>Social media</span></label>', 1),
    ('<span>Autre</span>', '<span>Other</span>', 1),
    ('<legend>Taille de la communauté</legend>', '<legend>Community size</legend>', 1),
    ('<span>Pas encore lancée</span>', '<span>Not launched yet</span>', 1),
    ('<span>Moins de 500 membres</span>', '<span>Under 500 members</span>', 1),
    ('<span>500 à 5 000 membres</span>', '<span>500 to 5,000 members</span>', 1),
    ('<span>Plus de 5 000 membres</span>', '<span>Over 5,000 members</span>', 1),
    ('<span>Nom ou pseudo</span>', '<span>Name or username</span>', 1),
    ('<span>E-mail</span></label>', '<span>Email</span></label>', 1),
    ('<span>Pseudo Discord (facultatif)</span>', '<span>Discord username (optional)</span>', 1),
    ('<option>Dès que possible</option>', '<option value="Dès que possible">As soon as possible</option>', 1),
    ('<option>Dans le mois</option>', '<option value="Dans le mois">Within the month</option>', 1),
    ('<option>Pas pressé</option>', '<option value="Pas pressé">No rush</option>', 1),
    ('<span>Délai souhaité</span>', '<span>Desired timeline</span>', 1),
    ('<span>Parlez-moi de votre projet</span>', '<span>Tell me about your project</span>', 1),
    ('<span class="quote__label">Envoyer ma demande</span>', '<span class="quote__label">Send my request</span>', 1),
    ('Merci, votre demande est bien partie&nbsp;!', 'Thanks, your request is on its way!', 1),
    ('<p>Je vous réponds au plus vite à l\'adresse indiquée.</p>', '<p>I will get back to you as soon as possible at the address you provided.</p>', 1),
    ('<span>Ou directement&nbsp;:</span>', '<span>Or directly:</span>', 1),

    # --- Écran d'intro : astuces ---
    ('<small>Le savais-tu&nbsp;?</small>', '<small>Did you know?</small>', 1),
    ("<li>Un nouveau membre décide en quelques secondes s'il reste sur un serveur.</li>", '<li>A new member decides within seconds whether to stay on a server.</li>', 1),
    ("<li>Moins de salons, c'est souvent plus de messages.</li>", '<li>Fewer channels often means more messages.</li>', 1),
    ('<li>Un rendez-vous régulier donne aux membres une raison de revenir.</li>', '<li>A regular event gives members a reason to come back.</li>', 1),
    ('<li>Les rôles servent aussi à guider les nouveaux venus.</li>', '<li>Roles also help guide newcomers.</li>', 1),
    ("<li>Un staff bien formé vaut mieux qu'un grand staff.</li>", '<li>A well-trained staff beats a big staff.</li>', 1),
    ("<li>Un message d'accueil personnalisé change la première impression.</li>", '<li>A personal welcome message changes the first impression.</li>', 1),
    ('<li>Un règlement court est un règlement lu.</li>', '<li>Short rules are rules that get read.</li>', 1),

    # --- Diagnostic express ---
    ('<p class="eyebrow" data-reveal>Diagnostic express</p>', '<p class="eyebrow" data-reveal>Quick check-up</p>', 1),
    ('Votre serveur est-il prêt à <em>grandir</em>&nbsp;?', 'Is your server ready to <em>grow</em>?', 1),
    ('6 questions, une minute&nbsp;: obtenez un score sur 100 et des conseils personnalisés pour votre serveur.',
     '6 questions, one minute: get a score out of 100 and personalised tips for your server.', 1),
    ('<use href="#i-arrow-right"/></svg>Retour</button>', '<use href="#i-arrow-right"/></svg>Back</button>', 1),
    ('data-label="Règlement" data-tip="Affichez un règlement court et clair, et faites-le accepter dès l\'arrivée (écran d\'accueil ou rôle à valider)."',
     'data-label="Rules" data-tip="Display short, clear rules and have members accept them on arrival (welcome screen or role to confirm)."', 1),
    ('<legend>Votre serveur a-t-il un règlement clair et visible&nbsp;?</legend>', '<legend>Does your server have clear, visible rules?</legend>', 1),
    ("<span>Oui, affiché et accepté dès l'arrivée</span>", '<span>Yes, shown and accepted on arrival</span>', 1),
    ('<span>Oui, mais peu de membres le lisent</span>', '<span>Yes, but few members read them</span>', 1),
    ('<span>Non, pas vraiment</span>', '<span>Not really</span>', 1),
    ('data-label="Rôles" data-tip="Faites le tri dans vos rôles : un rôle = un usage, avec des permissions au plus juste."',
     'data-label="Roles" data-tip="Clean up your roles: one role = one purpose, with only the permissions it needs."', 1),
    ('<legend>Vos rôles et permissions sont-ils bien organisés&nbsp;?</legend>', '<legend>Are your roles and permissions well organised?</legend>', 1),
    ('<span>Oui, chaque rôle a un usage précis</span>', '<span>Yes, every role has a clear purpose</span>', 1),
    ('<span>À peu près, il y a des doublons</span>', '<span>More or less, there are duplicates</span>', 1),
    ("<span>Pas du tout, c'est le flou</span>", "<span>Not at all, it's a mess</span>", 1),
    ('data-label="Salons" data-tip="Regroupez vos salons par catégories et supprimez ceux qui ne servent plus : un nouveau doit s\'y retrouver en quelques secondes."',
     'data-label="Channels" data-tip="Group your channels into categories and remove unused ones: a newcomer should find their way in seconds."', 1),
    ("<legend>Un nouveau membre s'y retrouve-t-il facilement dans vos salons&nbsp;?</legend>", '<legend>Can a new member easily find their way around your channels?</legend>', 1),
    ('<span>Oui, tout est rangé par catégories</span>', '<span>Yes, everything is sorted into categories</span>', 1),
    ('<span>Il y a un peu trop de salons</span>', '<span>There are a few too many channels</span>', 1),
    ("<span>Non, on s'y perd</span>", "<span>No, it's easy to get lost</span>", 1),
    ('data-label="Bots" data-tip="Automatisez l\'accueil, la modération et les tickets avec des bots bien configurés."',
     'data-label="Bots" data-tip="Automate welcomes, moderation and tickets with well-configured bots."', 1),
    ('<legend>Utilisez-vous des bots pour automatiser votre serveur&nbsp;?</legend>', '<legend>Do you use bots to automate your server?</legend>', 1),
    ('<span>Oui, bien configurés (accueil, modération, tickets)</span>', '<span>Yes, well configured (welcome, moderation, tickets)</span>', 1),
    ('<span>Quelques-uns, mais mal réglés</span>', '<span>A few, but poorly set up</span>', 1),
    ('<span>Aucun</span>', '<span>None</span>', 1),
    ('data-label="Modération" data-tip="Constituez une petite équipe de modération formée, avec des règles d\'intervention communes."',
     'data-label="Moderation" data-tip="Build a small, trained moderation team with shared rules of intervention."', 1),
    ('<legend>Avez-vous une équipe de modération active&nbsp;?</legend>', '<legend>Do you have an active moderation team?</legend>', 1),
    ('<span>Oui, organisée et formée</span>', '<span>Yes, organised and trained</span>', 1),
    ('<span>Une ou deux personnes, quand elles peuvent</span>', '<span>One or two people, when they can</span>', 1),
    ('<span>Personne</span>', '<span>No one</span>', 1),
    ('data-label="Animation" data-tip="Créez des rendez-vous réguliers (événements, concours, débats) pour donner aux membres une raison de revenir."',
     'data-label="Engagement" data-tip="Create regular events (games, contests, debates) to give members a reason to come back."', 1),
    ('<legend>Organisez-vous des événements ou des rendez-vous&nbsp;?</legend>', '<legend>Do you run events or regular meetups?</legend>', 1),
    ('<span>Oui, régulièrement</span>', '<span>Yes, regularly</span>', 1),
    ('<span>De temps en temps</span>', '<span>From time to time</span>', 1),
    ('<span>Jamais</span>', '<span>Never</span>', 1),
    ('<span>Améliorer mon serveur</span>', '<span>Improve my server</span>', 1),
    ('<span>Recommencer</span>', '<span>Start over</span>', 1),
    ('<span class="js-diag-share-label">Partager mon score</span>', '<span class="js-diag-share-label">Share my score</span>', 1),
    ('data-title="Serveur solide 💪" data-text="Votre base est saine. Pour aller plus loin, misez sur la croissance, les événements et la fidélisation."',
     'data-title="Solid server 💪" data-text="Your foundations are healthy. To go further, focus on growth, events and retention."', 1),
    ('data-title="Bonne base, à optimiser" data-text="L\'essentiel est là, mais quelques réglages feraient vraiment la différence pour vos membres."',
     'data-title="Good base, room to improve" data-text="The essentials are there, but a few tweaks would make a real difference for your members."', 1),
    ('data-title="Une restructuration s\'impose" data-text="Votre serveur a du potentiel, mais il manque des fondations pour retenir et faire grandir votre communauté."',
     'data-title="Time for a restructure" data-text="Your server has potential, but it lacks the foundations to retain and grow your community."', 1),
    ('Continuez à faire évoluer votre serveur avec vos membres : sondages, nouveautés et partenariats.',
     'Keep evolving your server with your members: polls, new features and partnerships.', 1),

    # --- Conseils ---
    ('<p class="eyebrow" data-reveal>Conseils</p>', '<p class="eyebrow" data-reveal>Tips</p>', 1),
    ('Mes conseils pour votre <em>serveur</em>.', 'Tips for your <em>server</em>.', 1),
    ('Des astuces concrètes, tirées de mon expérience, pour faire grandir votre communauté.',
     'Practical advice from my experience to help your community grow.', 1),
    ('<span>Voir tous les conseils</span>', '<span>See all tips</span>', 1),
    ('Communauté · 4 min de lecture', 'Community · 4 min read', 1),
    ('Organisation · 5 min de lecture', 'Organisation · 5 min read', 1),
    ('Staff · 5 min de lecture', 'Staff · 5 min read', 1),
    ('5 erreurs qui font fuir les membres de votre serveur Discord', '5 mistakes that drive members away from your Discord server', 1),
    ('Accueil absent, trop de salons, règlement flou… les pièges les plus courants et comment les éviter.',
     'No welcome, too many channels, vague rules… the most common pitfalls and how to avoid them.', 1),
    ('Comment bien structurer les salons de son serveur Discord', "How to structure your Discord server's channels", 1),
    ("Catégories, noms, permissions&nbsp;: la méthode pour qu'un nouveau membre s'y retrouve en quelques secondes.",
     'Categories, names, permissions: the method that helps new members find their way in seconds.', 1),
    ('Recruter et former une équipe de modération', 'Recruiting and training a moderation team', 1),
    ('Définir les rôles, choisir les bons profils et garder une équipe motivée sur la durée.',
     'Defining roles, choosing the right people and keeping a team motivated over time.', 1),
    ("Lire l'article <svg", 'Read the article <svg', 3),
    ('<a href="#diagnostic">Diagnostic</a>', '<a href="#diagnostic">Check-up</a>', 1),
    ('<a href="#conseils">Conseils</a>', '<a href="#conseils">Tips</a>', 1),

    # --- Pied de page ---
    ('aria-label="Navigation du pied de page"', 'aria-label="Footer navigation"', 1),
    ('<a href="#projets">Projets</a>', '<a href="#projets">Projects</a>', 1),
    ('<a href="#avis">Avis</a>', '<a href="#avis">Reviews</a>', 1),
    ('<a href="liens/">Tous mes liens</a>', '<a href="liens/" hreflang="fr">All my links</a>', 1),
    ('<a href="staff/">Rejoindre l\'équipe</a>\n', '<a href="staff/">Join the team</a>\n', 1),
    ('Retour en haut <svg', 'Back to top <svg', 1),
    ('Mvrius. Tous droits réservés.', 'Mvrius. All rights reserved.', 1),
    ('<p class="contact__alt" data-reveal>Vous préférez en parler de vive voix&nbsp;? <a href="rendez-vous/">Réservez un appel</a></p>',
     '<p class="contact__alt" data-reveal>Prefer to talk it through? <a href="rendez-vous/" hreflang="fr">Book a call (in French)</a></p>', 1),
    ('<a href="mentions-legales/">Mentions légales</a> · <a href="cgu/">CGU</a> · ',
     '<a href="mentions-legales/" hreflang="fr">Legal notice (FR)</a> · <a href="cgu/" hreflang="fr">Terms of use (FR)</a> · ', 1),
    ('Conçu avec soin · Hébergé sur GitHub Pages', 'Crafted with care · Hosted on GitHub Pages', 1),
    ('<button class="js-motion" type="button">Réduire les animations</button>', '<button class="js-motion" type="button">Reduce motion</button>', 1),

    # --- Menu des pages (accueil) ---
    ('<h2 class="title" data-split>Que voulez-vous <em>découvrir</em>&nbsp;?</h2>', '<h2 class="title" data-split>What would you like to <em>explore</em>?</h2>', 1),
    ("Choisissez une page&nbsp;: mes services, mes projets, l'avis de mes clients ou un diagnostic de votre serveur.",
     'Pick a page: my services, my projects, what my clients say or a check-up of your server.', 1),
    ('aria-label="Pages du site"', 'aria-label="Site pages"', 1),
    ('Modération, administration, engagement et réseaux sociaux</span>', 'Moderation, administration, engagement and social media</span>', 1),
    ('<span class="hmenu__name">Projets</span>', '<span class="hmenu__name">Projects</span>', 1),
    ('Les communautés que je gère, chiffres en direct</span>', 'The communities I run, with live numbers</span>', 1),
    ('<span class="hmenu__name">Avis</span>', '<span class="hmenu__name">Reviews</span>', 1),
    ('Les retours des créateurs et serveurs accompagnés</span>', 'Feedback from the creators and servers I work with</span>', 1),
    ('<span class="hmenu__name">Diagnostic</span>', '<span class="hmenu__name">Check-up</span>', 1),
    ('Votre serveur noté sur 100 en une minute</span>', 'Your server scored out of 100 in one minute</span>', 1),
    ('<span class="hmenu__name">Conseils</span>', '<span class="hmenu__name">Tips</span>', 1),
    ('Des articles pour structurer et animer votre serveur</span>', 'Articles on structuring and running your server</span>', 1),
    ("Tarifs, déroulé d'une mission, délais et accès</span>", 'Pricing, how a project works, timing and access</span>', 1),
    ('Demande de devis, e-mail ou appel</span>', 'Quote request, email or call</span>', 1),
    ('<span class="hmenu__name">Rejoindre l\'équipe</span>', '<span class="hmenu__name">Join the team</span>', 1),
    ('Candidatures pour le staff de mes communautés</span>', "Apply to join my communities' staff</span>", 1),

    # --- Réseaux ---
    ('data-text="Réseaux"><span>Réseaux</span>', 'data-text="Socials"><span>Socials</span>', 1),
    ('<small>07</small>Réseaux</a>', '<small>07</small>Socials</a>', 1),
    ('<a href="#reseaux">Réseaux</a>', '<a href="#reseaux">Socials</a>', 1),
    ('<span class="hmenu__name">Réseaux</span>', '<span class="hmenu__name">Socials</span>', 1),
    ('X, Instagram, Discord et tous mes liens</span>', 'X, Instagram, Discord and all my links</span>', 1),
    ('<p class="eyebrow" data-reveal>Réseaux</p>', '<p class="eyebrow" data-reveal>Socials</p>', 1),
    ('Retrouvez-moi sur les <em>réseaux</em>.', 'Find me on <em>social media</em>.', 1),
    ('Mes actualités, mes projets en cours et les nouveautés de mes communautés, au quotidien.',
     "My news, current projects and what's new in my communities, every day.", 1),
    ('Actualités, projets en cours et échanges.', 'News, current projects and conversations.', 1),
    ('Mes projets et leurs coulisses en images.', 'My projects and their behind-the-scenes, in pictures.', 1),
    ("Le serveur d'Arvenis, mon collectif de bots Discord.", 'The Arvenis server, my Discord bot collective.', 1),
    ('Mon profil et tous mes liens sur une page.', 'My profile and all my links on one page.', 1),
    ('Pour une bio ou un partage&nbsp;: <a href="liens/">tous mes liens sur une seule page</a>',
     'For a bio or a share: <a href="liens/" hreflang="fr">all my links on a single page</a>', 1),

    # --- À propos (accueil) ---
    ('<p class="eyebrow" data-reveal>À propos</p>', '<p class="eyebrow" data-reveal>About</p>', 1),
    ('Derrière Mvrius, il y a <em>Marius</em>.', 'Behind Mvrius, there is <em>Marius</em>.', 1),
    ("Je gère Le Café Français, je dirige Arvenis, un collectif de bots Discord, et j'administre les serveurs de créateurs comme Nico Là et Byilhan. Mon métier&nbsp;: des communautés saines, actives et bien organisées.",
     'I manage Le Café Français, run Arvenis, a Discord bot collective, and administer servers for creators such as Nico Là and Byilhan. My job: healthy, active and well-organised communities.', 1),
    ('<span>communautés accompagnées</span>', '<span>communities supported</span>', 1),
    ('<b class="js-total">169 603</b><span>membres réunis, en direct</span>', '<b class="js-total">169,603</b><span>members brought together, live</span>', 1),
    ('<span>clients qui recommandent mon travail</span>', '<span>clients who recommend my work</span>', 1),
    ('aria-label="Profil Discord de Mvrius"', 'aria-label="Mvrius\'s Discord profile"', 1),
    ('<p class="dprofile__tagline">Community manager Discord</p>', '<p class="dprofile__tagline">Discord community manager</p>', 1),
    ('aria-label="Badges Discord"', 'aria-label="Discord badges"', 1),
    ('title="Booster de serveur" aria-label="Booster de serveur"', 'title="Server Booster" aria-label="Server Booster"', 1),
    ('<p class="dprofile__label">À propos de moi</p>', '<p class="dprofile__label">About me</p>', 1),
    ("Je fais grandir des communautés Discord, de la modération au quotidien jusqu'aux grands événements.",
     'I grow Discord communities, from day-to-day moderation to big events.', 1),
    ('<p class="dprofile__label">Rôles</p>', '<p class="dprofile__label">Roles</p>', 1),
    ('<i></i>Gérant · Le Café Français</li>', '<i></i>Manager · Le Café Français</li>', 1),
    ('<i></i>Créateur · Guizzi</li>', '<i></i>Creator · Guizzi</li>', 1),
    ('<p class="dprofile__label">Serveurs en commun · 8</p>', '<p class="dprofile__label">Mutual servers · 8</p>', 1),
    ('Envoyer un message à Mvrius<svg', 'Message Mvrius<svg', 1),

    # --- Services : anatomie d'un serveur ---
    ('<p class="eyebrow" data-reveal>Méthode</p>', '<p class="eyebrow" data-reveal>Method</p>', 1),
    ('Anatomie d\'un serveur&nbsp;: <em>Le Café Français</em>.', 'Anatomy of a server: <em>Le Café Français</em>.', 1),
    ("Chaque salon a une raison d'être. Voici comment est construit le serveur que je gère, de l'arrivée d'un membre à ses habitudes.",
     "Every channel has a reason to exist. Here is how the server I run is built, from a member's arrival to their daily habits.", 1),
    ('<h4 class="anatomy__h">L\'arrivée</h4>', '<h4 class="anatomy__h">Arriving</h4>', 1),
    ("Le premier salon qu'un nouveau membre ouvre est le règlement, dans #🏠 | accueil. Juste au-dessus, les statistiques montrent d'un coup d'œil que la communauté est vivante.",
     'The first channel a new member opens is the rules, in #🏠 | accueil. Just above, the stats show at a glance that the community is alive.', 1),
    ('<h4 class="anatomy__h">L\'information</h4>', '<h4 class="anatomy__h">Information</h4>', 1),
    ("Annonces, mises à jour du serveur et petit savoir&nbsp;: chaque type d'information a son salon, réservé à l'équipe. Rien ne se perd dans la discussion.",
     'Announcements, server updates and the knowledge corner: each type of information has its own staff-only channel. Nothing gets lost in the chat.', 1),
    ('<h4 class="anatomy__h">Les temps forts</h4>', '<h4 class="anatomy__h">Highlights</h4>', 1),
    ('Concours et événements donnent aux membres un rendez-vous régulier. Un salon réservé récompense les plus fidèles.',
     'Contests and events give members a regular meeting point. A reserved channel rewards the most loyal ones.', 1),
    ('<h4 class="anatomy__h">L\'équipe à l\'écoute</h4>', '<h4 class="anatomy__h">A team that listens</h4>', 1),
    ('Deux salons à part pour les demandes adressées au staff&nbsp;: elles ne se mélangent pas à la conversation et chacune reçoit une réponse.',
     "Two separate channels for requests to the staff: they don't get mixed up with the conversation and each one gets an answer.", 1),
    ('<h4 class="anatomy__h">L\'identité</h4>', '<h4 class="anatomy__h">Identity</h4>', 1),
    ('Choisir sa couleur, se présenter&nbsp;: chacun trouve sa place et devient reconnaissable dans la discussion.',
     'Picking a colour, introducing yourself: everyone finds their place and becomes recognisable in the chat.', 1),
    ('<h4 class="anatomy__h">Le cœur du serveur</h4>', '<h4 class="anatomy__h">The heart of the server</h4>', 1),
    ('Une seule discussion générale, pour que la conversation reste toujours animée, avec un espace réservé et un salon pour les membres qui ne parlent pas français.',
     "A single general chat so the conversation always stays lively, plus a reserved space and a channel for members who don't speak French.", 1),
]

FAQ_EN = [
    ("How much do your services cost?", "There is no fixed price: every project is different. I will send you a custom quote tailored to your needs and your community."),
    ("How does a project work?", "It all starts with getting in touch. We then schedule a call to discuss your goals, and I set up the project."),
    ("How quickly do you respond?", "I respond to every request within one week at most."),
    ("Which payment methods do you accept?", "Payment is made by bank transfer or PayPal."),
    ("Do you offer long-term management?", "Yes. Beyond the initial setup, I can manage your community over the long term."),
    ("Who do you work with?", "I mainly work with content creators and businesses."),
    ("What access do you need?", "On Discord, I need full access to the server. For social media, the access required depends on the project."),
    ("Which bots do you use?", "I use the bots developed by Arvenis, the collective I run."),
    ("Can you recruit and manage a staff team?", "Yes. I have teams and I run recruitment to build a staff that fits your community."),
    ("Can you work on an existing server?", "Yes. I can take over and restructure an existing server, or build one from scratch."),
]

PERSON_EN = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Marius",
    "alternateName": "Mvrius",
    "url": "https://mvriuus.fr/en/",
    "jobTitle": "Discord Community Manager, CEO of Arvenis",
    "email": "mailto:contact@mvriuus.fr",
    "sameAs": ["https://x.com/mariusatqz", "https://www.instagram.com/mvriuus_/", "https://guns.lol/an"],
    "knowsAbout": ["Discord", "Moderation", "Community management", "Social media"],
}


def ld_block(data):
    body = json.dumps(data, ensure_ascii=False, indent=2).replace("\n", "\n  ")
    return f'<script type="application/ld+json">\n  {body}\n  </script>'


def build_assets():
    """Versions minifiées des feuilles de style et des scripts (fichiers .min chargés par les pages)."""
    assets = ROOT / "assets"
    for src, fn in (("css/style.css", minify_css), ("js/main.js", minify_js), ("js/reservation.js", minify_js)):
        path = assets / src
        text = path.read_text(encoding="utf-8")
        mini = fn(text)
        path.with_name(path.stem + ".min" + path.suffix).write_text(mini, encoding="utf-8")
        print(f"{src} : {len(text.encode()) // 1024} Ko → {len(mini.encode()) // 1024} Ko")


def alternates(url_fr, url_en):
    return "".join(f'\n  <link rel="alternate" hreflang="{code}" href="{target}">'
                   for code, target in (("fr", url_fr), ("en", url_en), ("x-default", url_fr)))


def with_alternates(html, url_fr, url_en):
    """Ajoute (ou remplace) les liens hreflang juste après la balise canonical."""
    html = re.sub(r'\n  <link rel="alternate" hreflang="[^"]+" href="[^"]*">', "", html)
    return sub1(r'(<link rel="canonical" href="[^"]*">)', lambda m: m.group(1) + alternates(url_fr, url_en), html, "canonical")


def stamp():
    assets = ROOT / "assets"
    digest = hashlib.md5((assets / "css" / "style.css").read_bytes() + (assets / "js" / "main.js").read_bytes() + (assets / "js" / "reservation.js").read_bytes())
    version = digest.hexdigest()[:8]
    for page in STAMPED:
        path = ROOT / page
        html = path.read_text(encoding="utf-8")
        html, n = re.subn(r'/(style|main)(?:\.min)?\.(css|js)(\?v=[0-9a-z]+)?"', rf'/\1.min.\2?v={version}"', html)
        if not n:
            sys.exit(f"Aucun lien style.css / main.js dans {page}")
        path.write_text(html, encoding="utf-8")
    print(f"Version des fichiers : {version}")
    return version


def page_parts(home, prefix, local=None):
    """Sprite d'icônes, navigation et pied de page de l'accueil, liens adaptés à une page plus bas.
    prefix : chemin vers la racine du site (fichiers, pages seulement en français) ;
    local : chemin vers l'accueil de la langue (sections, recrutement, conseils), par défaut prefix."""
    local = prefix if local is None else local
    sprite = re.search(r"  <!-- Sprite d'icônes.*?</svg>\n", home, re.S).group(0)
    nav = re.search(r'  <a class="skip".*?</div>\n\n  <main id="main">', home, re.S).group(0)
    nav = re.sub(r"  <!-- Écran d'intro -->.*?\n  </div>\n\n", "", nav, count=1, flags=re.S)
    nav = nav.replace('\n\n  <main id="main">', "\n")
    footer = re.search(r'  <footer class="footer">.*?</footer>\n', home, re.S).group(0)

    def fix(block):
        block = block.replace('href="#top" class="footer__top"', 'href="#main" class="footer__top"')
        block = block.replace('href="#top"', f'href="{local}"')
        block = re.sub(r'href="#(' + "|".join(SECTIONS) + r')"', rf'href="{local}\1/"', block)
        block = re.sub(r'(href|src)="(staff/|conseils/)', rf'\1="{local}\2', block)
        return re.sub(r'(href|src)="(assets/|liens/|en/|mentions-legales/|cgu/|rendez-vous/)', rf'\1="{prefix}\2', block)

    return sprite, fix(nav), fix(footer)


def read_article(slug, lang="fr"):
    path = ROOT / "tools" / "articles" / ("en" if lang == "en" else "") / f"{slug}.html"
    if not path.exists():
        sys.exit(f"Conseils : traduction anglaise manquante ({path.relative_to(ROOT)})")
    raw = path.read_text(encoding="utf-8")
    meta = json.loads(re.match(r"<!--(.*?)-->", raw, re.S).group(1))
    body = raw.split("-->", 1)[1].strip()
    return meta, body


def typo(text):
    """Espace insécable avant : ; ? ! (typographie française)."""
    return re.sub(r" ([:;?!])", r"&nbsp;\1", text)


MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def en_date(iso):
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{EN_MONTHS[m - 1]} {d}, {y}"


def fr_date(iso):
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{'1er' if d == 1 else d} {MONTHS[m - 1]} {y}"


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


TIPS = {
    "fr": {
        "read": "{} de lecture", "more": "Lire l'article", "toc_label": "Sommaire", "toc_title": "Dans cet article",
        "back": "Tous les conseils", "by": "Par", "share": "Cet article peut aider quelqu'un&nbsp;? Partagez-le.",
        "share_btn": "Partager", "copy": "Copier le lien", "share_x": "Partager sur X",
        "cta_title": "Besoin d'un coup de main pour votre serveur&nbsp;?",
        "cta_text": "Je m'occupe de la structure, de la modération et de l'animation de votre communauté.",
        "quote": "Demander un devis", "diag": "Faire le diagnostic",
        "others": "Autres conseils", "next": "À lire aussi", "all": "Voir tous les conseils",
        "list_title": "Conseils pour votre serveur Discord",
        "list_desc": "Mes conseils pour structurer, animer, sécuriser et faire grandir un serveur Discord : accueil, salons, règlement, modération, événements, bots et créateurs de contenu.",
        "eyebrow": "Conseils", "h1": "Mes conseils pour votre <em>serveur</em>.",
        "lead": "Des astuces concrètes, tirées de mon expérience, pour structurer, animer et faire grandir votre communauté Discord.",
        "list_cta_title": "Et votre serveur, où en est-il&nbsp;?",
        "list_cta_text": "Faites le diagnostic express en une minute, ou parlez-moi directement de votre projet.",
        "comment": "Page générée par tools/build.py à partir de tools/articles/",
    },
    "en": {
        "read": "{} read", "more": "Read the article", "toc_label": "Contents", "toc_title": "In this article",
        "back": "All tips", "by": "By", "share": "Could this article help someone? Share it.",
        "share_btn": "Share", "copy": "Copy link", "share_x": "Share on X",
        "cta_title": "Need a hand with your server?",
        "cta_text": "I take care of your community's structure, moderation and engagement.",
        "quote": "Request a quote", "diag": "Take the check-up",
        "others": "More tips", "next": "Read next", "all": "See all tips",
        "list_title": "Tips for your Discord server",
        "list_desc": "My advice to structure, run, secure and grow a Discord server: welcome, channels, rules, moderation, events, bots and content creators.",
        "eyebrow": "Tips", "h1": "Tips for your <em>server</em>.",
        "lead": "Practical advice from my experience to structure, run and grow your Discord community.",
        "list_cta_title": "How is your server doing?",
        "list_cta_text": "Take the one-minute check-up, or tell me about your project directly.",
        "comment": "Page générée par tools/build.py à partir de tools/articles/en/",
    },
}


def tip_typo(lang):
    """Typographie française (espace insécable avant : ; ? !) seulement pour le français."""
    return typo if lang == "fr" else (lambda text: text)


def with_toc(body, lang="fr"):
    """Ajoute un identifiant à chaque intertitre et renvoie le sommaire correspondant."""
    entries, seen = [], set()
    L = TIPS[lang]

    def add_id(m):
        label = re.sub(r'<span class="(?:bot-card__badge|prose__new)">.*?</span>', "", m.group(1))
        label = re.sub(r"<[^>]+>", "", label).replace("&nbsp;", " ").strip()
        label = re.sub(r"^\d+\.\s*", "", label)  # le sommaire numérote déjà
        anchor = slugify(label)
        while anchor in seen:
            anchor += "-2"
        seen.add(anchor)
        entries.append((anchor, label))
        return f'<h2 id="{anchor}">{m.group(1)}</h2>'

    body = re.sub(r"<h2>(.*?)</h2>", add_id, body)
    # Cartes des bots : l'ancre vise la carte entière (bannière comprise)
    body = re.sub(r'(<div class="bot-card" data-bot="[^"]+")(.*?)<h2 id="([^"]+)">', r'\1 id="\3"\2<h2>', body, flags=re.S)
    items = "\n".join(f'              <li><a href="#{a}">{tip_typo(lang)(label)}</a></li>' for a, label in entries)
    toc = f"""          <nav class="toc js-toc" aria-label="{L["toc_label"]}" data-reveal>
            <p class="toc__title">{L["toc_title"]}</p>
            <ol class="toc__list">
{items}
            </ol>
          </nav>"""
    return body, toc


def og_image(name):
    """Image d'aperçu propre à la page (générée par tools/og.js), sinon celle du site."""
    own = ROOT / "assets" / "img" / "og" / f"{name}.jpg"
    return f"{SITE}assets/img/og/{name}.jpg" if own.exists() else f"{SITE}assets/img/og.jpg"


def doc_head(title, description, url, version, prefix, og_type="website", ld=None, image=None, noindex=False, lang="fr", alt=None):
    """En-tête commun aux pages générées (page des conseils et articles).
    alt : adresses (française, anglaise) de la page quand elle existe dans les deux langues."""
    links = alternates(*alt) if alt else ""
    ld = f"\n  {ld_block(ld)}" if ld else ""
    image = image or f"{SITE}assets/img/og.jpg"
    robots = '\n  <meta name="robots" content="noindex, follow">' if noindex else ""
    return f"""<!doctype html>
<html lang="{lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} — Mvrius</title>
  <meta name="description" content="{description}">
  <meta name="theme-color" content="#000">{robots}
  <link rel="canonical" href="{url}">{links}

  <meta property="og:type" content="{og_type}">
  <meta property="og:locale" content="{"en_US" if lang == "en" else "fr_FR"}">
  <meta property="og:site_name" content="Mvrius">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="{image}">

  <link rel="icon" href="{prefix}assets/img/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="{prefix}assets/img/apple-touch-icon.png">
  <link rel="manifest" href="{prefix}site.webmanifest">
  <meta name="apple-mobile-web-app-title" content="Mvrius">
  <link rel="preload" href="{prefix}assets/fonts/bricolage.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="{prefix}assets/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="{prefix}assets/css/style.min.css?v={version}">

  <script>
    (function (d) {{
      d.classList.add('js');
      // Animations réduites : choix du visiteur (bouton en bas de page), sinon réglage de l'appareil
      var motion = null; try {{ motion = localStorage.getItem('mv-motion'); }} catch (e) {{}}
      if (motion === 'reduce' || (motion !== 'full' && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) d.classList.add('reduced');
      // Filet de sécurité : si le JS principal ne démarre pas, on affiche tout le contenu.
      setTimeout(function () {{ if (!window.MV) d.classList.remove('js'); }}, 4000);
    }})(document.documentElement);
  </script>
  <script src="{prefix}assets/js/main.min.js?v={version}" defer></script>{ld}
</head>
"""


def layout(home, prefix, current, local=None, other=None):
    """Sprite, navigation et pied de page pour une page des conseils (lien « Conseils » vers la liste).
    local : chemin vers l'accueil de la langue ; other : adresse de la même page dans l'autre langue."""
    sprite, nav, footer = page_parts(home, prefix, local)
    local = prefix if local is None else local
    listing = "./" if current else f"{local}conseils/"
    nav = nav.replace(f'href="{local}conseils/"', f'href="{listing}"')
    footer = footer.replace(f'href="{local}conseils/"', f'href="{listing}"')
    if current:
        nav = nav.replace(f'<a href="{listing}" data-text=', f'<a href="{listing}" aria-current="page" data-text=')
        nav = re.sub(r'<a href="\./"><small>(\d+)</small>', r'<a href="./" aria-current="page"><small>\1</small>', nav)
    if nav.count(f'href="{listing}"') != 2:
        sys.exit("Conseils : lien « Conseils » introuvable dans la navigation")
    if other is not None:
        nav = sub1(r'<a class="lang" href="[^"]*"', f'<a class="lang" href="{other}"', nav, "lien de langue")
    return sprite, nav, footer


def tip_card(slug, meta, num, href, lang="fr"):
    L, ty = TIPS[lang], tip_typo(lang)
    return f"""          <a class="tip-card spotlight" href="{href}" data-reveal>
            <span class="tip-card__top"><span class="tip-card__icon"><svg class="ico"><use href="#{meta["icon"]}"/></svg></span><span class="tip-card__num">{num:02d}</span></span>
            <span class="tip-card__tag">{meta["tag"]} · {L["read"].format(meta["read"])}</span>
            <span class="tip-card__title">{ty(meta["title"])}</span>
            <span class="tip-card__excerpt">{ty(meta["excerpt"])}</span>
            <span class="tip-card__more">{L["more"]} <svg class="ico"><use href="#i-arrow-right"/></svg></span>
          </a>"""


def build_listing(home, data, version, lang="fr"):
    """Liste des articles : conseils/ (français) ou en/conseils/ (anglais)."""
    en = lang == "en"
    L = TIPS[lang]
    root, local = ("../../", "../") if en else ("../", "../")
    sprite, nav, footer = layout(home, root, True, local, other="../../conseils/" if en else "../en/conseils/")
    cards = "\n".join(tip_card(slug, meta, i, f"{slug}/", lang) for i, (slug, (meta, _)) in enumerate(data.items(), 1))
    url_fr, url_en = f"{SITE}conseils/", f"{SITE}en/conseils/"
    page = doc_head(L["list_title"], L["list_desc"], url_en if en else url_fr, version, root, lang=lang, alt=(url_fr, url_en)) + f"""<body>
  <!-- {L["comment"]} : modifier les textes là-bas -->
{sprite}{nav}
  <main id="main">
    <section class="page-hero page-hero--tips">
      <div class="hero__bg" aria-hidden="true">
        <div class="aurora"><span></span><span></span><span></span></div>
        <div class="gridlines"></div>
      </div>
      <div class="container page-hero__inner">
        <p class="eyebrow" data-reveal>{L["eyebrow"]}</p>
        <h1 class="page-hero__title" data-split>{L["h1"]}</h1>
        <p class="section__lead" data-reveal>{L["lead"]}</p>
      </div>
    </section>

    <section class="section tips tips--all">
      <div class="container">
        <div class="tips__grid" data-stagger>
{cards}
        </div>
        <aside class="article__cta" data-reveal>
          <p class="article__cta-title">{L["list_cta_title"]}</p>
          <p>{L["list_cta_text"]}</p>
          <div class="article__cta-actions">
            <a class="btn btn--primary magnetic" href="{local}diagnostic/"><span>{L["diag"]}</span><svg class="ico"><use href="#i-arrow-right"/></svg></a>
            <a class="btn btn--ghost magnetic" href="{local}contact/"><span>{L["quote"]}</span></a>
          </div>
        </aside>
      </div>
    </section>
  </main>

{footer}</body>
</html>
"""
    out = ROOT / ("en" if en else "") / "conseils" / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")


def diag_scores(home):
    """Scores possibles du diagnostic express : chaque question est notée de 0 à 2."""
    questions = len(re.findall(r'class="diag__q[ "]', home))
    if not questions:
        sys.exit("Diagnostic : aucune question trouvée dans index.html")
    return sorted({round(total / (questions * 2) * 100) for total in range(questions * 2 + 1)})


def diag_verdicts(home):
    found = re.findall(r'<li data-min="(\d+)" data-title="([^"]+)" data-text="([^"]+)"></li>', home)
    return sorted(((int(m), title, text) for m, title, text in found), reverse=True)


def build_diag_pages(version):
    """Pages d'arrivée des scores partagés (diagnostic/<score>/) : leur aperçu affiche le score."""
    home = SRC.read_text(encoding="utf-8")
    sprite, nav, footer = page_parts(home, "../../")
    verdicts = diag_verdicts(home)
    colors = ["var(--text)", "#a6a6a6", "#6e6e6e"]
    scores = diag_scores(home)
    for score in scores:
        rank = next(i for i, v in enumerate(verdicts) if score >= v[0])
        _, title, text = verdicts[rank]
        offset = round(327 * (1 - score / 100), 1)
        page = doc_head(f"{score}/100 au diagnostic express",
                        f"Ce serveur Discord a obtenu {score}/100 au diagnostic express de Mvrius. Et le vôtre ? Faites le test en une minute.",
                        f"{SITE}diagnostic/{score}/", version, "../../", image=og_image(f"diagnostic-{score}"), noindex=True) + f"""<body>
  <!-- Page générée par tools/build.py : arrivée depuis un score partagé du diagnostic express -->
{sprite}{nav}
  <main id="main">
    <section class="page-hero score-page">
      <div class="hero__bg" aria-hidden="true">
        <div class="aurora"><span></span><span></span><span></span></div>
        <div class="gridlines"></div>
      </div>
      <div class="container score">
        <div class="diag__gauge score__gauge" style="--to:{offset};--ring:{colors[min(rank, 2)]}" role="img" aria-label="Score : {score} sur 100" data-reveal>
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52"/><circle class="diag__ring" cx="60" cy="60" r="52"/></svg>
          <p aria-hidden="true"><b>{score}</b><small>/100</small></p>
        </div>
        <div class="score__copy">
          <p class="eyebrow" data-reveal>Diagnostic express</p>
          <h1 class="score__title" data-split>Ce serveur a obtenu <em>{score}/100</em>.</h1>
          <p class="score__verdict" data-reveal><b>{title}</b>{text}</p>
          <p class="score__invite" data-reveal>Et le vôtre&nbsp;? 6 questions, une minute&nbsp;: obtenez votre score et des conseils personnalisés pour votre serveur.</p>
          <div class="page-hero__cta score__cta" data-reveal>
            <a class="btn btn--primary magnetic" href="../"><span>Faire le diagnostic</span><svg class="ico"><use href="#i-arrow-right"/></svg></a>
            <a class="btn btn--ghost magnetic" href="../../"><span>Découvrir Mvrius</span></a>
          </div>
        </div>
      </div>
    </section>
  </main>

{footer}</body>
</html>
"""
        out = ROOT / "diagnostic" / str(score) / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page, encoding="utf-8")
    print(f"Diagnostic : {len(scores)} pages de score")


def build_articles(version):
    """Liste et articles « Conseils » en français (conseils/) et en anglais (en/conseils/).
    Renvoie les articles français (pour le sitemap)."""
    fr_home = SRC.read_text(encoding="utf-8")
    homes = {"fr": fr_home, "en": translate(fr_home)}
    result = {}
    for lang in ("fr", "en"):
        en = lang == "en"
        L, ty = TIPS[lang], tip_typo(lang)
        data = {slug: read_article(slug, lang) for slug in ARTICLES}
        result[lang] = data
        build_listing(homes[lang], data, version, lang)
        root, local = ("../../../", "../../") if en else ("../../", "../../")
        for i, (slug, (meta, body)) in enumerate(data.items()):
            url_fr, url_en = f"{SITE}conseils/{slug}/", f"{SITE}en/conseils/{slug}/"
            url = url_en if en else url_fr
            sprite, nav, footer = layout(homes[lang], root, False, local,
                                         other=f"../../../conseils/{slug}/" if en else f"../../en/conseils/{slug}/")
            image = og_image(f"en-{slug}" if en else slug)
            body, toc = with_toc(body, lang)
            if en:  # mêmes chemins relatifs que l'article français, un dossier plus bas
                body = body.replace('"../../assets/', '"../../../assets/')
            article_ld = {
                "@context": "https://schema.org", "@type": "Article",
                "headline": meta["title"], "description": meta["description"], "inLanguage": lang,
                "datePublished": meta["date"], "dateModified": meta["date"],
                "image": image, "mainEntityOfPage": url,
                "author": {"@type": "Person", "name": "Mvrius", "url": f"{SITE}en/" if en else SITE},
                "publisher": {"@type": "Person", "name": "Mvrius", "url": f"{SITE}en/" if en else SITE},
            }
            # « À lire aussi » : les deux articles suivants (en boucle)
            nexts = [ARTICLES[(i + k) % len(ARTICLES)] for k in (1, 2)]
            others = "\n".join(f"""          <a class="more-card spotlight" href="../{other}/" data-reveal>
            <span class="tip-card__tag">{data[other][0]["tag"]} · {L["read"].format(data[other][0]["read"])}</span>
            <span class="more-card__title">{ty(data[other][0]["title"])}</span>
            <span class="tip-card__more">{L["more"]} <svg class="ico"><use href="#i-arrow-right"/></svg></span>
          </a>""" for other in nexts)
            tweet = "https://twitter.com/intent/tweet?" + urllib.parse.urlencode({"text": meta["title"], "url": url})
            date = (en_date if en else fr_date)(meta["date"]).replace(" ", "&nbsp;")
            read = L["read"].format(meta["read"]).replace(" ", "&nbsp;")
            source = f"tools/articles/{'en/' if en else ''}{slug}.html"
            page = doc_head(meta["title"], meta["description"], url, version, root, "article", article_ld, image,
                            lang=lang, alt=(url_fr, url_en)) + f"""<body class="page-article">
  <!-- Page générée par tools/build.py à partir de {source} : modifier le texte là-bas -->
{sprite}{nav}
  <main id="main">
    <article class="article">
      <header class="article__hero">
        <div class="hero__bg" aria-hidden="true">
          <div class="aurora"><span></span><span></span><span></span></div>
          <div class="gridlines"></div>
        </div>
        <div class="container article__head">
          <a class="article__back" href="../"><svg class="ico" aria-hidden="true"><use href="#i-arrow-right"/></svg>{L["back"]}</a>
          <p class="eyebrow" data-reveal>{meta["tag"]}</p>
          <h1 class="article__title" data-split>{ty(meta["title"])}</h1>
          <p class="article__meta" data-reveal>
            <span class="avatar-status"><span class="avatar avatar--sm"><span class="avatar__fallback">M</span><img src="{root}assets/img/profile-sm.jpg" alt="" width="36" height="36" onerror="this.remove()"></span><span class="status js-status" hidden></span></span>
            <span>{L["by"]} <b>Mvrius</b> · <time datetime="{meta["date"]}">{date}</time> · {read}</span>
          </p>
        </div>
      </header>

      <div class="container article__body">
        <div class="article__layout">
{toc}
          <div class="prose js-prose" data-reveal>
{body}
          </div>
        </div>

        <div class="share" data-reveal>
          <p class="share__label">{L["share"]}</p>
          <div class="share__actions">
            <button class="share__btn js-share" type="button" data-title="{meta["title"]}" data-url="{url}" hidden><svg class="ico" aria-hidden="true"><use href="#i-share"/></svg><span>{L["share_btn"]}</span></button>
            <button class="share__btn js-share-copy" type="button" data-url="{url}"><svg class="ico" aria-hidden="true"><use href="#i-link"/></svg><span class="js-share-label">{L["copy"]}</span></button>
            <a class="share__btn" href="{tweet.replace("&", "&amp;")}" target="_blank" rel="noopener"><svg class="ico ico--fill" aria-hidden="true"><use href="#b-x"/></svg><span>{L["share_x"]}</span></a>
          </div>
        </div>

        <aside class="article__cta" data-reveal>
          <p class="article__cta-title">{L["cta_title"]}</p>
          <p>{L["cta_text"]}</p>
          <div class="article__cta-actions">
            <a class="btn btn--primary magnetic" href="{local}contact/"><span>{L["quote"]}</span><svg class="ico"><use href="#i-arrow-right"/></svg></a>
            <a class="btn btn--ghost magnetic" href="{local}diagnostic/"><span>{L["diag"]}</span></a>
          </div>
        </aside>

        <nav class="article__more" aria-label="{L["others"]}">
          <p class="eyebrow">{L["next"]}</p>
          <div class="more-grid" data-stagger>
{others}
          </div>
          <a class="article__all" href="../">{L["all"]} <svg class="ico" aria-hidden="true"><use href="#i-arrow-right"/></svg></a>
        </nav>
      </div>
    </article>
  </main>

{footer}</body>
</html>
"""
            out = ROOT / ("en" if en else "") / "conseils" / slug / "index.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(page, encoding="utf-8")
    print(f"Conseils : page de liste + {len(ARTICLES)} articles, en français et en anglais")
    return result["fr"]


def build_legal_pages(version):
    """Mentions légales et CGU (textes dans tools/pages/), avec la navigation et le pied de page de l'accueil."""
    home = SRC.read_text(encoding="utf-8")
    sprite, nav, footer = page_parts(home, "../")
    for slug in PAGES:
        raw = (ROOT / "tools" / "pages" / f"{slug}.html").read_text(encoding="utf-8")
        meta = json.loads(re.match(r"<!--(.*?)-->", raw, re.S).group(1))
        body = raw.split("-->", 1)[1].strip()
        url = f"{SITE}{slug}/"
        page = doc_head(meta["title"], meta["description"], url, version, "../") + f"""<body class="page-article">
  <!-- Page générée par tools/build.py à partir de tools/pages/{slug}.html : modifier le texte là-bas -->
{sprite}{nav}
  <main id="main">
    <article class="article">
      <header class="article__hero">
        <div class="hero__bg" aria-hidden="true">
          <div class="aurora"><span></span><span></span><span></span></div>
          <div class="gridlines"></div>
        </div>
        <div class="container article__head">
          <a class="article__back" href="../"><svg class="ico" aria-hidden="true"><use href="#i-arrow-right"/></svg>Retour à l'accueil</a>
          <p class="eyebrow" data-reveal>Informations légales</p>
          <h1 class="article__title" data-split>{typo(meta["title"])}</h1>
          <p class="article__meta" data-reveal><span>Dernière mise à jour&nbsp;: <time datetime="{meta["date"]}">{fr_date(meta["date"]).replace(" ", "&nbsp;")}</time></span></p>
        </div>
      </header>

      <div class="container article__body">
        <div class="prose" data-reveal>
{body}
        </div>
      </div>
    </article>
  </main>

{footer}</body>
</html>
"""
        out = ROOT / slug / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page, encoding="utf-8")
    print(f"Pages légales : {len(PAGES)}")


def build_reservation_page(version):
    """Page « Réserver un appel » : créneaux libres et formulaire (assets/js/reservation.js)."""
    home = SRC.read_text(encoding="utf-8")
    sprite, nav, footer = page_parts(home, "../")
    url = f"{SITE}{RESA}/"
    head = doc_head("Réserver un appel", "Choisissez un créneau libre pour parler de votre serveur Discord avec Mvrius : gratuit et sans engagement.", url, version, "../")
    head = head.replace("</head>", f'  <script src="../agenda/config.js?v={version}" defer></script>\n  <script src="../assets/js/reservation.min.js?v={version}" defer></script>\n</head>', 1)
    sujets = ["Création de serveur", "Restructuration", "Gestion &amp; modération", "Réseaux sociaux", "Autre"]
    options = "".join(f'<option value="{x}">{x}</option>' for x in sujets)
    page = head + f"""<body class="page-article page-resa">
  <!-- Page générée par tools/build.py (build_reservation_page) -->
{sprite}{nav}
  <main id="main">
    <header class="article__hero resa__hero">
      <div class="hero__bg" aria-hidden="true">
        <div class="aurora"><span></span><span></span><span></span></div>
        <div class="gridlines"></div>
      </div>
      <div class="container article__head">
        <a class="article__back" href="../"><svg class="ico" aria-hidden="true"><use href="#i-arrow-right"/></svg>Retour à l'accueil</a>
        <p class="eyebrow" data-reveal>Prendre rendez-vous</p>
        <h1 class="article__title" data-split>Réservez un <em>appel</em>.</h1>
        <p class="section__lead" data-reveal>Choisissez un créneau de <span class="js-resa-duree">30</span>&nbsp;minutes pour parler de votre serveur Discord&nbsp;: vos objectifs, votre organisation, votre projet. C'est gratuit et sans engagement.</p>
      </div>
    </header>

    <section class="container resa">
      <div class="resa__carte js-resa" data-reveal>
        <div class="resa__etat js-resa-chargement" role="status"><span class="resa__roue" aria-hidden="true"></span>Chargement des créneaux libres…</div>

        <div class="js-resa-choix" hidden>
          <h2 class="resa__titre"><span>1</span>Choisissez un jour</h2>
          <div class="resa__jours js-resa-jours" role="group" aria-label="Jours disponibles"></div>
          <h2 class="resa__titre"><span>2</span>Choisissez une heure <small class="js-resa-jour-texte"></small></h2>
          <div class="resa__heures js-resa-heures" role="group" aria-label="Heures disponibles"></div>
          <p class="resa__note">Heures de Paris. <span class="js-resa-info" role="status"></span></p>
        </div>

        <form class="resa__form js-resa-form" hidden novalidate>
          <div class="resa__choisi">
            <svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>
            <p class="js-resa-recap"></p>
            <button class="resa__changer js-resa-changer" type="button">Changer</button>
          </div>
          <div class="resa__champs">
            <label class="field field--full"><input name="nom" type="text" required maxlength="80" placeholder=" " autocomplete="name"><span>Nom ou pseudo</span></label>
            <label class="field"><input name="email" type="email" maxlength="120" placeholder=" " autocomplete="email"><span>E-mail</span></label>
            <label class="field"><input name="discord" type="text" maxlength="60" placeholder=" " autocomplete="off"><span>Pseudo Discord</span></label>
            <label class="field field--select field--full"><select name="sujet">{options}</select><span>Sujet</span></label>
            <label class="field field--full"><textarea name="message" rows="4" maxlength="1500" placeholder=" "></textarea><span>Quelques mots sur votre serveur (facultatif)</span></label>
            <input class="quote__honey" type="text" name="site" tabindex="-1" autocomplete="off" aria-hidden="true">
          </div>
          <p class="resa__aide">Un e-mail ou un pseudo Discord suffit&nbsp;: je vous contacte une fois le rendez-vous validé. Ces informations servent uniquement à organiser l'appel (<a href="../mentions-legales/">mentions légales</a>).</p>
          <div class="quote__foot">
            <button class="btn btn--primary btn--lg quote__submit" type="submit"><span class="quote__spinner" aria-hidden="true"></span><span class="quote__label">Envoyer la demande</span><svg class="ico"><use href="#i-arrow-right"/></svg></button>
            <p class="quote__status resa__erreur js-resa-erreur" role="alert"></p>
          </div>
        </form>

        <div class="resa__etat resa__etat--ok js-resa-ok" hidden>
          <span class="resa__pastille" aria-hidden="true"><svg class="ico"><use href="#i-check"/></svg></span>
          <h2>Demande envoyée&nbsp;!</h2>
          <p><b class="js-resa-ok-recap"></b></p>
          <p>Elle est en attente de validation, en général dans la journée. Une fois le rendez-vous validé, je vous contacte <span class="js-resa-ok-contact"></span>.</p>
          <a class="btn btn--ghost btn--sm" href="../"><span>Retour à l'accueil</span></a>
        </div>

        <div class="resa__etat js-resa-ferme" hidden>
          <h2>Je n'ai pas de disponibilités pour le moment.</h2>
          <p>Vous pouvez m'écrire directement&nbsp;: je vous réponds rapidement.</p>
          <div class="resa__boutons">
            <a class="btn btn--primary btn--sm" href="../contact/"><span>Me contacter</span><svg class="ico"><use href="#i-arrow-right"/></svg></a>
          </div>
        </div>
      </div>

      <aside class="resa__infos" data-reveal>
        <h2>Comment ça se passe&nbsp;?</h2>
        <ol>
          <li><b>Vous choisissez un créneau</b> qui vous arrange.</li>
          <li><b>Je valide votre demande</b>, en général dans la journée. Je ne vous contacte qu'une fois le rendez-vous validé.</li>
          <li><b>On s'appelle sur Discord</b>&nbsp;: votre serveur, vos objectifs, mes conseils.</li>
        </ol>
        <p>Vous préférez écrire&nbsp;? <a href="../contact/">Demandez un devis</a>.</p>
      </aside>
    </section>
  </main>

{footer}</body>
</html>
"""
    out = ROOT / RESA / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")
    print("Page de réservation : OK")


def build_sitemap(data):
    """sitemap.xml (pages publiques) et robots.txt."""
    last = max(meta["date"] for meta, _ in data.values())
    urls = []
    for page in [None, *SITE_PAGES]:
        fr = SITE + (f"{page}/" if page else "")
        en = f"{SITE}en/" + (f"{page}/" if page else "")
        alt = (f'\n    <xhtml:link rel="alternate" hreflang="fr" href="{fr}"/>'
               f'\n    <xhtml:link rel="alternate" hreflang="en" href="{en}"/>'
               f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{fr}"/>')
        urls += [(fr, last if page == "conseils" else None, alt), (en, last if page == "conseils" else None, alt)]
    for slug, (meta, _) in data.items():
        fr, en = f"{SITE}conseils/{slug}/", f"{SITE}en/conseils/{slug}/"
        alt = (f'\n    <xhtml:link rel="alternate" hreflang="fr" href="{fr}"/>'
               f'\n    <xhtml:link rel="alternate" hreflang="en" href="{en}"/>'
               f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{fr}"/>')
        urls += [(fr, meta["date"], alt), (en, meta["date"], alt)]
    staff_alt = (f'\n    <xhtml:link rel="alternate" hreflang="fr" href="{SITE}staff/"/>'
                 f'\n    <xhtml:link rel="alternate" hreflang="en" href="{SITE}en/staff/"/>'
                 f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}staff/"/>')
    urls += [(f"{SITE}staff/", None, staff_alt), (f"{SITE}en/staff/", None, staff_alt), (f"{SITE}liens/", None, "")]
    urls += [(f"{SITE}{slug}/", None, "") for slug in PAGES + [RESA]]
    rows = "\n".join(f"  <url>\n    <loc>{loc}</loc>" + (f"\n    <lastmod>{mod}</lastmod>" if mod else "") + f"{extra}\n  </url>"
                     for loc, mod, extra in urls)
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        f"{rows}\n</urlset>\n", encoding="utf-8")
    # L'agenda, l'atelier et l'espace client sont privés : pas d'exploration
    (ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /agenda/\nDisallow: /atelier/\nDisallow: /espace/\n\nSitemap: {SITE}sitemap.xml\n", encoding="utf-8")
    print(f"Sitemap : {len(urls)} pages")


def sync_staff_page():
    home = SRC.read_text(encoding="utf-8")
    _, nav, footer = page_parts(home, "../")
    nav = nav.replace('aria-label="Mvrius, retour en haut"', 'aria-label="Mvrius, retour à l\'accueil"')
    nav = nav.replace('<a href="../staff/" data-text="Recrutement">', '<a href="./" data-text="Recrutement" aria-current="page">')
    nav = re.sub(r'<a href="\.\./staff/"><small>(\d+)</small>', r'<a href="./" aria-current="page"><small>\1</small>', nav)
    nav = nav.replace('<a class="lang" href="../en/"', '<a class="lang" href="../en/staff/"')
    footer = footer.replace('href="../staff/"', 'href="./"')
    path = ROOT / "staff" / "index.html"
    page = with_alternates(path.read_text(encoding="utf-8"), f"{SITE}staff/", f"{SITE}en/staff/")
    page, n1 = re.subn(r'  <a class="skip".*?(?=\n  <main id="main">)', lambda m: nav.rstrip("\n"), page, count=1, flags=re.S)
    page, n2 = re.subn(r'  <footer class="footer">.*?</footer>\n', lambda m: footer, page, count=1, flags=re.S)
    if n1 != 1 or n2 != 1:
        sys.exit("Page équipe : navigation ou pied de page introuvable")
    path.write_text(page, encoding="utf-8")


# Page Recrutement en anglais : traduction de staff/index.html (même principe que la table T).
# Les noms des champs et les valeurs envoyées restent en français (e-mail reçu identique).
STAFF_EN = [
    ('<html lang="fr">', '<html lang="en">', 1),
    ("<title>Rejoindre l'équipe — Mvrius</title>", "<title>Join the team — Mvrius</title>", 1),
    ('content="Rejoins l\'équipe de Mvrius : modération, animation, support. Présente-toi pour être contacté selon les besoins de mes projets."',
     'content="Join Mvrius\'s team: moderation, events, support. Introduce yourself and I\'ll reach out when one of my projects needs you."', 1),
    ('<link rel="canonical" href="https://mvriuus.fr/staff/">', '<link rel="canonical" href="https://mvriuus.fr/en/staff/">', 1),
    ('<meta property="og:url" content="https://mvriuus.fr/staff/">', '<meta property="og:url" content="https://mvriuus.fr/en/staff/">', 1),
    ('<meta property="og:locale" content="fr_FR">', '<meta property="og:locale" content="en_US">', 1),
    ('<meta property="og:title" content="Rejoindre l\'équipe — Mvrius">', '<meta property="og:title" content="Join the team — Mvrius">', 1),
    ('content="Modération, animation, support : présente-toi pour rejoindre mon équipe sur mes prochains projets."',
     'content="Moderation, events, support: introduce yourself to join my team on upcoming projects."', 1),
    ('<p class="eyebrow" data-reveal>Recrutement</p>', '<p class="eyebrow" data-reveal>Recruitment</p>', 1),
    ("Rejoins <em>l'équipe</em>.", "Join <em>the team</em>.", 1),
    ("Je garde sous le coude des personnes motivées pour renforcer mes projets quand le besoin se présente. Tu veux faire partie de l'équipe&nbsp;? Présente-toi ci-dessous&nbsp;: je reviens vers toi dès qu'une mission correspond à ton profil.",
     "I keep in touch with motivated people who can strengthen my projects when the need arises. Want to be part of the team? Introduce yourself below: I'll get back to you as soon as a role matches your profile.", 1),
    ("<span>Postuler maintenant</span>", "<span>Apply now</span>", 1),
    ("📢 | recrutements</div>", "📢 | recruitment</div>", 1),
    ('<span class="msg__tag msg__tag--mod">GÉRANT</span><time>Aujourd\'hui</time>', '<span class="msg__tag msg__tag--mod">OWNER</span><time>Today</time>', 1),
    ("<strong>📢 Les recrutements sont ouverts&nbsp;!</strong>", "<strong>📢 Recruitment is open!</strong>", 1),
    ("<span>Je cherche des personnes motivées pour renforcer mon équipe sur mes prochains projets.</span>",
     "<span>I'm looking for motivated people to strengthen my team on upcoming projects.</span>", 1),
    ("<span>🛡️ Modération</span><span>🎉 Animation</span><span>💬 Support</span>", "<span>🛡️ Moderation</span><span>🎉 Events</span><span>💬 Support</span>", 1),
    ('<span class="recruit__btn">Postuler</span>', '<span class="recruit__btn">Apply</span>', 1),
    ('<p class="eyebrow" data-reveal>Les postes</p>', '<p class="eyebrow" data-reveal>The roles</p>', 1),
    ("Trouve ta <em>place</em>.", "Find your <em>place</em>.", 1),
    ("<h3>Modération</h3>", "<h3>Moderation</h3>", 1),
    ("<p>Faire respecter le règlement, désamorcer les conflits et veiller à ce que chacun se sente bien sur le serveur.</p>",
     "<p>Enforce the rules, defuse conflicts and make sure everyone feels welcome on the server.</p>", 1),
    ("<h3>Animation</h3>", "<h3>Events</h3>", 1),
    ("<p>Organiser des événements et des concours, lancer des discussions et faire vivre les salons.</p>",
     "<p>Organise events and contests, start conversations and keep the channels lively.</p>", 1),
    ("<p>Aider les membres, répondre à leurs questions et traiter les tickets.</p>",
     "<p>Help members, answer their questions and handle tickets.</p>", 1),
    ('<p class="eyebrow" data-reveal>Candidature</p>', '<p class="eyebrow" data-reveal>Application</p>', 1),
    ("Présente-<em>toi</em>.", "Introduce <em>yourself</em>.", 1),
    ('data-mail-subject="Candidature staff"', 'data-mail-subject="Staff application"', 1),
    ('value="Nouvelle candidature staff — mvriuus.fr"', 'value="Nouvelle candidature staff (version anglaise) — mvriuus.fr"', 1),
    ("<legend>Poste visé</legend>", "<legend>Role</legend>", 1),
    ('value="Modération" required><span>Modération</span>', 'value="Modération" required><span>Moderation</span>', 1),
    ('value="Animation" required><span>Animation</span>', 'value="Animation" required><span>Events</span>', 1),
    ('value="Autre" required><span>Autre</span>', 'value="Autre" required><span>Other</span>', 1),
    ("<span>Pseudo Discord</span>", "<span>Discord username</span>", 1),
    ("<span>Âge</span>", "<span>Age</span>", 1),
    ("<span>E-mail</span>", "<span>Email</span>", 1),
    ("<option>Quelques heures par semaine</option>", '<option value="Quelques heures par semaine">A few hours a week</option>', 1),
    ("<option>Un peu chaque jour</option>", '<option value="Un peu chaque jour">A little every day</option>', 1),
    ("<option>Surtout le week-end</option>", '<option value="Surtout le week-end">Mostly at weekends</option>', 1),
    ("<span>Disponibilités</span>", "<span>Availability</span>", 1),
    ("<span>Ton expérience (serveurs, rôles…) — facultatif</span>", "<span>Your experience (servers, roles…) — optional</span>", 1),
    ("<span>Pourquoi veux-tu rejoindre l'équipe&nbsp;?</span>", "<span>Why do you want to join the team?</span>", 1),
    ('<span class="quote__label">Envoyer ma candidature</span>', '<span class="quote__label">Send my application</span>', 1),
    ("Tes informations servent uniquement à étudier ta candidature.", "Your information is only used to review your application.", 1),
    ("Merci, ta candidature est bien partie&nbsp;!", "Thanks, your application has been sent!", 1),
    ("Je reviens vers toi sur Discord ou par e-mail dès qu'une mission correspond à ton profil.",
     "I'll get back to you on Discord or by email as soon as a role matches your profile.", 1),
    ("<!-- EN-TÊTE -->", "<!-- HEADER -->", 1),
    ("<!-- POSTES -->", "<!-- ROLES -->", 1),
    ("<!-- CANDIDATURE -->", "<!-- APPLICATION -->", 1),
]


def build_staff_en():
    """Page Recrutement anglaise (en/staff/) à partir de la page française, avec la navigation anglaise."""
    html = (ROOT / "staff" / "index.html").read_text(encoding="utf-8")
    errors = []
    for fr, en, expected in STAFF_EN:
        if html.count(fr) != expected:
            errors.append(f"{html.count(fr)} occurrence(s) au lieu de {expected} : {fr[:90]}")
        html = html.replace(fr, en)
    if errors:
        sys.exit("Page Recrutement anglaise, traduction à mettre à jour :\n- " + "\n- ".join(errors))
    html = html.replace('href="../assets/', 'href="../../assets/').replace('href="../site.webmanifest"', 'href="../../site.webmanifest"')
    html = html.replace('src="../assets/', 'src="../../assets/')
    _, nav, footer = page_parts(translate(SRC.read_text(encoding="utf-8")), "../../", "../")
    nav = nav.replace('aria-label="Mvrius, back to top"', 'aria-label="Mvrius, back to home"')
    nav = nav.replace('<a href="../staff/" data-text=', '<a href="./" aria-current="page" data-text=')
    nav = re.sub(r'<a href="\.\./staff/"><small>(\d+)</small>', r'<a href="./" aria-current="page"><small>\1</small>', nav)
    nav = sub1(r'<a class="lang" href="[^"]*"', '<a class="lang" href="../../staff/"', nav, "lien de langue")
    footer = footer.replace('href="../staff/"', 'href="./"')
    html = sub1(r'  <a class="skip".*?(?=\n  <main id="main">)', lambda m: nav.rstrip("\n"), html, "navigation", re.S)
    html = sub1(r'  <footer class="footer">.*?</footer>\n', lambda m: footer, html, "pied de page", re.S)
    html = with_alternates(html, f"{SITE}staff/", f"{SITE}en/staff/")
    html = html.replace("<body>\n", "<body>\n  <!-- Page générée par tools/build.py à partir de staff/index.html : modifier le texte là-bas (traduction : STAFF_EN) -->\n", 1)
    out = ROOT / "en" / "staff" / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print("Page Recrutement anglaise : OK")


def translate(html):
    """Version anglaise de tools/site.html (table T) : chemins et liens restent ceux de la source."""
    # Données structurées en anglais (remplacées d'abord : elles reprennent les textes de la FAQ)
    blocks = re.findall(r'<script type="application/ld\+json">.*?</script>', html, flags=re.S)
    if len(blocks) != 2:
        sys.exit("Données structurées : 2 blocs attendus")
    faq = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ_EN]}
    html = html.replace(blocks[0], ld_block(PERSON_EN)).replace(blocks[1], ld_block(faq))

    errors = []
    for fr, en, expected in T:
        found = html.count(fr)
        if expected is None:
            if not found:
                errors.append(f"introuvable : {fr[:90]}")
        elif found != expected:
            errors.append(f"{found} occurrence(s) au lieu de {expected} : {fr[:90]}")
        html = html.replace(fr, en)
    if errors:
        sys.exit("Traduction à mettre à jour :\n- " + "\n- ".join(errors))

    # Note sous le carrousel : les avis sont traduits
    html, n = re.subn(r'(<div class="dchan js-dchan".*?<div class="dchan__list"[^>]*>.*?</div>\s*</div>\s*</div>)', r'\1\n        <p class="t-note">Reviews translated from French.</p>', html, count=1, flags=re.S)
    if n != 1:
        sys.exit("Salon d'avis introuvable")
    return html


def sub1(pattern, repl, html, what, flags=0):
    """Remplacement qui doit avoir lieu exactement une fois (sinon le script s'arrête)."""
    html, n = re.subn(pattern, lambda m: repl if isinstance(repl, str) else repl(m), html, count=1, flags=flags)
    if n != 1:
        sys.exit(f"Pages du site : {what} introuvable")
    return html


def site_section(html, name):
    """Bloc <section … id="name"> de tools/site.html, avec le commentaire qui le précède."""
    m = re.search(rf'    <!-- [^\n]*-->\n    <section [^>]*id="{name}">.*?\n    </section>\n\n?', html, re.S)
    if not m:
        sys.exit(f"Section « {name} » introuvable dans tools/site.html")
    return m.group(0)


def services_ld(html, lang, url):
    """Données structurées de la page Services : un service par carte (titre et texte de la carte)."""
    section = site_section(html, "services")
    cards = re.findall(r"<h3>(.*?)</h3>\s*<p>(.*?)</p>", section, re.S)
    if len(cards) < 2:
        sys.exit("Services : cartes introuvables pour les données structurées")
    clean = lambda t: re.sub(r"<[^>]+>", "", t).replace("&nbsp;", " ").replace("&amp;", "&").strip()  # noqa: E731
    en = lang == "en"
    return {
        "@context": "https://schema.org",
        "@type": "Service",
        "name": "Discord community management" if en else "Gestion de communautés Discord",
        "serviceType": "Community management",
        "description": SITE_PAGES["services"][1 if en else 0][1],
        "url": url,
        "inLanguage": lang,
        "provider": {"@type": "Person", "name": "Marius", "alternateName": "Mvrius", "url": f"{SITE}en/" if en else SITE},
        "availableChannel": {"@type": "ServiceChannel", "serviceUrl": f"{SITE}{'en/' if en else ''}contact/"},
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Services",
            "itemListElement": [{"@type": "Offer", "itemOffered": {"@type": "Service", "name": clean(t), "description": clean(d)}}
                                for t, d in cards],
        },
    }


def site_page(html, lang, page):
    """Accueil (page=None) ou page d'une section, dans la langue de html."""
    en = lang == "en"
    depth = int(en) + (1 if page else 0)
    root = "../" * depth            # vers la racine du site (assets, pages en français)
    up = "../" if page else ""      # vers l'accueil de la même langue
    sections = {name: site_section(html, name) for name in SECTIONS}
    sub = lambda pattern, repl, what, flags=0: sub1(pattern, repl, html, what, flags)  # noqa: E731

    if page:
        # Une page ne garde que sa section, dont le titre devient le titre principal (h1)
        body = re.sub(r"<h2([^>]*)>(.*?)</h2>", r"<h1\1>\2</h1>", sections[page], count=1, flags=re.S)
        start, end = html.index("    <!-- HERO -->"), html.index("  </main>")
        html = html[:start] + body.rstrip("\n") + "\n" + html[end:]
        html = sub(r'<main id="main">', f'<main id="main" class="page page--{page}">', "<main>")
        html = sub(r"  <!-- Écran d'intro -->.*?\n  </div>\n\n", "", "écran d'intro", re.S)
        if page == "contact":
            html = sub(r'\n  <a class="fab-cta[^\n]*</a>', "", "bouton flottant")
        title, desc = SITE_PAGES[page][1 if en else 0]
        html = sub(r"<title>.*?</title>", f"<title>{title} — Mvrius</title>", "<title>")
        html = sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{desc}">', "description")
        html = sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{title} — Mvrius">', "og:title")
        html = sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{desc}">', "og:description")
    else:
        # L'accueil garde la présentation, le bandeau et le menu des pages
        for block in sections.values():
            html = html.replace(block, "")
        # Anciens liens vers une partie de l'accueil (mvriuus.fr/#contact…) : on ouvre sa page
        html = sub(r"    \(function \(d\) \{\n", "    (function (d) {\n"
                   "      // Anciens liens vers une partie de l'accueil (mvriuus.fr/#contact…) : on ouvre sa page\n"
                   f"      var old = /^#({'|'.join(SECTIONS)})$/.exec(location.hash);\n"
                   "      if (old) { location.replace(old[1] + '/'); return; }\n", "script d'en-tête")

    # Données structurées : la personne sur l'accueil, les questions sur la page FAQ
    keep = {None: 0, "faq": 1}.get(page)
    for i, block in enumerate(re.findall(r'\n  <script type="application/ld\+json">.*?</script>', html, flags=re.S)):
        if i != keep:
            html = html.replace(block, "", 1)

    # Adresses de la page et de ses versions française et anglaise
    url_fr = SITE + (f"{page}/" if page else "")
    url_en = f"{SITE}en/" + (f"{page}/" if page else "")
    url = url_en if en else url_fr
    if page == "services":
        html = sub(r"\n</head>", f"\n  {ld_block(services_ld(html, lang, url))}\n</head>", "</head>")
    html = sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', "canonical")
    html = sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}">', "og:url")
    for code, target in (("fr", url_fr), ("en", url_en), ("x-default", url_fr)):
        html = sub(rf'<link rel="alternate" hreflang="{code}" href="[^"]*">', f'<link rel="alternate" hreflang="{code}" href="{target}">', f"hreflang {code}")

    # Liens : fichiers et pages françaises depuis la racine, sections vers leur page
    # (en anglais, la page Recrutement et les conseils ont leur version anglaise sous en/)
    if root:
        shared = r"assets/|liens/|mentions-legales/|cgu/|rendez-vous/|site\.webmanifest" + ("" if en else r"|staff/|conseils/")
        html = re.sub(rf'(href|src)="({shared})', rf'\1="{root}\2', html)
    if en and up:
        html = re.sub(r'href="(staff/|conseils/)', rf'href="{up}\1', html)
    other = f"{root}{page}/" if en and page else root if en else f"{root}en/" + (f"{page}/" if page else "")
    html = sub(r'<a class="lang" href="[^"]*"', f'<a class="lang" href="{other}"', "lien de langue")
    if page:
        html = html.replace('href="#top" class="footer__top"', 'href="#main" class="footer__top"')
        html = html.replace('href="#top"', 'href="../"')
    html = re.sub(r'href="#(' + "|".join(SECTIONS) + r')"', lambda m: f'href="{up}{m[1]}/"', html)
    if page:
        html = html.replace(f'href="../{page}/"', 'href="./"')
        html = html.replace('<a href="./" data-text=', '<a href="./" aria-current="page" data-text=')
        html = html.replace('<a href="./"><small>', '<a href="./" aria-current="page"><small>')
    return html.replace("<body>\n", "<body>\n  <!-- Page générée par tools/build.py à partir de tools/site.html : modifier le texte là-bas -->\n", 1)


def build_site(version):
    """Accueil et pages des sections, en français puis en anglais, à partir de tools/site.html."""
    fr = SRC.read_text(encoding="utf-8")
    count = 0
    for lang, html in (("fr", fr), ("en", translate(fr))):
        for page in [None, *SITE_PAGES]:
            if page == "conseils":
                continue  # la liste des articles (build_listing)
            out = ROOT / ("en" if lang == "en" else "") / (page or "") / "index.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(site_page(html, lang, page), encoding="utf-8")
            count += 1
    print(f"Pages du site : {count} (accueil et sections, français et anglais)")


def main():
    build_assets()
    sync_staff_page()
    version = stamp()
    build_sitemap(build_articles(version))
    build_diag_pages(version)
    build_legal_pages(version)
    build_reservation_page(version)
    build_site(version)
    build_staff_en()


if __name__ == "__main__":
    main()
