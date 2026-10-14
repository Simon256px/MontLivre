<h1 align="center">MontLivre</h1>

<p align="center"><strong>Ranger, lire, régler. Rien d'autre.</strong></p>

<p align="center">
  <a href="../../releases/latest"><strong>Télécharger</strong></a> ·
  <a href="CHANGELOG.md">Journal des versions</a> ·
  <a href="CONTRIBUTING.md">Contribuer</a> ·
  <a href="LICENSE">Licence MIT</a>
</p>

MontLivre est un lecteur de livres numériques pour Windows. Il lit EPUB, MOBI,
AZW3, FB2 et CBZ, son installeur pèse un peu plus de 4 Mo, il fonctionne hors
ligne, il ne demande aucun compte et il n'envoie rien nulle part.

## Installer

1. Téléchargez `MontLivre_x.y.z_x64-setup.exe` depuis la
   [dernière release](../../releases/latest).
2. Lancez-le. Windows 10 ou 11 suffit : MontLivre s'appuie sur WebView2, déjà
   présent sur le système.

L'application se met ensuite à jour d'elle-même : au démarrage, un bandeau
propose la nouvelle version quand il y en a une. Chaque version est signée, et
la signature est vérifiée avant installation.

## Ce qu'il sait faire

- **Cinq formats** — EPUB, MOBI, AZW3, FB2, CBZ, plus les PDF en page fixe
- **Une page ou deux**, quatre thèmes (Papier, Lin, Nuit, Contraste), police,
  corps, interligne, largeur de colonne, marges
- **Reprise exacte** : la position survit à un changement de taille de texte
- **Notes de bas de page en infobulle**, au survol comme au clic
- **Annotations** — surlignage quatre couleurs, favoris, écran qui rassemble les
  passages de toute la bibliothèque
- **Couvertures engendrées** pour les livres qui n'en ont pas
- Double-clic sur un `.epub` pour l'ouvrir, glisser-déposer, instance unique

## Bon à savoir

**Les PDF ne se remettent pas en page.** Ils s'affichent tels quels, page par
page, et ne prennent ni surlignage ni favoris — la sélection propose seulement
« Copier ». C'est le prix d'un lecteur de 4 Mo plutôt que de 122.

**Vos livres restent chez vous.** Un livre importé est *copié* ; l'original ne
bouge pas. La copie, la bibliothèque (`library.json`) et les couvertures vivent
dans `%APPDATA%\com.simoncrts.montlivre\`. Aucune base de données, aucun format
opaque.

**Une seule requête réseau** : la vérification de mise à jour au démarrage, qui
lit un manifeste publié avec les releases. Rien n'est transmis. Pas de compte,
pas de télémétrie, pas de synchronisation.

**Windows seulement**, pour l'instant.

## La suite

- **v2.4 — savoir où on en est.** Temps de lecture, objectif quotidien, streak,
  vitesse moyenne.
- **v2.5 — sortir de Windows.** macOS et Linux, que Tauri rend accessibles sans
  réécriture.
- Plus tard, sans date : défilement continu, recherche plein texte, tri et
  étagères, notes écrites et export Markdown des annotations.

Une idée ? Elle se discute dans
[Discussions → Ideas](../../discussions/categories/ideas) avant de devenir un
ticket. Un livre qui s'ouvre mal ou un bug ?
[Ouvrez une issue](../../issues/new/choose).

## La v1

La v1 était une application Electron de ~6 900 lignes avec son propre moteur de
remise en page et un installeur de 122 Mo. La v2 confie la lecture à
[foliate-js](https://github.com/johnfactotum/foliate-js) et remplace Electron par
[Tauri 2](https://v2.tauri.app/). Le code de la v1 reste consultable sur la
branche [`v1`](../../tree/v1) ; il n'est plus maintenu.

## Contribuer

Tout ce qu'il faut pour construire, tester et proposer un changement est dans
[CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE) © Simon Courtois.

Les composants embarqués gardent leur propre licence :
[foliate-js](https://github.com/johnfactotum/foliate-js) (MIT),
[pdf.js](https://github.com/mozilla/pdf.js) (Apache 2.0),
[fflate](https://github.com/101arrowz/fflate) (MIT),
[zip.js](https://github.com/gildas-lormeau/zip.js) (BSD 3 clauses), et les
polices Archivo et Literata (SIL Open Font License).
