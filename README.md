<h1 align="center">MontLivre</h1>

<p align="center"><strong>Ranger, lire, régler. Rien d'autre.</strong></p>

MontLivre est un lecteur de livres numériques pour Windows. Il lit EPUB, MOBI,
AZW3, FB2 et CBZ, il tient dans une poignée de mégaoctets, il fonctionne hors
ligne, il ne demande pas de compte et il n'envoie rien nulle part.

> ⚠️ **Chantier en cours.** `master` porte désormais la v2. La v1 Electron
> complète est archivée sur la branche [`v1`](../../tree/v1), et ses installeurs
> restent disponibles dans les [releases](../../releases).

## Ce qui change

La v1 était un Electron de ~6 900 lignes avec un moteur de remise en page maison
et un installeur de 122 Mo. La v2 délègue la lecture à
[foliate-js](https://github.com/johnfactotum/foliate-js) et remplace Electron par
[Tauri 2](https://v2.tauri.app/), qui s'appuie sur le WebView2 déjà présent sur
Windows.

| | v1 | v2 |
|---|---|---|
| Coque | Electron | Tauri 2 (WebView2) |
| Moteur de lecture | maison (`extract.js`) | foliate-js |
| Formats | PDF, EPUB | EPUB, MOBI, AZW3, FB2, CBZ + PDF (page fixe) |
| Chaîne de build | Node + npm + electron-builder | Rust seul, aucun bundler |
| Installeur | 122 Mo | **3,55 Mo** |
| Mémoire au repos | ~180 Mo | 28 Mo |

**Le PDF perd sa remise en page.** foliate-js rend les PDF en pages fixes, pas en
texte refluant. C'est le prix de l'abandon du moteur maison, et c'est le même
compromis que fait Readest.

Fonctions de la v1 mises de côté pour l'instant : OCR, RSVP, mode focus, bionic
reading, stylet, succès, Pomodoro, dictionnaire, lecture parallèle. Les
annotations et les statistiques reviendront après la v2.0.

## Installer la chaîne de développement

Il n'y a **ni Node, ni npm, ni étape de build front**. Le seul outillage est Rust.

```bash
winget install --id Rustlang.Rustup
```

Puis installer « Desktop development with C++ » depuis
[Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/),
et enfin :

```bash
rustup default stable-msvc
```

```bash
cargo install tauri-cli --version "^2"
```

Le premier `cargo build` prend plusieurs minutes : il compile toute l'arborescence
de dépendances de Tauri. Les suivants sont incrémentaux.

## Lancer

```bash
cargo tauri dev --manifest-path src-tauri/Cargo.toml
```

Pour regarder l'interface **sans** la chaîne Rust, un serveur statique de
dépannage sert `src/` tel quel dans un navigateur, sur http://localhost:8123 :

```bash
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

## Construire l'installeur

```bash
cargo tauri build --manifest-path src-tauri/Cargo.toml
```

Le NSIS sort dans `src-tauri/target/release/bundle/nsis/`. Il déclare
l'application comme lecteur pour `.epub`, `.mobi`, `.azw3`, `.azw`, `.fb2`,
`.cbz` et `.pdf` : un double-clic range le livre dans la bibliothèque et
l'ouvre. Si MontLivre tourne déjà, c'est la fenêtre existante qui s'en charge.

Les icônes sont déjà générées dans `src-tauri/icons/`. Si le logo change :

```bash
powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
```

L'installeur produit pèse **3,55 Mo**.

## Architecture

```
src/                  front — HTML, CSS et ES modules natifs, aucun bundler
├─ css/               tokens.css porte toute l'identité visuelle
├─ js/
│  ├─ app.js          routeur des trois vues
│  ├─ library.js      étagère, recherche
│  ├─ reader.js       enrobage de <foliate-view>
│  ├─ settings.js     thèmes, typographie, accent
│  └─ ui/             dom.js, shapes.js (formes Y2K + icônes), cover.js
└─ vendor/foliate-js/ moteur de lecture (MIT) — arrive au jalon 3

src-tauri/            coque Rust
└─ src/store.rs       tous les accès disque ; le front n'a aucune permission fs
```

Le front ne reçoit aucune permission `fs` : il manipule des identifiants, et
`store.rs` les traduit en chemins sous le dossier de données de l'application.
Les livres importés sont **copiés** dans `%APPDATA%/com.simoncrts.montlivre/books/`.

## Identité visuelle

Affiche typographique suisse pour le chrome, formes Y2K en ponctuation, palette
Yolk / Ochre / Violet / Moss sur Coal / Ash / Cloud. Trois règles tiennent le
tout : aucun angle arrondi, aucune ombre floutée, une seule couleur vive à
l'écran à la fois.

La page de lecture, elle, ne reçoit rien de tout ça : sérif noire sur papier,
sans décoration ni couleur.

## Vérifier

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

## Licence

MIT
