import { qs } from "./ui/dom.js";
import { paint } from "./ui/shapes.js";
import { filterBooks, renderShelf } from "./library.js";
import { DEFAULTS, applySettings, renderSettings } from "./settings.js";
import { createReader } from "./reader.js";
import { FIXTURES } from "./fixtures.js";

const state = {
  books: FIXTURES, // jalon 4 : remplacé par la lecture de library.json
  settings: { ...DEFAULTS },
  query: "",
  lastView: "library",
};

const shelfNodes = {
  shelf: qs("#shelf"),
  empty: qs("#empty"),
  count: qs("#library-count"),
};

const reader = createReader(
  {
    page: qs("#page"),
    toc: qs("#toc"),
    tocList: qs("#toc-list"),
    tocToggle: qs("#toggle-toc"),
    title: qs("#running-title"),
    fill: qs("#rail-fill"),
    folio: qs("#folio"),
  },
  {
    onProgress: (book, fraction) => {
      book.fraction = fraction;
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
}

function drawShelf() {
  renderShelf(shelfNodes, filterBooks(state.books, state.query), (book) => {
    setView("reader");
    reader.open(book);
  });
  paint(shelfNodes.shelf);
}

function drawSettings() {
  renderSettings(qs("#settings"), state.settings, (next) => {
    applySettings(next);
    drawShelf(); // l'accent change la barre de progression des couvertures
  });
}

qs("#go-settings").addEventListener("click", () => setView("settings"));
qs("#reader-settings").addEventListener("click", () => setView("settings"));
qs("#close-settings").addEventListener("click", () => setView(state.lastView));
qs("#go-library").addEventListener("click", () => setView("library"));

qs("#search").addEventListener("input", (event) => {
  state.query = event.target.value;
  drawShelf();
});

qs("#add-book").addEventListener("click", () => {
  // Jalon 4 : dialog.open() puis import via la commande Rust book_import.
  console.info("Import de livre — branché au jalon 4.");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.dataset.view === "settings") {
    setView(state.lastView);
  }
});

applySettings(state.settings);
paint();
drawSettings();
drawShelf();
