# Contribuer à MontLivre

Merci de prendre le temps. MontLivre est un petit projet tenu par une seule
personne : les contributions courtes, ciblées et bien expliquées ont toutes les
chances d'être intégrées vite.

## Deux principes

Tout changement doit vivre avec eux.

> **Hors ligne par défaut.** Aucun compte, aucun envoi. Ce qui exigerait le
> réseau sera optionnel et signalé comme tel.
>
> **La légèreté est une fonctionnalité.** L'installeur pèse un peu plus de 4 Mo.
> Une dépendance, un modèle ou une police de plus doit rapporter davantage
> qu'elle ne coûte.

## Avant d'écrire du code

| Vous avez… | Allez dans… |
|---|---|
| un bug | [une issue « Signaler un bug »](../../issues/new/choose) |
| un livre qui s'ouvre mal | [une issue « Un livre s'ouvre mal »](../../issues/new/choose) — joignez le fichier s'il est redistribuable, c'est le seul moyen de reproduire |
| une idée de fonction | [Discussions → Ideas](../../discussions/categories/ideas) |
| une question | [Discussions → Q&A](../../discussions/categories/q-a) |

Pour une fonction nouvelle, ouvrez la discussion **avant** la pull request : on
évite ainsi de passer une soirée sur quelque chose qui ne rentrera pas. Une
correction de bug, une faute de frappe ou une amélioration d'accessibilité peut
venir directement en pull request.

## Mettre en place l'environnement

Il n'y a **ni Node, ni npm, ni étape de build front**. Le seul outillage est
Rust, sous Windows.

```bash
winget install --id Rustlang.Rustup
```

Installez ensuite « Desktop development with C++ » depuis
[Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/),
puis :

```bash
rustup default stable-msvc
```

```bash
cargo install tauri-cli --version "^2"
```

Le premier `cargo build` prend plusieurs minutes : il compile toutes les
dépendances de Tauri. Les suivants sont incrémentaux.

## Lancer

Depuis la racine du dépôt :

```bash
cargo tauri dev
```

Pour regarder l'interface **sans** la chaîne Rust, un serveur statique sert
`src/` tel quel sur http://localhost:8123 (la persistance passe alors par le
navigateur) :

```bash
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

## Vérifier avant de proposer

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Il n'y a pas de tests automatisés côté front. Si vous touchez à la lecture,
ouvrez au moins un EPUB **et** un PDF, et passez d'un thème à l'autre : le
parcours EPUB → PDF → EPUB a déjà cassé une fois.

## Se repérer dans le code

```
src/                    front — HTML, CSS et ES modules natifs, aucun bundler
├─ css/                 tokens.css porte toute l'identité visuelle
├─ js/
│  ├─ app.js            routeur des quatre vues
│  ├─ library.js        étagère, recherche
│  ├─ reader.js         enrobage de <foliate-view>, notes, surlignage
│  ├─ annotations.js    écran des annotations, palette des couleurs
│  ├─ settings.js       thèmes, typographie, accent, une ou deux pages
│  ├─ store.js          persistance : commandes Rust, ou navigateur en secours
│  ├─ import.js         copie du fichier, métadonnées, vignette de couverture
│  ├─ update.js         vérification et installation des mises à jour
│  └─ ui/               dom.js, shapes.js (formes Y2K + icônes), cover.js, fonts.js
├─ fonts/               Archivo et Literata, sous-ensembles latin
└─ vendor/foliate-js/   moteur de lecture (MIT), pdf.js compris

src-tauri/              coque Rust
├─ src/store.rs         tous les accès disque
└─ src/lib.rs           associations de fichiers, instance unique, plugins

tools/                  scripts PowerShell : icônes, logo, manifeste, serveur
```

Le front ne reçoit **aucune** permission `fs` : il manipule des identifiants, et
`store.rs` les traduit en chemins sous le dossier de données de l'application.
Un changement qui demanderait d'élargir les permissions de
`src-tauri/capabilities/` doit le justifier explicitement.

`src/vendor/` est du code tiers : on ne le modifie pas à la main. Si foliate-js
doit être contourné, faites-le depuis `reader.js`.

## Identité visuelle

Affiche typographique suisse pour le chrome, formes Y2K en ponctuation, palette
Yolk / Ochre / Violet / Moss sur Coal / Ash / Cloud. Trois règles :

- aucun angle arrondi ;
- aucune ombre floutée ;
- une seule couleur vive à l'écran à la fois.

La page de lecture n'en reçoit rien : sérif noire sur papier, sans décoration.
Toute couleur passe par les variables de `src/css/tokens.css`, jamais par une
valeur en dur.

## Pull requests

- Une pull request, un sujet. Deux corrections indépendantes, deux PR.
- Le message de commit et la description disent **pourquoi**, pas seulement
  quoi. Le français est la langue du projet ; l'anglais est accepté.
- Si le changement se voit, ajoutez une capture avant / après.
- Si le changement se voit pour l'utilisateur, ajoutez une ligne à la section
  en tête de [CHANGELOG.md](CHANGELOG.md) (« Ajouté », « Changé » ou
  « Corrigé »).
- Pas de nouvelle dépendance sans en avoir parlé d'abord.

En contribuant, vous acceptez que votre code soit publié sous la
[licence MIT](LICENSE) du projet.

## Publier une version

*Réservé à la personne qui détient la clé de signature.*

Les mises à jour sont signées : sans signature, les applications installées
refusent la version. La clé privée ne vit pas dans le dépôt.

1. Monter la version dans `src-tauri/Cargo.toml` et `src-tauri/tauri.conf.json`,
   compléter `CHANGELOG.md`.
2. Construire avec la clé :

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = "C:\chemin\vers\montlivre.key"
   $sec = Read-Host "Mot de passe de la cle" -AsSecureString
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
   cargo tauri build
   ```

   L'installeur NSIS et son `.sig` sortent dans
   `src-tauri/target/release/bundle/nsis/`.
3. Fabriquer le manifeste :

   ```bash
   powershell -ExecutionPolicy Bypass -File tools/make-manifest.ps1 -Notes "..."
   ```

4. Publier les **trois** fichiers dans la release — installeur, `.sig` et
   `latest.json` — car l'application interroge
   `releases/latest/download/latest.json`.

Si le logo change, régénérez les icônes avec `tools/make-icons.ps1`.

> ⚠️ **La clé privée est irremplaçable.** La perdre couperait définitivement la
> mise à jour de toutes les installations existantes : signer avec une nouvelle
> clé produirait des versions qu'elles refuseraient. Gardez-en une sauvegarde
> hors de cette machine.

## Soutenir le projet

Pas le temps de contribuer ? Vous pouvez aussi soutenir MontLivre sur
[ko-fi.com/simon256px](https://ko-fi.com/simon256px).
