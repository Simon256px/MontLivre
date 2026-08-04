/** Persistance.
 *
 *  Deux implémentations derrière la même interface :
 *
 *  — Dans Tauri, tout passe par les commandes Rust de src-tauri/src/store.rs.
 *    Le front ne touche jamais au disque et n'a aucune permission `fs`.
 *  — Dans un navigateur (tools/serve.ps1), la bibliothèque va dans
 *    localStorage et les fichiers restent en mémoire. C'est un mode de
 *    dépannage pour regarder l'interface avant d'avoir installé Rust : les
 *    livres ne survivent pas à un rechargement, et c'est assumé.
 */

const tauri = globalThis.__TAURI__ ?? null;
export const isNative = Boolean(tauri);

const KEY = "montlivre.library";
const MEMORY = new Map(); // nom de fichier -> File, mode navigateur seulement

export const EXTENSIONS = ["epub", "mobi", "azw3", "azw", "fb2", "cbz", "pdf"];

const invoke = (command, args) => tauri.core.invoke(command, args);

export async function loadLibrary() {
  const text = isNative ? await invoke("library_read") : localStorage.getItem(KEY);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("library.json illisible, on repart d'une bibliothèque vide", error);
    return null;
  }
}

export async function saveLibrary(data) {
  const json = JSON.stringify(data);
  if (isNative) return invoke("library_write", { json });
  localStorage.setItem(KEY, json);
  return undefined;
}

/** Renvoie une liste normalisée : `{ name, path }` natif, `{ name, file }` web. */
export async function pickFiles() {
  if (isNative) {
    const picked = await tauri.dialog.open({
      multiple: true,
      filters: [{ name: "Livres", extensions: EXTENSIONS }],
    });
    if (!picked) return [];
    const paths = Array.isArray(picked) ? picked : [picked];
    return paths.map((path) => ({ name: path.split(/[\\/]/).pop(), path }));
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = EXTENSIONS.map((e) => `.${e}`).join(",");
    input.addEventListener("change", () =>
      resolve([...input.files].map((file) => ({ name: file.name, file }))),
    );
    input.click();
  });
}

export function extensionOf(name) {
  return (name.split(".").pop() || "").toLowerCase();
}

/** Range le fichier dans la bibliothèque et renvoie son nom de stockage. */
export async function importBook(id, picked) {
  const stored = `${id}.${extensionOf(picked.name)}`;
  if (isNative) return invoke("book_import", { id, source: picked.path });
  MEMORY.set(stored, picked.file);
  return stored;
}

/** Le fichier prêt à être passé à foliate (`view.open`). */
export async function bookFile(book) {
  if (!isNative) {
    const file = MEMORY.get(book.file);
    if (!file) throw new Error("Fichier absent : en mode navigateur, il faut le réimporter.");
    return file;
  }
  const bytes = await invoke("book_bytes", { name: book.file });
  return new File([bytes], book.file);
}

export async function deleteBook(book) {
  if (isNative) {
    await invoke("book_delete", { name: book.file });
    await invoke("cover_delete", { id: book.id });
    return;
  }
  MEMORY.delete(book.file);
  MEMORY.delete(`cover:${book.id}`);
}

export async function saveCover(id, blob) {
  if (!isNative) {
    MEMORY.set(`cover:${id}`, URL.createObjectURL(blob));
    return;
  }
  const bytes = [...new Uint8Array(await blob.arrayBuffer())];
  await invoke("cover_write", { id, bytes });
}

/** Fichier réclamé au lancement par double-clic, s'il y en a un. */
export async function pendingOpen() {
  if (!isNative) return null;
  return invoke("take_pending_open");
}

/** Double-clic alors que l'application tourne déjà : le plugin single-instance
 *  transmet le chemin à l'instance en place plutôt que d'en ouvrir une seconde. */
export function onOpenRequest(callback) {
  if (!isNative) return;
  tauri.event.listen("montlivre://open-file", (event) => callback(event.payload));
}

export async function coverUrl(id) {
  if (!isNative) return MEMORY.get(`cover:${id}`) ?? null;
  const bytes = await invoke("cover_bytes", { id });
  if (!bytes || bytes.byteLength === 0) return null;
  return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
}
