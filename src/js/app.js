import { qs } from "./ui/dom.js";
import { paint } from "./ui/shapes.js";
import { filterBooks, renderShelf } from "./library.js";
import { DEFAULTS, applySettings, renderSettings } from "./settings.js";
import { createReader } from "./reader.js";
import { ingest } from "./import.js";
import {
  EXTENSIONS,
  bookFile,
  coverUrl,
  deleteBook,
  extensionOf,
  isNative,
  loadLibrary,
  onOpenRequest,
  pendingOpen,
  pickFiles,
  saveLibrary,
} from "./store.js";

const state = {
  books: [],
  settings: { ...DEFAULTS },
  query: "",
  lastView: "library",
};

const shelfNodes = {
  shelf: qs("#shelf"),
  empty: qs("#empty"),
  count: qs("#library-count"),
};

/** Écrit au plus une fois par seconde : `relocate` part à chaque page tournée,
 *  et on ne va pas réécrire tout le fichier à chaque fois. */
let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 1000);
}

async function persist() {
  clearTimeout(saveTimer);
  const books = state.books.map(({ coverUrl: _url, ...rest }) => rest);
  try {
    await saveLibrary({ version: 2, books, settings: state.settings });
  } catch (error) {
    console.error("Sauvegarde impossible", error);
  }
}

const reader = createReader(
  {
    page: qs("#page"),
    toc: qs("#toc"),
    tocList: qs("#toc-list"),
    tocToggle: qs("#toggle-toc"),
    title: qs("#running-title"),
    fill: qs("#rail-fill"),
    folio: qs("#folio"),
    note: qs("#note"),
    noteBody: qs("#note-body"),
    noteLabel: qs("#note-label"),
    noteClose: qs("#note-close"),
  },
  {
    onProgress: (book, fraction, cfi) => {
      book.fraction = fraction;
      if (cfi) book.cfi = cfi;
      scheduleSave();
    },
  },
);

function setView(name) {
  if (name !== "settings") state.lastView = name;
  document.body.dataset.view = name;
  document.body.classList.remove("is-immersive");
  // Sans ça, revenir des réglages laisse le chrome épinglé : plus aucun compte
  // à rebours n'est armé tant que la souris n'a pas bougé sur la page.
  if (name === "reader") reader.wake();
  if (name === "library") reader.close();
}

async function openBook(book) {
  setView("reader");
  try {
    await reader.open(book, await bookFile(book));
    book.opened = Date.now();
    scheduleSave();
  } catch (error) {
    console.error(`Ouverture impossible : ${book.title}`, error);
    window.alert(`Impossible d'ouvrir « ${book.title} ».\n${error.message ?? error}`);
    setView("library");
  }
}

async function removeBook(book) {
  if (!window.confirm(`Retirer « ${book.title} » de la bibliothèque ?`)) return;
  state.books = state.books.filter((item) => item.id !== book.id);
  drawShelf();
  try {
    await deleteBook(book);
  } catch (error) {
    console.error(`Suppression du fichier impossible : ${book.title}`, error);
  }
  await persist();
}

function drawShelf() {
  renderShelf(shelfNodes, filterBooks(state.books, state.query), {
    onOpen: openBook,
    onDelete: removeBook,
  });
  paint(shelfNodes.shelf);
}

function drawSettings() {
  renderSettings(qs("#settings"), state.settings, (next) => {
    applySettings(next);
    reader.applyLayout();
    drawShelf();
    scheduleSave();
  });
}

async function addFiles(picked) {
  const keep = picked.filter((item) => EXTENSIONS.includes(extensionOf(item.name)));
  if (!keep.length) return [];

  const added = [];
  for (const item of keep) {
    try {
      const entry = await ingest(item);
      if (entry.hasCover) entry.coverUrl = await coverUrl(entry.id);
      state.books.unshift(entry);
      added.push(entry);
      drawShelf();
    } catch (error) {
      console.error(`Import impossible : ${item.name}`, error);
      window.alert(`Impossible d'importer « ${item.name} ».\n${error.message ?? error}`);
    }
  }
  await persist();
  return added;
}

/** Chemin reçu du système : on le range puis on l'ouvre — c'est ce que le
 *  double-clic sur un fichier veut dire. */
async function openFromPath(path) {
  const [entry] = await addFiles([{ name: path.split(/[\\/]/).pop(), path }]);
  if (entry) await openBook(entry);
}

/** Le glisser-déposer n'a rien de commun entre les deux mondes : Tauri le
 *  remonte en événements natifs avec des chemins, le navigateur en DataTransfer. */
function wireDrop() {
  const view = qs("#view-library");
  const mark = (on) => view.classList.toggle("is-drop", on);

  if (isNative) {
    const { listen } = globalThis.__TAURI__.event;
    listen("tauri://drag-enter", () => mark(true));
    listen("tauri://drag-leave", () => mark(false));
    listen("tauri://drag-drop", (event) => {
      mark(false);
      const paths = event.payload?.paths ?? [];
      addFiles(paths.map((path) => ({ name: path.split(/[\\/]/).pop(), path })));
    });
    return;
  }

  view.addEventListener("dragover", (event) => {
    event.preventDefault();
    mark(true);
  });
  view.addEventListener("dragleave", () => mark(false));
  view.addEventListener("drop", (event) => {
    event.preventDefault();
    mark(false);
    addFiles([...event.dataTransfer.files].map((file) => ({ name: file.name, file })));
  });
}

async function boot() {
  const saved = await loadLibrary();
  if (saved) {
    state.books = saved.books ?? [];
    state.settings = { ...DEFAULTS, ...(saved.settings ?? {}) };
  }

  applySettings(state.settings);
  paint();
  drawSettings();
  drawShelf();
  wireDrop();

  // Les couvertures arrivent après coup : l'étagère est déjà lisible entre-temps.
  const withCovers = state.books.filter((book) => book.hasCover);
  await Promise.all(
    withCovers.map(async (book) => {
      book.coverUrl = await coverUrl(book.id);
    }),
  );
  if (withCovers.length) drawShelf();

  onOpenRequest(openFromPath);
  const requested = await pendingOpen();
  if (requested) await openFromPath(requested);
}

qs("#go-settings").addEventListener("click", () => setView("settings"));
qs("#reader-settings").addEventListener("click", () => setView("settings"));
qs("#close-settings").addEventListener("click", () => setView(state.lastView));
qs("#go-library").addEventListener("click", () => setView("library"));

qs("#search").addEventListener("input", (event) => {
  state.query = event.target.value;
  drawShelf();
});

qs("#add-book").addEventListener("click", async () => {
  addFiles(await pickFiles());
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.dataset.view === "settings") {
    setView(state.lastView);
  }
});

// La position de lecture ne doit pas se perdre parce qu'on a fermé la fenêtre.
window.addEventListener("beforeunload", () => {
  if (saveTimer) persist();
});

boot();
