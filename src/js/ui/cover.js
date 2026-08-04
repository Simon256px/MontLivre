/** Couvertures engendrées.
 *
 *  Un livre sans couverture n'hérite pas d'un rectangle gris : il reçoit une
 *  affiche. Couleur, forme et inclinaison sont tirées d'un hachage du titre,
 *  donc stables — le même livre garde la même couverture d'un lancement à
 *  l'autre, et deux livres voisins ne se ressemblent pas.
 *
 *  Les couleurs sont écrites en dur : elles appartiennent au livre, pas au
 *  thème, et ne doivent pas bouger quand on change l'accent de l'application.
 */

import { el } from "./dom.js";
import { shapes } from "./shapes.js";

const PALETTE = [
  { bg: "#ffa51e", ink: "#000000" }, // Yolk
  { bg: "#ff5500", ink: "#000000" }, // Ochre
  { bg: "#7d00ff", ink: "#ffffff" }, // Violet
  { bg: "#00aa46", ink: "#000000" }, // Moss
  { bg: "#e1e1e1", ink: "#000000" }, // Cloud
  { bg: "#000000", ink: "#e1e1e1" }, // Coal
];

const SHAPES = ["star4", "burst", "blob", "flower", "checker"];

/** FNV-1a : court, sans dépendance, et suffisamment dispersant pour 4 bits. */
export function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function titleSize(title) {
  if (title.length > 46) return "15px";
  if (title.length > 30) return "19px";
  if (title.length > 18) return "23px";
  return "27px";
}

export function generatedCover(book) {
  const seed = hash(`${book.title}|${book.author || ""}`);
  const palette = PALETTE[seed % PALETTE.length];
  const shape = SHAPES[(seed >>> 5) % SHAPES.length];
  const tilt = ((seed >>> 11) % 5) * 9 - 18;

  return el(
    "div",
    { class: "gen", style: { "--gen-bg": palette.bg, "--gen-ink": palette.ink } },
    el(
      "div",
      {
        class: "gen__shape",
        style: { transform: `rotate(${tilt}deg)` },
        html: shapes[shape](),
      },
    ),
    el("p", { class: "gen__title", style: { fontSize: titleSize(book.title) } }, book.title),
    el("p", { class: "gen__author" }, book.author || "Anonyme"),
  );
}

/** La vraie couverture si le livre en a une, l'affiche engendrée sinon. */
export function coverFor(book) {
  if (book.coverUrl) {
    return el("img", { class: "book__img", src: book.coverUrl, alt: "", loading: "lazy" });
  }
  return generatedCover(book);
}
