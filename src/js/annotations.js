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

function jot(item, onOpen) {
  return el(
    "button",
    {
      class: "jot",
      type: "button",
      onClick: () => onOpen(item),
      title: item.text,
    },
    el("span", { class: "jot__flag", style: { "--jot-color": colorHex(item.color) } }),
    el(
      "span",
      {},
      el("p", { class: "jot__text" }, item.text),
      el(
        "p",
        { class: "jot__meta" },
        item.pinned ? el("span", { html: icons.book() }) : null,
        item.label || "Passage",
      ),
    ),
  );
}

/** Les épinglés d'abord, détachés ; le reste dans l'ordre du livre. */
export function renderNotes(container, annotations, { onOpen }) {
  clear(container);

  if (!annotations.length) {
    container.append(
      el("p", { class: "notes__empty" }, "Sélectionnez un passage pour le surligner."),
    );
    return;
  }

  const pinned = annotations.filter((item) => item.pinned);
  const rest = annotations.filter((item) => !item.pinned);

  if (pinned.length) {
    container.append(el("p", { class: "notes__group" }, `Épinglés — ${pinned.length}`));
    for (const item of pinned) container.append(jot(item, onOpen));
  }

  if (rest.length) {
    if (pinned.length) container.append(el("p", { class: "notes__group" }, "Tout le reste"));
    for (const item of rest) container.append(jot(item, onOpen));
  }
}
