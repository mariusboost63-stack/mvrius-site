#!/usr/bin/env python3
"""Prépare le site avant publication.

Usage : python3 tools/build.py

1. Ajoute aux liens vers style.css et main.js un numéro de version (?v=…) calculé
   à partir de leur contenu : les navigateurs rechargent ainsi les fichiers à
   chaque mise à jour au lieu de garder une ancienne version en mémoire.
2. Génère les pages « Conseils » (conseils/index.html et conseils/<article>/index.html)
   à partir des textes de tools/articles/, avec la navigation et le pied de page de l'accueil.
3. Génère la version anglaise (en/index.html) à partir de index.html. Chaque texte
   français de la table doit exister dans index.html : si une phrase a été modifiée
   côté français, le script s'arrête et indique laquelle.
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

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "index.html"
OUT = ROOT / "en" / "index.html"
STAMPED = ["index.html", "staff/index.html", "liens/index.html", "404.html"]

# Articles « Conseils », du plus récent au plus ancien (textes dans tools/articles/<nom>.html)
ARTICLES = [
    "bots-arvenis-discord", "organiser-evenement-discord", "discord-createurs-de-contenu",
    "erreurs-serveur-discord", "structurer-salons-discord", "recruter-equipe-moderation",
]
SITE = "https://mvriuus.fr/"
# Pages légales (textes dans tools/pages/<nom>.html)
PAGES = ["mentions-legales", "cgu"]
# Icônes utilisées seulement dans les articles (ajoutées au sprite de l'accueil)
ARTICLE_ICONS = (
    '      <symbol id="b-x" viewBox="0 0 24 24"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></symbol>\n'
)
SECTIONS = ("services", "projets", "avis", "diagnostic", "conseils", "faq", "contact")

# (texte français, texte anglais, nombre d'occurrences attendu)
T = [
    # --- En-tête du document ---
    ('<html lang="fr">', '<html lang="en">', 1),
    ('<title>Mvrius — Community Manager Discord &amp; Réseaux sociaux</title>',
     '<title>Mvrius — Discord Community Manager &amp; Social Media</title>', 1),
    ('content="Marius (Mvrius), expert en gestion de communautés Discord : modération professionnelle, administration technique, stratégies d\'engagement et gestion des réseaux sociaux."',
     'content="Marius (Mvrius), Discord community management expert: professional moderation, technical administration, engagement strategies and social media management."', 1),
    ('<link rel="canonical" href="https://mvriuus.fr/">', '<link rel="canonical" href="https://mvriuus.fr/en/">', 1),
    ('<meta property="og:locale" content="fr_FR">',
     '<meta property="og:locale" content="en_US">\n  <meta property="og:locale:alternate" content="fr_FR">', 1),
    ('<meta property="og:title" content="Mvrius — Community Manager Discord">',
     '<meta property="og:title" content="Mvrius — Discord Community Manager">', 1),
    ('content="CEO d\'Arvenis, gérant du Café Français et administrateur des communautés de Nico Là et Byilhan. Modération, administration et stratégies d\'engagement sur Discord."',
     'content="CEO of Arvenis, manager of Le Café Français and administrator of the Nico Là and Byilhan communities. Moderation, administration and engagement strategies on Discord."', 1),
    ('<meta property="og:url" content="https://mvriuus.fr/">', '<meta property="og:url" content="https://mvriuus.fr/en/">', 1),
    ('content="Mvrius, Community Manager Discord : Le Café Français, Arvenis, Nico Là et Byilhan"',
     'content="Mvrius, Discord Community Manager: Le Café Français, Arvenis, Nico Là and Byilhan"', 1),

    # --- Navigation ---
    ('>Aller au contenu</a>', '>Skip to content</a>', 1),
    ('aria-label="Mvrius, retour en haut"', 'aria-label="Mvrius, back to top"', 1),
    ('aria-label="Navigation principale"', 'aria-label="Main navigation"', 1),
    ('data-text="Projets"><span>Projets</span>', 'data-text="Projects"><span>Projects</span>', 1),
    ('data-text="Avis"><span>Avis</span>', 'data-text="Reviews"><span>Reviews</span>', 1),
    ('<a href="staff/" data-text="Rejoindre l\'équipe"><span>Rejoindre l\'équipe</span></a>',
     '<a href="../staff/" data-text="Join the team" hreflang="fr"><span>Join the team</span></a>', 1),
    ('<a href="staff/"><small>07</small>Rejoindre l\'équipe</a>', '<a href="../staff/" hreflang="fr"><small>07</small>Join the team</a>', 1),
    ('<a class="lang" href="en/" hreflang="en" lang="en" aria-label="English version">EN</a>',
     '<a class="lang" href="../" hreflang="fr" lang="fr" aria-label="Version française">FR</a>', 1),
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
    ('<b class="js-members">9 208</b> membres</span>', '<b class="js-members">9,208</b> members</span>', 1),
    ('<div class="mock__input">Envoyer un message dans #💬 | discussion</div>', '<div class="mock__input">Message #💬 | discussion</div>', 1),
    ('<use href="#i-shield"/></svg>Modération</div>', '<use href="#i-shield"/></svg>Moderation</div>', 1),
    ('<use href="#i-bot"/></svg>Bots &amp; automatisations</div>', '<use href="#i-bot"/></svg>Bots &amp; automations</div>', 1),
    ('aria-label="Défiler vers la suite"', 'aria-label="Scroll down"', 1),

    # --- Bandeau ---
    ('<span>Modération</span><svg class="star">', '<span>Moderation</span><svg class="star">', 1),
    ('<span>Bots &amp; automatisations</span><svg class="star">', '<span>Bots &amp; automations</span><svg class="star">', 1),
    ('<span>Événements</span><svg class="star">', '<span>Events</span><svg class="star">', 1),
    ('<span class="o">Réseaux sociaux</span>', '<span class="o">Social media</span>', 1),

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
    ('data-cursor="Rejoindre"', 'data-cursor="Join"', 8),
    ('data-cursor="Visiter"', 'data-cursor="Visit"', 1),
    ('<span>Site web développé par moi : <b>cafe-fr.com</b></span>', '<span>Website I built: <b>cafe-fr.com</b></span>', 1),
    ('<span class="prow__desc">Communauté francophone</span>', '<span class="prow__desc">French-speaking community</span>', 1),
    ('<span class="prow__desc">Collectif de bots Discord</span>', '<span class="prow__desc">Discord bot collective</span>', 1),
    ('<span class="prow__desc">Communauté d\'influenceur</span>', '<span class="prow__desc">Influencer community</span>', 5),
    ('<span class="prow__desc">Communauté gaming</span>', '<span class="prow__desc">Gaming community</span>', 1),
    ('<b data-online></b> en ligne</span>', '<b data-online></b> online</span>', 8),
    ('<b data-members>9 208</b> membres</span>', '<b data-members>9,208</b> members</span>', 1),
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
    ('Découvrez-les ici</a>.', 'Discover them here</a> (in French).', 1),
    ('<span>Voir toutes les questions</span>', '<span>See all questions</span>', 1),
    ('Pouvez-vous recruter et gérer un staff&nbsp;?', 'Can you recruit and manage a staff team?', 1),
    ('Envie d\'en faire partie&nbsp;? <a class="faq__link" href="staff/">Postulez ici</a>.',
     'Want to join? <a class="faq__link" href="../staff/">Apply here</a> (in French).', 1),
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

    # --- Conseils (articles en français) ---
    ('<p class="eyebrow" data-reveal>Conseils</p>', '<p class="eyebrow" data-reveal>Tips</p>', 1),
    ('Mes conseils pour votre <em>serveur</em>.', 'Tips for your <em>server</em>.', 1),
    ('Des astuces concrètes, tirées de mon expérience, pour faire grandir votre communauté.',
     'Practical advice from my experience to help your community grow. Articles in French.', 1),
    ('href="conseils/', 'hreflang="fr" href="../conseils/', 5),
    ('<span>Voir tous les conseils</span>', '<span>See all tips</span>', 1),
    ('data-cursor="Lire"', 'data-cursor="Read"', 3),
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
    ('<a href="liens/">Tous mes liens</a>', '<a href="../liens/" hreflang="fr">All my links</a>', 1),
    ('<a href="staff/">Rejoindre l\'équipe</a>\n', '<a href="../staff/" hreflang="fr">Join the team (FR)</a>\n', 1),
    ('Retour en haut <svg', 'Back to top <svg', 1),
    ('Mvrius. Tous droits réservés.', 'Mvrius. All rights reserved.', 1),
    ('<a href="mentions-legales/">Mentions légales</a> · <a href="cgu/">CGU</a> · ',
     '<a href="../mentions-legales/" hreflang="fr">Legal notice (FR)</a> · <a href="../cgu/" hreflang="fr">Terms of use (FR)</a> · ', 1),
    ('Conçu avec soin · Hébergé sur GitHub Pages', 'Crafted with care · Hosted on GitHub Pages', 1),

    # --- Chemins : la page anglaise est un dossier plus bas ---
    ('href="assets/', 'href="../assets/', None),
    ('src="assets/', 'src="../assets/', None),
    ('href="site.webmanifest"', 'href="../site.webmanifest"', 1),
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
    "sameAs": ["https://www.instagram.com/mvriuus_/", "https://guns.lol/an"],
    "knowsAbout": ["Discord", "Moderation", "Community management", "Social media"],
}


def ld_block(data):
    body = json.dumps(data, ensure_ascii=False, indent=2).replace("\n", "\n  ")
    return f'<script type="application/ld+json">\n  {body}\n  </script>'


def stamp():
    assets = ROOT / "assets"
    digest = hashlib.md5((assets / "css" / "style.css").read_bytes() + (assets / "js" / "main.js").read_bytes())
    version = digest.hexdigest()[:8]
    for page in STAMPED:
        path = ROOT / page
        html = path.read_text(encoding="utf-8")
        html, n = re.subn(r'(style\.css|main\.js)(\?v=[0-9a-z]+)?"', rf'\1?v={version}"', html)
        if not n:
            sys.exit(f"Aucun lien style.css / main.js dans {page}")
        path.write_text(html, encoding="utf-8")
    print(f"Version des fichiers : {version}")
    return version


def page_parts(home, prefix):
    """Sprite d'icônes, navigation et pied de page de l'accueil, liens adaptés à une page plus bas."""
    sprite = re.search(r"  <!-- Sprite d'icônes.*?</svg>\n", home, re.S).group(0)
    nav = re.search(r'  <a class="skip".*?</div>\n\n  <main id="main">', home, re.S).group(0)
    nav = re.sub(r"  <!-- Écran d'intro -->.*?\n  </div>\n\n", "", nav, count=1, flags=re.S)
    nav = nav.replace('\n\n  <main id="main">', "\n")
    footer = re.search(r'  <footer class="footer">.*?</footer>\n', home, re.S).group(0)

    def fix(block):
        block = block.replace('href="#top" class="footer__top"', 'href="#main" class="footer__top"')
        block = block.replace('href="#top"', f'href="{prefix}"')
        block = re.sub(r'href="#(' + "|".join(SECTIONS) + r')"', rf'href="{prefix}#\1"', block)
        return re.sub(r'(href|src)="(assets/|staff/|liens/|en/|mentions-legales/|cgu/)', rf'\1="{prefix}\2', block)

    return sprite, fix(nav), fix(footer)


def read_article(slug):
    raw = (ROOT / "tools" / "articles" / f"{slug}.html").read_text(encoding="utf-8")
    meta = json.loads(re.match(r"<!--(.*?)-->", raw, re.S).group(1))
    body = raw.split("-->", 1)[1].strip()
    return meta, body


def typo(text):
    """Espace insécable avant : ; ? ! (typographie française)."""
    return re.sub(r" ([:;?!])", r"&nbsp;\1", text)


MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def fr_date(iso):
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{'1er' if d == 1 else d} {MONTHS[m - 1]} {y}"


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def with_toc(body):
    """Ajoute un identifiant à chaque intertitre et renvoie le sommaire correspondant."""
    entries, seen = [], set()

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
    items = "\n".join(f'              <li><a href="#{a}">{typo(label)}</a></li>' for a, label in entries)
    toc = f"""          <nav class="toc js-toc" aria-label="Sommaire" data-reveal>
            <p class="toc__title">Dans cet article</p>
            <ol class="toc__list">
{items}
            </ol>
          </nav>"""
    return body, toc


def og_image(name):
    """Image d'aperçu propre à la page (générée par tools/og.js), sinon celle du site."""
    own = ROOT / "assets" / "img" / "og" / f"{name}.jpg"
    return f"{SITE}assets/img/og/{name}.jpg" if own.exists() else f"{SITE}assets/img/og.jpg"


def doc_head(title, description, url, version, prefix, og_type="website", ld=None, image=None, noindex=False):
    """En-tête commun aux pages générées (page des conseils et articles)."""
    ld = f"\n  {ld_block(ld)}" if ld else ""
    image = image or f"{SITE}assets/img/og.jpg"
    robots = '\n  <meta name="robots" content="noindex, follow">' if noindex else ""
    return f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} — Mvrius</title>
  <meta name="description" content="{description}">
  <meta name="theme-color" content="#07080c">{robots}
  <link rel="canonical" href="{url}">

  <meta property="og:type" content="{og_type}">
  <meta property="og:locale" content="fr_FR">
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
  <link rel="stylesheet" href="{prefix}assets/css/style.css?v={version}">

  <script>
    (function (d) {{
      d.classList.add('js');
      // Animations affichées pour tous, même si l'appareil demande à les réduire
      // (pour les couper : ajouter la classe « reduced » à <html>)
      // Filet de sécurité : si le JS principal ne démarre pas, on affiche tout le contenu.
      setTimeout(function () {{ if (!window.MV) d.classList.remove('js'); }}, 4000);
    }})(document.documentElement);
  </script>
  <script src="{prefix}assets/js/main.js?v={version}" defer></script>{ld}
</head>
"""


def layout(home, prefix, current):
    """Sprite, navigation et pied de page pour une page des conseils (lien « Conseils » vers la liste)."""
    sprite, nav, footer = page_parts(home, prefix)
    sprite = sprite.replace("    </defs>\n", ARTICLE_ICONS + "    </defs>\n", 1)
    listing = "./" if current else f"{prefix}conseils/"
    nav = nav.replace(f'href="{prefix}#conseils"', f'href="{listing}"')
    footer = footer.replace(f'href="{prefix}#conseils"', f'href="{listing}"')
    if current:
        nav = nav.replace(f'<a href="{listing}" data-text="Conseils">', f'<a href="{listing}" data-text="Conseils" aria-current="page">')
        nav = re.sub(r'<a href="\./"><small>(\d+)</small>Conseils', r'<a href="./" aria-current="page"><small>\1</small>Conseils', nav)
    if sprite.count(ARTICLE_ICONS) != 1 or nav.count(f'href="{listing}"') != 2:
        sys.exit("Conseils : sprite ou lien « Conseils » introuvable dans la navigation")
    return sprite, nav, footer


def tip_card(slug, meta, num, href):
    return f"""          <a class="tip-card spotlight" href="{href}" data-reveal data-cursor="Lire">
            <span class="tip-card__top"><span class="tip-card__icon"><svg class="ico"><use href="#{meta["icon"]}"/></svg></span><span class="tip-card__num">{num:02d}</span></span>
            <span class="tip-card__tag">{meta["tag"]} · {meta["read"]} de lecture</span>
            <span class="tip-card__title">{typo(meta["title"])}</span>
            <span class="tip-card__excerpt">{typo(meta["excerpt"])}</span>
            <span class="tip-card__more">Lire l'article <svg class="ico"><use href="#i-arrow-right"/></svg></span>
          </a>"""


def build_listing(home, data, version):
    sprite, nav, footer = layout(home, "../", current=True)
    cards = "\n".join(tip_card(slug, meta, i, f"{slug}/") for i, (slug, (meta, _)) in enumerate(data.items(), 1))
    page = doc_head("Conseils pour votre serveur Discord",
                    "Mes conseils pour structurer, animer et faire grandir un serveur Discord : accueil, salons, modération, événements, bots et créateurs de contenu.",
                    f"{SITE}conseils/", version, "../") + f"""<body>
  <!-- Page générée par tools/build.py à partir de tools/articles/ : modifier les textes là-bas -->
{sprite}{nav}
  <main id="main">
    <section class="page-hero page-hero--tips">
      <div class="hero__bg" aria-hidden="true">
        <div class="aurora"><span></span><span></span><span></span></div>
        <div class="gridlines"></div>
      </div>
      <div class="container page-hero__inner">
        <p class="eyebrow" data-reveal>Conseils</p>
        <h1 class="page-hero__title" data-split>Mes conseils pour votre <em>serveur</em>.</h1>
        <p class="section__lead" data-reveal>Des astuces concrètes, tirées de mon expérience, pour structurer, animer et faire grandir votre communauté Discord.</p>
      </div>
    </section>

    <section class="section tips tips--all">
      <div class="container">
        <div class="tips__grid" data-stagger>
{cards}
        </div>
        <aside class="article__cta" data-reveal>
          <p class="article__cta-title">Et votre serveur, où en est-il&nbsp;?</p>
          <p>Faites le diagnostic express en une minute, ou parlez-moi directement de votre projet.</p>
          <div class="article__cta-actions">
            <a class="btn btn--primary magnetic" href="../#diagnostic"><span>Faire le diagnostic</span><svg class="ico"><use href="#i-arrow-right"/></svg></a>
            <a class="btn btn--ghost magnetic" href="../#contact"><span>Demander un devis</span></a>
          </div>
        </aside>
      </div>
    </section>
  </main>

{footer}</body>
</html>
"""
    (ROOT / "conseils" / "index.html").write_text(page, encoding="utf-8")


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
    colors = ["var(--online)", "#f0b232", "#ff6b6b"]
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
            <a class="btn btn--primary magnetic" href="../../#diagnostic"><span>Faire le diagnostic</span><svg class="ico"><use href="#i-arrow-right"/></svg></a>
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
    home = SRC.read_text(encoding="utf-8")
    sprite, nav, footer = layout(home, "../../", current=False)
    data = {slug: read_article(slug) for slug in ARTICLES}
    build_listing(home, data, version)
    for i, (slug, (meta, body)) in enumerate(data.items()):
        url = f"{SITE}conseils/{slug}/"
        image = og_image(slug)
        body, toc = with_toc(body)
        article_ld = {
            "@context": "https://schema.org", "@type": "Article",
            "headline": meta["title"], "description": meta["description"], "inLanguage": "fr",
            "datePublished": meta["date"], "dateModified": meta["date"],
            "image": image, "mainEntityOfPage": url,
            "author": {"@type": "Person", "name": "Mvrius", "url": SITE},
            "publisher": {"@type": "Person", "name": "Mvrius", "url": SITE},
        }
        # « À lire aussi » : les deux articles suivants (en boucle)
        nexts = [ARTICLES[(i + k) % len(ARTICLES)] for k in (1, 2)]
        others = "\n".join(f"""          <a class="more-card spotlight" href="../{other}/" data-reveal data-cursor="Lire">
            <span class="tip-card__tag">{data[other][0]["tag"]} · {data[other][0]["read"]} de lecture</span>
            <span class="more-card__title">{typo(data[other][0]["title"])}</span>
            <span class="tip-card__more">Lire l'article <svg class="ico"><use href="#i-arrow-right"/></svg></span>
          </a>""" for other in nexts)
        tweet = "https://twitter.com/intent/tweet?" + urllib.parse.urlencode({"text": meta["title"], "url": url})
        page = doc_head(meta["title"], meta["description"], url, version, "../../", "article", article_ld, image) + f"""<body class="page-article">
  <!-- Page générée par tools/build.py à partir de tools/articles/{slug}.html : modifier le texte là-bas -->
{sprite}{nav}
  <main id="main">
    <article class="article">
      <header class="article__hero">
        <div class="hero__bg" aria-hidden="true">
          <div class="aurora"><span></span><span></span><span></span></div>
          <div class="gridlines"></div>
        </div>
        <div class="container article__head">
          <a class="article__back" href="../"><svg class="ico" aria-hidden="true"><use href="#i-arrow-right"/></svg>Tous les conseils</a>
          <p class="eyebrow" data-reveal>{meta["tag"]}</p>
          <h1 class="article__title" data-split>{typo(meta["title"])}</h1>
          <p class="article__meta" data-reveal>
            <span class="avatar-status"><span class="avatar avatar--sm"><span class="avatar__fallback">M</span><img src="../../assets/img/profile-sm.jpg" alt="" width="36" height="36" onerror="this.remove()"></span><span class="status js-status" hidden></span></span>
            <span>Par <b>Mvrius</b> · <time datetime="{meta["date"]}">{fr_date(meta["date"]).replace(" ", "&nbsp;")}</time> · {meta["read"].replace(" ", "&nbsp;")}&nbsp;de&nbsp;lecture</span>
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
          <p class="share__label">Cet article peut aider quelqu'un&nbsp;? Partagez-le.</p>
          <div class="share__actions">
            <button class="share__btn js-share" type="button" data-title="{meta["title"]}" data-url="{url}" hidden><svg class="ico" aria-hidden="true"><use href="#i-share"/></svg><span>Partager</span></button>
            <button class="share__btn js-share-copy" type="button" data-url="{url}"><svg class="ico" aria-hidden="true"><use href="#i-link"/></svg><span class="js-share-label">Copier le lien</span></button>
            <a class="share__btn" href="{tweet.replace("&", "&amp;")}" target="_blank" rel="noopener"><svg class="ico ico--fill" aria-hidden="true"><use href="#b-x"/></svg><span>Partager sur X</span></a>
          </div>
        </div>

        <aside class="article__cta" data-reveal>
          <p class="article__cta-title">Besoin d'un coup de main pour votre serveur&nbsp;?</p>
          <p>Je m'occupe de la structure, de la modération et de l'animation de votre communauté.</p>
          <div class="article__cta-actions">
            <a class="btn btn--primary magnetic" href="../../#contact"><span>Demander un devis</span><svg class="ico"><use href="#i-arrow-right"/></svg></a>
            <a class="btn btn--ghost magnetic" href="../../#diagnostic"><span>Faire le diagnostic</span></a>
          </div>
        </aside>

        <nav class="article__more" aria-label="Autres conseils">
          <p class="eyebrow">À lire aussi</p>
          <div class="more-grid" data-stagger>
{others}
          </div>
          <a class="article__all" href="../">Voir tous les conseils <svg class="ico" aria-hidden="true"><use href="#i-arrow-right"/></svg></a>
        </nav>
      </div>
    </article>
  </main>

{footer}</body>
</html>
"""
        out = ROOT / "conseils" / slug / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page, encoding="utf-8")
    print(f"Conseils : page de liste + {len(data)} articles")
    return data


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


def build_sitemap(data):
    """sitemap.xml (pages publiques) et robots.txt."""
    last = max(meta["date"] for meta, _ in data.values())
    alt = (f'\n    <xhtml:link rel="alternate" hreflang="fr" href="{SITE}"/>'
           f'\n    <xhtml:link rel="alternate" hreflang="en" href="{SITE}en/"/>'
           f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}"/>')
    urls = [(SITE, None, alt), (f"{SITE}en/", None, alt), (f"{SITE}conseils/", last, "")]
    urls += [(f"{SITE}conseils/{slug}/", meta["date"], "") for slug, (meta, _) in data.items()]
    urls += [(f"{SITE}staff/", None, ""), (f"{SITE}liens/", None, "")]
    urls += [(f"{SITE}{slug}/", None, "") for slug in PAGES]
    rows = "\n".join(f"  <url>\n    <loc>{loc}</loc>" + (f"\n    <lastmod>{mod}</lastmod>" if mod else "") + f"{extra}\n  </url>"
                     for loc, mod, extra in urls)
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        f"{rows}\n</urlset>\n", encoding="utf-8")
    (ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}sitemap.xml\n", encoding="utf-8")
    print(f"Sitemap : {len(urls)} pages")


def sync_staff_page():
    home = SRC.read_text(encoding="utf-8")
    _, nav, footer = page_parts(home, "../")
    nav = nav.replace('aria-label="Mvrius, retour en haut"', 'aria-label="Mvrius, retour à l\'accueil"')
    nav = nav.replace('<a href="../staff/" data-text="Rejoindre l\'équipe">', '<a href="./" data-text="Rejoindre l\'équipe" aria-current="page">')
    nav = re.sub(r'<a href="\.\./staff/"><small>(\d+)</small>', r'<a href="./" aria-current="page"><small>\1</small>', nav)
    footer = footer.replace('href="../staff/"', 'href="./"')
    path = ROOT / "staff" / "index.html"
    page = path.read_text(encoding="utf-8")
    page, n1 = re.subn(r'  <a class="skip".*?(?=\n  <main id="main">)', lambda m: nav.rstrip("\n"), page, count=1, flags=re.S)
    page, n2 = re.subn(r'  <footer class="footer">.*?</footer>\n', lambda m: footer, page, count=1, flags=re.S)
    if n1 != 1 or n2 != 1:
        sys.exit("Page équipe : navigation ou pied de page introuvable")
    path.write_text(page, encoding="utf-8")


def main():
    sync_staff_page()
    version = stamp()
    build_sitemap(build_articles(version))
    build_diag_pages(version)
    build_legal_pages(version)
    html = SRC.read_text(encoding="utf-8")

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

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"OK : {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
