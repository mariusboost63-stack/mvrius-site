# mvriuus.fr

Site vitrine de **Mvrius** — Community Manager Discord & réseaux sociaux.

Site statique (HTML / CSS / JS, sans dépendance) hébergé sur **GitHub Pages**,
avec le domaine `mvriuus.fr` (fichier `CNAME`).
Chaque modification poussée sur la branche `main` est publiée automatiquement.

## Structure

```
index.html              → toutes les sections du site
404.html                → page « introuvable »
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
