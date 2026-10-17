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
conseils/<article>/      → articles « Conseils », générés depuis tools/articles/ (modifier le texte là-bas)
404.html                → page « introuvable »
site.webmanifest        → nom et icônes quand le site est ajouté à l'écran d'accueil
assets/css/style.css    → styles et animations
assets/js/main.js       → interactions (intro, maquette Discord, carrousel, FAQ, formulaire…)
assets/fonts/           → polices auto-hébergées (Bricolage Grotesque, Inter, Instrument Serif)
assets/img/             → photo de profil, logos et visuels des projets, image d'aperçu (og.jpg)
```

## Services externes

- **Compteurs Discord** : récupérés dans le navigateur via l'API publique des invitations
  (`discord.gg/france`, `arvenis`, `nicola`, `byilhan`). Si Discord ne répond pas,
  les valeurs écrites dans `index.html` restent affichées.
- **Formulaire de devis** : envoyé via [FormSubmit](https://formsubmit.co) vers
  `contact@mvriuus.fr`. La première demande déclenche un e-mail d'activation à valider.

## Avant chaque publication

```
python3 tools/build.py
```

Ce script ajoute un numéro de version aux liens vers `style.css` et `main.js` (les
navigateurs rechargent ainsi les fichiers modifiés), génère les articles « Conseils »
à partir de `tools/articles/` puis régénère la version anglaise.

## Version anglaise

`en/index.html` est générée à partir de `index.html` :

```
python3 tools/build.py
```

Le script contient la table de traduction. Si un texte français a changé, il s'arrête
et indique la phrase à retraduire. Les valeurs envoyées par le formulaire restent en
français pour que les e-mails reçus soient identiques dans les deux langues.
