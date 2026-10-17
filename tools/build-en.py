#!/usr/bin/env python3
"""Génère la version anglaise du site (en/index.html) à partir de index.html.

Usage : python3 tools/build-en.py

Chaque texte français de la table doit exister dans index.html : si une phrase
a été modifiée côté français, le script s'arrête et indique laquelle, pour que
la traduction soit mise à jour en même temps.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "index.html"
OUT = ROOT / "en" / "index.html"

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
    ('data-text="Réseaux"><span>Réseaux</span>', 'data-text="Socials"><span>Socials</span>', 1),
    ('<a class="lang" href="en/" hreflang="en" lang="en" aria-label="English version">EN</a>',
     '<a class="lang" href="../" hreflang="fr" lang="fr" aria-label="Version française">FR</a>', 1),
    ('aria-label="Ouvrir le menu"', 'aria-label="Open menu"', 1),
    ('aria-label="Menu mobile"', 'aria-label="Mobile menu"', 1),
    ('<small>02</small>Projets</a>', '<small>02</small>Projects</a>', 1),
    ('<small>03</small>Avis</a>', '<small>03</small>Reviews</a>', 1),
    ('<small>04</small>Réseaux</a>', '<small>04</small>Socials</a>', 1),
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
    ('data-cursor="Rejoindre"', 'data-cursor="Join"', 4),
    ('<span class="prow__desc">Communauté francophone</span>', '<span class="prow__desc">French-speaking community</span>', 1),
    ('<span class="prow__desc">Collectif de bots Discord</span>', '<span class="prow__desc">Discord bot collective</span>', 1),
    ('<span class="prow__desc">Communauté d\'influenceur</span>', '<span class="prow__desc">Influencer community</span>', 2),
    ('<b data-online></b> en ligne</span>', '<b data-online></b> online</span>', 4),
    ('<b data-members>9 208</b> membres</span>', '<b data-members>9,208</b> members</span>', 1),
    ('<b data-members></b> membres</span>', '<b data-members></b> members</span>', 3),
    ('<span class="prow__role">Gérant</span>', '<span class="prow__role">Manager</span>', 1),
    ('<span class="prow__role">Administrateur</span>', '<span class="prow__role">Administrator</span>', 2),
    ('Votre serveur pourrait être le <em>prochain</em>.', 'Your server could be <em>next</em>.', 1),

    # --- Avis ---
    ('<p class="eyebrow" data-reveal>Avis</p>', '<p class="eyebrow" data-reveal>Reviews</p>', 1),
    ('<h2 class="title" data-split>Ils m\'ont fait <em>confiance</em>.</h2>', '<h2 class="title" data-split>They <em>trusted</em> me.</h2>', 1),
    ('<span class="dchan__topic">Ce que mes clients disent de mon travail</span>', '<span class="dchan__topic">What my clients say about my work</span>', 1),
    ('<div class="dchan__input" aria-hidden="true">Envoyer un message dans #⭐ | avis</div>', '<div class="dchan__input" aria-hidden="true">Message #⭐ | avis</div>', 1),
    ('L\'action de Marius au sein du serveur a été bénéfique pour les membres et staffs. Sa restructuration professionnelle et complète a permis une meilleure inclusion des membres au sein du serveur. Sa mise en place efficace de recrutements Staff a également permis aux membres de profiter d\'une modération et animation de qualité et professionnelle. Ainsi, son action sur le serveur est qualitative et professionnelle&nbsp;! Merci à lui&nbsp;!',
     'Marius\'s work on the server has benefited both members and staff. His professional and complete restructuring led to better inclusion of members within the server. His efficient staff recruitment also gave members high-quality, professional moderation and activities. All in all, his work on the server is high-quality and professional! Thanks to him!', 1),
    ('Restructuration du serveur &amp; recrutements staff</p>', 'Server restructuring &amp; staff recruitment</p>', 1),
    ('Marius effectue un travail complet et sérieux. Toujours disponible et investi dans la tâche qui lui est confiée. Je travaille avec lui depuis plusieurs mois et pour l\'instant je n\'ai pas eu de retour négatif à lui transmettre. Il sait faire preuve de rigueur et de discipline dans le travail que nous avons pu effectuer en commun. Il a une très bonne aisance sur Discord, l\'utilisation de l\'application ainsi que l\'ensemble des fonctionnalités de celle-ci, et apporte un réel plus à l\'équipe.',
     'Marius does thorough and serious work. Always available and committed to the tasks he is given. I have been working with him for several months and so far I have had no negative feedback to pass on. He shows rigor and discipline in the work we have done together. He is very comfortable with Discord, both the app and all of its features, and brings real added value to the team.', 1),
    ('Influenceur · serveur Discord Byilhan</p>', 'Influencer · Byilhan Discord server</p>', 1),
    ('Marius a été rapide, efficace et à l\'écoute pour la création de mon serveur communautaire. Il a su proposer des solutions adaptées et livrer un travail pro et bien structuré. Je recommande sans hésitation&nbsp;!',
     'Marius was quick, efficient and attentive when creating my community server. He suggested tailored solutions and delivered professional, well-structured work. I highly recommend him!', 1),
    ('Création d\'un serveur communautaire</p>', 'Community server creation</p>', 1),

    # --- Réseaux ---
    ('<p class="eyebrow" data-reveal>Réseaux</p>', '<p class="eyebrow" data-reveal>Socials</p>', 1),
    ('<h2 class="title" data-split>Retrouvez-moi <em>partout</em>.</h2>', '<h2 class="title" data-split>Find me <em>everywhere</em>.</h2>', 1),
    ('Suivez mon actualité ou écrivez-moi directement sur la plateforme de votre choix.',
     'Follow my updates or message me directly on the platform of your choice.', 1),
    ('<span class="social__name">E-mail</span>', '<span class="social__name">Email</span>', 1),

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

    # --- Pied de page ---
    ('aria-label="Navigation du pied de page"', 'aria-label="Footer navigation"', 1),
    ('<a href="#projets">Projets</a>', '<a href="#projets">Projects</a>', 1),
    ('<a href="#avis">Avis</a>', '<a href="#avis">Reviews</a>', 1),
    ('<a href="staff/">Rejoindre mon staff</a>', '<a href="../staff/" hreflang="fr">Join my staff (FR)</a>', 1),
    ('Retour en haut <svg', 'Back to top <svg', 1),
    ('Mvrius. Tous droits réservés.', 'Mvrius. All rights reserved.', 1),
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


def main():
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
    html, n = re.subn(r'(<div class="dchan js-dchan".*?<div class="dchan__input"[^>]*>.*?</div>\s*</div>)', r'\1\n        <p class="t-note">Reviews translated from French.</p>', html, count=1, flags=re.S)
    if n != 1:
        sys.exit("Salon d'avis introuvable")

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"OK : {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
