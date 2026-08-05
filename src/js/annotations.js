import { clear, el } from "./ui/dom.js";
import { icons } from "./ui/shapes.js";

/** Les quatre accents de la palette, en dur : la couleur appartient à
 *  l'annotation et ne doit pas bouger quand on change l'accent de l'app. */
export const HIGHLIGHT_COLORS = [
  { id: "yolk", label: "Yolk", hex: "#ffa51e" },
  { id: "ochre", label: "Ochre", hex: "#ff5500" },
  { id: "violet", label: "Violet", hex: "#7d00ff" },
  { id: "moss", label: "Moss", hex: "#00aa46" },
];

export const colorHex = (id) =>
  (HIGHLIGHT_COLORS.find((color) => color.id === id) ?? HIGHLIGHT_COLORS[1]).hex;

/** Toutes les annotations de la bibliothèque, à plat, favoris en tête. */
export function collectAnnotations(books) {
  const all = [];
  for (const book of books) {
    for (const item of book.annotations ?? []) all.push({ book, item });
  }
  return all.sort((a, b) => {
    if (Boolean(a.item.favorite) !== Boolean(b.item.favorite)) return a.item.favorite ? -1 : 1;
    return (b.item.created ?? 0) - (a.item.created ?? 0);
  });
}

export function annotationCount(books) {
  const all = collectAnnotations(books);
  if (!all.length) return "";
  const favorites = all.filter((entry) => entry.item.favorite).length;
  const total = `${all.length} annotation${all.length > 1 ? "s" : ""}`;
  return favorites ? `${total} · ${favorites} en favori` : total;
}

function card({ book, item }, { onOpen, onToggleFavorite, onDelete }) {
  const action = (name, label, handler) =>
    el("button", {
      class: "jot__action",
      type: "button",
      title: label,
      "aria-label": label,
      html: icons[name](),
      onClick: handler,
    });

  return el(
    "article",
    { class: "jot", "data-favorite": String(Boolean(item.favorite)) },
    el("span", { class: "jot__flag", style: { "--jot-color": colorHex(item.color) } }),
    el(
      "button",
      {
        class: "jot__open",
        type: "button",
        onClick: () => onOpen(book, item),
        title: "Retrouver le passage",
      },
      el("p", { class: "jot__text" }, item.text),
      el(
        "p",
        { class: "jot__meta" },
        book.title,
        item.label ? ` · ${item.label}` : "",
      ),
    ),
    el(
      "div",
      { class: "jot__actions" },
      action(
        item.favorite ? "star-full" : "star",
        item.favorite ? "Retirer des favoris" : "Mettre en favori",
        () => onToggleFavorite(book, item),
      ),
      action("trash", "Supprimer l'annotation", () => onDelete(book, item)),
    ),
  );
}

export function renderAnnotations(container, books, handlers) {
  const entries = collectAnnotations(books);
  clear(container);

  if (!entries.length) {
    container.append(
      el(
        "div",
        { class: "empty" },
        el("div", { class: "empty__shape", "data-shape": "burst" }),
        el("p", { class: "empty__title" }, "Aucune annotation"),
        el(
          "p",
          { class: "empty__hint" },
          "Surlignez un passage pendant la lecture : il apparaîtra ici.",
        ),
      ),
    );
    return;
  }

  for (const entry of entries) container.append(card(entry, handlers));
}
