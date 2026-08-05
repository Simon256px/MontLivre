# Journal des versions

## 2.1.0

### Corrigé

- **Tourner la page était impossible** dès qu'on avait cliqué dans le texte —
  ni à la molette, ni au clavier. foliate-js ne branche aucune entrée de
  navigation : c'est au programme hôte de le faire, et les gestionnaires
  vivaient sur le document parent alors que le livre est rendu dans une iframe,
  dont les événements ne sortent pas. Ils sont désormais rebranchés sur chaque
  section chargée.
- **L'icône de l'application** restait l'ancienne malgré le nouveau logo :
  `build.rs` ne déclarait pas le dossier d'icônes, donc cargo ne le relançait
  jamais et l'exécutable gardait la ressource précédente.

### Ajouté

- **Notes de bas de page en infobulle**, au survol comme au clic. Reconnaît les
  appels déclarés en EPUB 3 et les simples exposants.
- **Annotations** : sélectionner un passage fait apparaître une palette des
  quatre accents ; la surbrillance se clique pour ouvrir un menu — couleurs,
  Copier, Épingler, Supprimer.
- **Épinglage** : les passages épinglés remontent en tête du panneau des
  annotations, dans une section à part. Un clic y ramène.
- **Clic sur les bords** pour tourner la page, comme sur une liseuse, et une
  bride sur la molette — un geste de pavé tactile ne fait plus défiler vingt
  pages d'un coup.

### À savoir

Surligner deux fois le même passage n'en crée pas deux : foliate n'indexe ses
surbrillances que par CFI, et deux annotations sur un même passage ne peuvent
pas coexister. Re-surligner change la couleur.

## 2.0.0

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
| Installeur | 122 Mo | **3,54 Mo** |
| Exécutable | — | 5,56 Mo |
| Mémoire au repos | ~180 Mo | 28 Mo |
| Code du projet | 6 926 lignes | 2 530 lignes |

Soit **97 % de moins** pour l'installeur. Les ressources embarquées pèsent 6,0 Mo
avant compression, dont 5,1 pour pdf.js — chargé dynamiquement, seulement à
l'ouverture d'un PDF.

### Vérifié

`cargo build`, `cargo test` (3 tests) et `cargo clippy -- -D warnings` passent.
L'application a été lancée avec un EPUB en argument : le fichier est copié dans
le profil, les métadonnées et la couverture en sont extraites, le livre s'ouvre,
le paginateur rend une progression réelle et la position est enregistrée en CFI.
