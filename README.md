# mvriuus.fr

Site vitrine de **Mvrius** — Community Manager Discord & réseaux sociaux.

Site statique (HTML / CSS / JS, sans dépendance) hébergé sur **GitHub Pages**,
avec le domaine `mvriuus.fr` (fichier `CNAME`).
Chaque modification poussée sur la branche `main` est publiée automatiquement.

## Structure

```
index.html              → toutes les sections du site (français)
en/index.html           → version anglaise, générée par tools/build.py
staff/index.html        → page « Rejoindre l'équipe » (candidatures, en français)
liens/index.html        → page « Liens » à mettre dans les bios des réseaux sociaux
conseils/                → liste et articles « Conseils », générés depuis tools/articles/ (modifier le texte là-bas)
sitemap.xml, robots.txt  → pour Google, générés par tools/build.py
diagnostic/<score>/      → pages d'arrivée des scores partagés du diagnostic, générées par tools/build.py
agenda/                  → agenda privé (connexion Discord, voir « Agenda privé » plus bas)
atelier/                 → atelier privé : construire des serveurs Discord avec le bot (voir plus bas)
espace/                  → espace client privé (un lien secret par client)
404.html                → page « introuvable »
site.webmanifest        → nom et icônes quand le site est ajouté à l'écran d'accueil
assets/css/style.css    → styles et animations
assets/js/main.js       → interactions (intro, maquette Discord, carrousel, FAQ, formulaire…)
assets/fonts/           → polices auto-hébergées (Bricolage Grotesque, Inter, Instrument Serif)
assets/img/             → photo de profil, logos et visuels des projets, image d'aperçu (og.jpg)
```

## Services externes

- **Compteurs Discord** : demandés à Discord depuis le navigateur du visiteur, via l'invitation
  publique de chaque ligne de la section Projets (attribut `data-invite`), une à la fois et
  gardés 10 min. Si Discord ne répond pas (limite d'appels, bloqueur, VPN…), le site utilise le
  relevé fait toutes les heures par GitHub Actions (`.github/workflows/discord-counts.yml` et
  `tools/discord_counts.py`), publié sur la branche `data` (`discord.json`). En dernier recours,
  la dernière valeur vue par le visiteur, ou celle écrite dans `index.html`, reste affichée.
  Le total sous l'accueil additionne toutes les communautés.
- **Formulaire de devis** : envoyé via [FormSubmit](https://formsubmit.co) vers
  `contact@mvriuus.fr`. La première demande déclenche un e-mail d'activation à valider.
- **Bots Arvenis** : l'article des bots affiche les photos et bannières hébergées par Discord,
  remises à jour depuis `api.arvenis.fr/profiles`. Si elles ne chargent pas, les logos de
  `assets/img/bots/` prennent le relais.

## Agenda privé (`/agenda/`)

Agenda personnel de Mvrius, non référencé (`noindex`, `robots.txt`). La page ne contient aucun
rendez-vous : ils sont dans le dépôt **privé** `agenda-donnees` (fichier `agenda.json`, un commit
par changement).

- **Connexion** : avec Discord, un seul compte accepté. Elle passe par un Cloudflare Worker
  (`tools/agenda-worker.js`) qui vérifie le compte, donne une session signée de 30 jours et lit
  ou écrit `agenda.json` avec sa propre clé GitHub. Ni la clé GitHub ni le secret Discord ne
  vont dans le navigateur.
- **Adresse du Worker** : `agenda/config.js` (`window.AGENDA_SERVEUR`). Elle doit finir par
  `.workers.dev`, sinon il faut l'ajouter à `connect-src` dans `agenda/index.html`.
- **Variables du Worker** (Cloudflare › Settings › Variables and Secrets) : `DISCORD_CLIENT_ID`,
  `DISCORD_CLIENT_SECRET` (secret), `DISCORD_ID_AUTORISE`, `GITHUB_TOKEN` (secret, jeton limité à
  `agenda-donnees` avec « Contents : Read and write »), `DISCORD_BOT_TOKEN` (secret, rappels). Changer l'un des secrets déconnecte tous
  les appareils.
- **Application Discord** : redirection OAuth2 `https://<worker>/retour`, scope `identify`.
- **Rappels en message privé** : le bot de l'application Discord (`DISCORD_BOT_TOKEN`, secret)
  écrit au compte autorisé. Il doit partager un serveur avec ce compte (invitation :
  `https://discord.com/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&scope=bot&permissions=0`).
  Cron Trigger du Worker : `*/5 * * * *`. Le moment du rappel est dans chaque fiche (`rappel`,
  en minutes avant le début ; absent = 15 min, ou 9:00 le jour même pour une journée entière ;
  `null` = aucun). Le résumé du matin se règle dans Réglages (`reglages.resume`). Le bouton
  « Envoyer un message test » des réglages vérifie tout de bout en bout.
- **Factures** : dans l'agenda (menu › Devis et factures). Une facture émise reçoit le numéro suivant
  (`F-2026-001`…, sans trou, calculé quand l'opération est appliquée) et une copie des
  informations du vendeur et du client ; elle ne se modifie plus (seulement payée, ou annulée par
  un avoir `AV-…`). Les informations du vendeur sont dans Réglages › Facturation
  (`reglages.facturation`). Le PDF est fabriqué dans le navigateur par `agenda/facture.js`
  (sans bibliothèque), partagé avec l'espace client.
- **Devis** : onglet « Devis » de la même fenêtre (liste `devis` d'`agenda.json`). Un devis émis
  reçoit le numéro suivant (`D-2026-001`…), une date de validité (30 jours par défaut) et la copie
  du vendeur et du client ; il ne se modifie plus : « Nouvelle version » en fait un brouillon, et
  l'ancien est retiré quand la nouvelle version est émise. Statuts : `brouillon`, `envoye`
  (affiché « Expiré » après la validité), `accepte`, `refuse`, `annule` (retiré). La réponse est
  dans `reponse` (`date`, `nom`, `par` : `espace` ou `manuel`, `motif`). Un devis accepté devient
  un brouillon de facture en un clic (`facture` dans le devis, `devis` dans la facture). Le PDF a
  un cadre « Bon pour accord », ou la mention de l'acceptation.
- Après un changement de `agenda/app.js`, `agenda/app.css` ou `agenda/facture.js`, augmenter `?v=`
  dans `agenda/index.html` (et dans `espace/index.html` et `atelier/index.html`, qui les utilisent aussi).

## Espace client (`/espace/#clé`)

Page publique mais sans contenu : tout vient du Worker (`GET /espace`, en-tête `Authorization: Cle …`),
qui ne renvoie que les rendez-vous, le projet (`projet`, `etapes`, `messageEspace`), les devis
émis (sauf ceux retirés) et les factures émises du client dont la fiche contient cette clé
(`espace.cle`, 32 caractères aléatoires). Le lien se crée, se change ou se désactive dans la fiche
client de l'agenda. La clé reste après le `#` : elle n'apparaît dans aucun journal de serveur.

Le client répond à un devis en attente avec `POST /espace/devis` (même en-tête ; `id`, `action` :
`accepter` avec `nom` et `accord: true`, ou `refuser` avec un `motif` facultatif). Le Worker vérifie
que le devis est à ce client, encore en attente et pas expiré, l'écrit dans `agenda.json`, puis
t'envoie un message privé Discord.

## Atelier de serveurs Discord (`/atelier/`)

Même connexion que l'agenda (le Worker renvoie vers `/atelier/` grâce à `/connexion?vers=atelier`).
Les modèles de serveur sont dans `atelier.json`, dans le même dépôt privé. Discord ne laisse plus
les bots créer un serveur : on crée le serveur vide dans Discord, on y invite le bot (lien
« Administrateur » donné par l'atelier), puis on applique un modèle. La page envoie une action à la
fois au Worker (`POST /atelier/action` : rôle, salon, réglages, message…) et attend quand Discord
répond 429. Les boutons de rôle (`custom_id` `role|<id>|a` ou `role|<id>|b`) passent par
`/interactions` et marchent pour tous les membres ; le Worker refuse de donner un rôle qui a des
permissions de modération.

**Modèles « Créateurs de contenu »** (`atelier/modeles-createurs.js`, chargé avant `atelier.js`) :
Streamer Twitch, YouTubeur, Créateur TikTok et réseaux, Podcast et émission, Artiste et illustrateur.
Chacun a une hiérarchie du staff sur 8 rangs, l'équipe de contenu et sa catégorie Production, des
rôles communautaires, 8 rôles de niveaux (1, 5, 10, 20, 30, 50, 75, 100 ; émojis externes au
niveau 5, messages vocaux au niveau 10, zone réservée dès le niveau 20), des rôles membres, de
profil, de notifications et de centres d'intérêt, des rôles séparateurs, environ 50 salons et 13
messages. Après un changement de ce fichier, augmenter son `?v=` dans `atelier/index.html`.

**Auditer un serveur** (outil de l'atelier) : la page lit le serveur (`GET /atelier/serveur`, qui
renvoie aussi le nombre de membres, l'A2F de modération et les règles AutoMod si le bot a « Gérer le
serveur ») et calcule dans le navigateur une note sur 100 : chaque point retire 20 (critique),
8 (important) ou 3 (conseil), et un point critique plafonne la note à 39. Aucun message n'est lu,
rien n'est modifié. Pour un prospect, l'atelier donne un lien d'invitation du bot sans aucune
permission. Les notes sont gardées dans `atelier.json` (`audits`, un par serveur et par demi-heure)
pour comparer avec l'audit précédent. Le rapport se copie (texte pour Discord ou un e-mail) ou
s'imprime en PDF.

Après un changement de `tools/agenda-worker.js`, recopier le fichier dans le Worker sur Cloudflare
(Edit code › Deploy) : sans ça, l'audit n'a pas le nombre de membres, l'A2F ni l'AutoMod, et les
clients ne voient pas leurs devis.

## Avant chaque publication

```
python3 tools/build.py
```

Ce script ajoute un numéro de version aux liens vers `style.css` et `main.js` (les
navigateurs rechargent ainsi les fichiers modifiés), génère les pages « Conseils »
à partir de `tools/articles/`, régénère la version anglaise, puis `sitemap.xml` et `robots.txt`.

Pour ajouter un article : créer `tools/articles/<nom>.html` (même en-tête que les autres :
titre, description, extrait, catégorie, durée, date, icône), ajouter `<nom>` en tête de la liste
`ARTICLES` dans `tools/build.py`, puis lancer le script.

Image d'aperçu de l'article (affichée quand il est partagé sur Discord, X…) :

```
node tools/og.js <nom>     # nécessite Playwright (npm i -D playwright)
python3 tools/build.py
```

Sans image propre, l'article utilise l'aperçu général du site (`assets/img/og.jpg`).

Les scores du diagnostic express ont aussi leur image d'aperçu (`node tools/og.js diagnostic`) :
quand un visiteur partage son score, le lien `mvriuus.fr/diagnostic/<score>/` affiche sa jauge et
son verdict. À relancer si les questions ou les verdicts du diagnostic changent.

## Version anglaise

`en/index.html` est générée à partir de `index.html` :

```
python3 tools/build.py
```

Le script contient la table de traduction. Si un texte français a changé, il s'arrête
et indique la phrase à retraduire. Les valeurs envoyées par le formulaire restent en
français pour que les e-mails reçus soient identiques dans les deux langues.
