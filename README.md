<h1 align="center">MontLivre</h1>

<p align="center"><strong>Un lecteur élégant qui transforme vos PDF et EPUB en véritable expérience de lecture.</strong></p>

MontLivre est une application de bureau (Electron) qui prend vos PDF et EPUB et les re-met en page comme un vrai livre : texture papier, typographie soignée, modes lumière, Bionic Reading. 100 % offline, aucun compte, aucune donnée envoyée.

> 📥 **[Télécharger la dernière version](https://github.com/Simon256px/MontLivre/releases/latest)** — ensuite, les mises à jour se font depuis l'app (Options → Mise à jour).
>
> 🗺️ La liste complète des fonctionnalités envisagées et leur avancement : [ROADMAP.md](ROADMAP.md)

## ✨ Fonctionnalités

### Lecture
- **Reflow intelligent** : extraction du texte (pdf.js), suppression des en-têtes/pieds de page répétés, paragraphes et césures recollés, chapitres détectés
- **PDF et EPUB** avec le même moteur de rendu, images incluses
- **Notes de bas de page en infobulle** : cliquez l'appel de note, la note apparaît sans quitter la page
- **Lecture parallèle** ⿻ : un second livre s'ouvre dans un volet à côté du principal (œuvre + analyse, VO + traduction), avec sa propre position mémorisée
- **OCR des PDF scannés** : reconnaissance de texte hors ligne (Tesseract WASM, modèles français + anglais embarqués), proposée automatiquement quand un PDF n'a pas de texte
- **Pagination façon livre** : simple ou double page (auto selon la fenêtre), ou défilement continu
- **Sommaire interactif**, recherche plein texte (Ctrl+F, insensible aux accents), plein écran immersif (F11)
- **6 ambiances de lecture** : ivoire, lin, sauge, ambre (sans lumière bleue), minuit et contraste élevé
- **Textures indépendantes** : page lisse, papier doux ou fibres naturelles, avec intensité réglable
- **Typographie fine** : 7 polices dont Literata, Atkinson Hyperlegible et OpenDyslexic ; taille, interligne, largeur, justification

### Vitesse & confort
- **Bionic reading** à intensité réglable
- **Modes focus** : règle de lecture qui suit la souris, ou paragraphe par paragraphe (le reste s'estompe, ↑/↓ pour avancer)
- **Mode RSVP** : lecture rapide mot à mot avec point de fixation, 150–700 mots/min. En pause, un aperçu lisible du passage (mot courant surligné, repères de chapitres) permet de choisir d'un clic où reprendre
- **Dictionnaire** au double-clic sur un mot (Wiktionnaire — en ligne, opt-in)

### Fichiers lourds
- **Chargement interruptible** : barre de progression et bouton pour annuler un gros PDF/EPUB
- **Reprise fiable** : la position est sauvegardée à la fermeture et un bouton « Reprendre » ramène exactement où tu t'étais arrêté

### Annotations
- **Surlignage 4 couleurs** (sélectionner du texte → palette flottante), notes attachées, signets
- **Surlignage instantané** 🖍 : sélectionner suffit, la dernière couleur s'applique d'un geste
- **Dessin au stylet** : croquis directement sur la page (pression gérée), galerie dans le panneau Notes
- **Recherche** dans les notes ; **export Markdown et PDF**, regroupés par chapitre

### Personnalisation & accessibilité
- **Page Options plein écran** façon menu de jeu, avec remise à zéro (stats, réglages, tout)
- **Mise en page d'auteur** : chapitres sur nouvelle page, titres ornés, lettrines
- 6 ambiances accessibles plus un **thème sur mesure** (fond/page/texte), avec contrôle et correction de contraste
- **Import de polices** personnalisées (.ttf/.otf/.woff), 8 polices embarquées dont Manrope
- Marges réglables, **animations de page** (glissement / page tournée / aucune), **sons de tournage**
- Police OpenDyslexic, navigation clavier
- **Succès à débloquer** 🏆 (livres, mots, heures, streaks…)
- **Mise à jour intégrée** : bouton « Vérifier les mises à jour » dans Options (bibliothèque et réglages conservés)

### Bibliothèque & statistiques
- Couvertures extraites automatiquement, progression, recherche par titre/auteur/tag
- **Étagères** automatiques (À lire / En cours / Terminés), **favoris** ★ et **tags** éditables
- **Import/export de la bibliothèque** en JSON (sauvegarde et migration)
- **Reprise exacte** de la lecture, ancrée au paragraphe (survit aux changements de mise en page)
- **Objectif quotidien** (anneau de progression) et **minuteur Pomodoro** lecture/pause
- **Stats quotidiennes** : temps de lecture, streak 🔥, vitesse moyenne, graphique 14 jours

## 🚀 Utilisation

```bash
npm install
npm start
```

Vérifier rapidement le projet (syntaxe, ressources, identifiants HTML et contrastes) :

```bash
npm test
```

Ajoutez des livres par le bouton **＋ Ajouter**, par glisser-déposer, ou en ligne de commande :

```bash
npx electron . chemin/vers/livre.pdf
```

### Raccourcis du lecteur

| Touche | Action |
|---|---|
| `←` `→` / espace / molette | tourner les pages |
| double-clic sur un mot | définition (dictionnaire) |
| `Ctrl+F` | rechercher dans le livre |
| `F11` | plein écran |
| `Échap` | fermer (dictionnaire → recherche → panneaux → lecteur) |

## 🛠️ Stack technique

- [Electron](https://www.electronjs.org/) — application de bureau multiplateforme
- [pdf.js](https://mozilla.github.io/pdf.js/) — parsing et extraction de texte des PDF
- [JSZip](https://stuk.github.io/jszip/) — lecture des EPUB
- HTML/CSS/JS sans framework ni bundler

### Hooks de test

Variables d'environnement pour les tests automatisés :

- `LIVRE_USERDATA=dossier` — isole le profil (store + cache)
- `LIVRE_EVAL=script.js` — exécute un script dans le renderer et logge son résultat
- `LIVRE_SHOT=capture.png` (+ `LIVRE_SHOT_DELAY=ms`) — capture l'écran puis quitte

## 📄 Licence

MIT
