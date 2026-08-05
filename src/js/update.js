/** Mise à jour intégrée.
 *
 *  Le manifeste `latest.json` est publié à côté de l'installeur dans la
 *  release GitHub ; sa signature est vérifiée contre la clé publique inscrite
 *  dans tauri.conf.json. Une version non signée par la bonne clé est refusée.
 *
 *  Dans un navigateur (tools/serve.ps1), tout ceci n'existe pas : les fonctions
 *  répondent poliment que non.
 */

const tauri = globalThis.__TAURI__ ?? null;

export const canUpdate = Boolean(tauri?.updater);

/** Renvoie l'objet de mise à jour, ou null s'il n'y a rien à faire. */
export async function checkForUpdate() {
  if (!canUpdate) return null;
  try {
    const update = await tauri.updater.check();
    return update?.available ? update : null;
  } catch (error) {
    // Hors ligne, GitHub injoignable, release sans manifeste : rien de fatal.
    console.warn("Vérification des mises à jour impossible", error);
    return null;
  }
}

/** Télécharge, installe, puis relance. L'installeur NSIS passe en mode
 *  « passive » : une barre de progression, aucune question. */
export async function installUpdate(update, onProgress) {
  let downloaded = 0;
  let total = 0;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") total = event.data?.contentLength ?? 0;
    else if (event.event === "Progress") downloaded += event.data?.chunkLength ?? 0;
    onProgress?.(total ? downloaded / total : null);
  });

  await tauri.process?.relaunch();
}
