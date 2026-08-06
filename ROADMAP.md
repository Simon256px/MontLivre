# 🗺️ Roadmap — MontLivre 2

**Le cap : un lecteur qu'on ouvre sans y penser.** Trois choses, faites bien —
ranger sa bibliothèque, lire, régler le confort. Tout le reste doit mériter sa
place, en fonctionnalité comme en mégaoctets.

Deux principes tiennent le projet :

> **Hors ligne par défaut.** Aucun compte, aucun envoi. Ce qui exigerait le
> réseau sera optionnel et signalé comme tel.
>
> **La légèreté est une fonctionnalité.** Le poids se mesure à chaque jalon.
> Pour référence : la v1 Electron pesait 122 Mo.

## Où on en est

- [x] **v2.0 — le socle.** Table rase de la v1, coque Tauri 2, lecture confiée à
      foliate-js, identité visuelle brutaliste, bibliothèque, réglages.
- [x] **v2.2 — annoter.** Surlignage quatre couleurs, favoris, écran dédié
      rassemblant tous les passages, notes de bas de page en infobulle. Restent
      les notes écrites et l'export Markdown.
- [x] **v2.3 — se mettre à jour seule.** Versions signées, manifeste publié avec
      la release, installation sans quitter l'application.
- [ ] **v2.4 — savoir où on en est.** Temps de lecture, objectif quotidien,
      streak, vitesse moyenne.
- [ ] **v2.5 — sortir de Windows.** macOS et Linux, que Tauri rend accessibles
      sans réécriture.

## 📚 Lecture

- [x] EPUB, MOBI, AZW3, FB2, CBZ par foliate-js
- [x] PDF en page fixe (rendu pdf.js, expérimental côté foliate)
- [x] Pagination en colonnes, sommaire interactif, reprise exacte par CFI
- [x] Mode immersif : le chrome s'efface pendant la lecture
- [x] Une page ou deux, au choix
- [x] Notes de bas de page en infobulle, au survol comme au clic
- [x] Clic sur les bords pour tourner, molette bridée
- [ ] Défilement continu (attribut `flow="scrolled"`, à exposer dans les réglages)
- [ ] Recherche plein texte dans le livre (`search.js` est déjà là)
- [ ] **Le reflow des PDF.** Perdu avec la v1. Ne reviendra que si une solution
      existe qui ne demande pas de remaintenir un moteur maison.

## 🎨 Personnalisation

- [x] 4 thèmes : Papier, Lin, Nuit, Contraste
- [x] 4 accents : Yolk, Ochre, Violet, Moss — un seul actif à la fois
- [x] Police, taille, interligne, largeur de colonne, marges
- [ ] Import de polices personnalisées
- [ ] Thème sur mesure (fond, page, texte)

## 📱 Bibliothèque

- [x] Import par bouton et par glisser-déposer, fichiers copiés dans le profil
- [x] Couverture extraite, ou affiche engendrée à partir du titre
- [x] Progression par livre, recherche titre/auteur, retrait
- [ ] Tri (récent, titre, auteur, avancement)
- [ ] Étagères automatiques : à lire / en cours / terminés
- [ ] Tags et favoris
- [ ] Recherche plein texte dans toute la bibliothèque

## ✍️ Annotations

- [x] Surlignage quatre couleurs (les accents de la palette)
- [x] Favoris, remontés en tête de l'écran Annotations
- [x] Écran dédié rassemblant les passages de toute la bibliothèque
- [ ] Notes écrites attachées à un passage
- [ ] Signets
- [ ] Export Markdown, regroupé par chapitre
- [ ] Recherche dans les annotations

## 📊 Statistiques — v2.4

- [ ] Temps de lecture par livre et par jour
- [ ] Objectif quotidien
- [ ] Streak
- [ ] Vitesse moyenne

## 💻 Plateformes

- [x] Windows (NSIS)
- [x] Mise à jour intégrée, signée et vérifiée
- [x] Association des fichiers `.epub` et consorts
- [ ] macOS
- [ ] Linux (AppImage / Flatpak)
- [ ] Android et iOS, que Tauri 2 rend envisageables

## 🎧 Accessibilité

- [x] Thème à contraste élevé, navigation clavier, focus visible partout
- [ ] Police OpenDyslexic
- [ ] Compatibilité lecteurs d'écran
- [ ] Lecture vocale — retirée en v0.4 faute de voix françaises correctes ;
      à reconsidérer avec des voix neurales locales

## 🧊 Écarté pour l'instant

OCR des PDF scannés (30 Mo de modèles Tesseract), RSVP, mode focus, bionic
reading, dessin au stylet, succès, Pomodoro, dictionnaire, lecture parallèle.
Rien n'interdit qu'une de ces fonctions revienne, mais chacune devra justifier
son poids.
