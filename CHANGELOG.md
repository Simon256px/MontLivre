# Journal des versions

## 2.0.0 — non publiée

Réécriture complète. La v1 Electron est archivée sur la branche
[`v1`](../../tree/v1) ; ses installeurs restent dans les
[releases](../../releases).

### Changé

- **Coque : Electron → Tauri 2.** L'application s'appuie sur le WebView2 déjà
  présent sur Windows au lieu d'embarquer un Chromium complet.
- **Moteur de lecture : maison → [foliate-js](https://github.com/johnfactotum/foliate-js).**
  Les 498 lignes de remise en page PDF écrites à la main disparaissent au profit
  d'une bibliothèque éprouvée.
- **Chaîne de build : Node → Rust seul.** Plus de npm, plus de bundler, plus de
  `package.json`. Tauri sert `src/` tel quel et `withGlobalTauri` expose l'API.
- Le front ne reçoit plus aucune permission `fs` : il manipule des identifiants,
  et `src-tauri/src/store.rs` les traduit en chemins.
- Interface entièrement redessinée — affiche typographique suisse pour le
  chrome, formes Y2K, palette Yolk / Ochre / Violet / Moss sur Coal / Ash /
  Cloud. La page de lecture, elle, reste du texte noir sur du papier.

### Ajouté

- Formats MOBI, AZW3, FB2 et CBZ, en plus d'EPUB et PDF.
- Couvertures engendrées : un livre sans couverture reçoit une affiche dont la
  couleur, la forme et l'inclinaison sont tirées d'un hachage de son titre.
- Reprise de lecture par CFI : elle survit à un changement de taille de texte.
- Association des fichiers `.epub`, `.mobi`, `.azw3`, `.azw`, `.fb2`, `.cbz` et
  `.pdf`, avec instance unique.
- Mode immersif : le chrome s'efface pendant la lecture.

### Retiré

- **La remise en page des PDF.** foliate-js rend les PDF en pages fixes. C'était
  l'argument principal de la v1 ; c'est le prix de l'abandon du moteur maison.
- OCR des PDF scannés (30 Mo de modèles Tesseract), RSVP, mode focus, bionic
  reading, dessin au stylet, succès, Pomodoro, dictionnaire, lecture parallèle.
- Annotations et statistiques — attendues en 2.1 et 2.2.
- Les positions de lecture de la v1, indexées à la page et non migrables vers
  les CFI.

### Poids

| | v1.1.0 | 2.0.0 |
|---|---|---|
| Code du projet | 6 926 lignes | 2 530 lignes |
| Ressources embarquées | ~90 Mo | 6,0 Mo |
| Installeur | 122 Mo | à mesurer |

Sur les 6,0 Mo embarqués, 5,1 sont pdf.js — chargé dynamiquement, seulement à
l'ouverture d'un PDF.

### À savoir avant de publier

La coque Rust n'a jamais été compilée : la machine de développement n'a ni Rust
ni les Build Tools C++. Le front est vérifié dans un navigateur, le Rust ne l'est
pas. Cette version ne doit pas être publiée avant un `cargo tauri build` réussi
et un essai réel.
