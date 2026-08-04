import { makeBook } from "../vendor/foliate-js/view.js";
import { bookFile, extensionOf, importBook, saveCover } from "./store.js";

/** Les métadonnées EPUB arrivent sous trois formes selon les producteurs :
 *  une chaîne, un objet par langue, ou une liste d'auteurs `{ name }`. */
function textOf(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(", ");
  return textOf(value.name ?? value.value ?? Object.values(value)[0]);
}

/** Les couvertures d'origine montent à plusieurs Mo. On n'affiche jamais plus
 *  de 420 px de large : autant ne stocker que ça. */
async function thumbnail(blob, maxWidth = 420) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Range un fichier choisi et en tire une fiche de bibliothèque.
 *  Si les métadonnées sont illisibles, le livre entre quand même — sous le nom
 *  de son fichier. Mieux vaut une fiche imparfaite qu'un import qui échoue. */
export async function ingest(picked) {
  const id = crypto.randomUUID();
  const stored = await importBook(id, picked);

  const entry = {
    id,
    file: stored,
    format: extensionOf(picked.name),
    title: picked.name.replace(/\.[^.]+$/, ""),
    author: "",
    added: Date.now(),
    opened: 0,
    cfi: null,
    fraction: 0,
    hasCover: false,
  };

  try {
    const book = await makeBook(await bookFile(entry));
    entry.title = textOf(book.metadata?.title) || entry.title;
    entry.author = textOf(book.metadata?.author);

    const cover = await book.getCover?.();
    if (cover) {
      await saveCover(id, await thumbnail(cover));
      entry.hasCover = true;
    }
    book.destroy?.();
  } catch (error) {
    console.warn(`Métadonnées illisibles pour ${picked.name}`, error);
  }

  return entry;
}
