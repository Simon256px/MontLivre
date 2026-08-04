import { clear, el } from "./ui/dom.js";
import { coverFor } from "./ui/cover.js";
import { icons, shapes } from "./ui/shapes.js";

/** « Éléphant » et « elephant » doivent se trouver l'un l'autre. */
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

const fold = (text) =>
  text
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase();

export function filterBooks(books, query) {
  const needle = fold(query.trim());
  if (!needle) return books;
  return books.filter((book) => fold(`${book.title} ${book.author || ""}`).includes(needle));
}

export function countLabel(books) {
  if (!books.length) return "";
  const reading = books.filter((b) => b.fraction > 0 && b.fraction < 0.995).length;
  const total = `${books.length} livre${books.length > 1 ? "s" : ""}`;
  return reading ? `${total} · ${reading} en cours` : total;
}

function card(book, onOpen, onDelete) {
  const percent = Math.round((book.fraction || 0) * 100);
  const started = percent > 0 && percent < 100;

  return el(
    "article",
    { class: "book" },
    el(
      "button",
      {
        class: "book__open",
        type: "button",
        onClick: () => onOpen(book),
        title: `${book.title}${book.author ? ` — ${book.author}` : ""}`,
      },
      el(
        "div",
        { class: "book__frame" },
        coverFor(book),
        started ? el("span", { class: "book__mark", html: shapes.star4() }) : null,
      ),
      el("p", { class: "book__title" }, book.title),
      el("p", { class: "book__author" }, book.author || "Anonyme"),
      el(
        "div",
        { class: "book__track" },
        el("div", { class: "book__fill", style: { width: `${percent}%` } }),
      ),
    ),
    el("button", {
      class: "book__del",
      type: "button",
      "aria-label": `Retirer ${book.title}`,
      title: "Retirer de la bibliothèque",
      html: icons.close(),
      onClick: () => onDelete(book),
    }),
  );
}

export function renderShelf({ shelf, empty, count }, books, { onOpen, onDelete }) {
  clear(shelf);
  shelf.hidden = books.length === 0;
  empty.hidden = books.length > 0;
  count.textContent = countLabel(books);
  for (const book of books) shelf.append(card(book, onOpen, onDelete));
}
