/** Formes Y2K et icônes, en SVG inline.
 *
 *  Pas de police d'icônes, pas de sprite : une poignée de chaînes qui héritent
 *  de `currentColor`. Les formes sont pleines, les icônes sont des traits à
 *  bouts carrés — rien d'arrondi nulle part.
 */

import { qsa } from "./dom.js";

const wrap = (body) =>
  `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

/** Étoile à n branches, centrée dans un carré de 100. */
function starPath(points, outer, inner) {
  const step = Math.PI / points;
  let d = "";
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 ? inner : outer;
    const angle = i * step - Math.PI / 2;
    const x = (50 + radius * Math.cos(angle)).toFixed(2);
    const y = (50 + radius * Math.sin(angle)).toFixed(2);
    d += `${i ? "L" : "M"}${x} ${y}`;
  }
  return `${d}Z`;
}

function checkerCells(n) {
  const size = 100 / n;
  let out = "";
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if ((x + y) % 2 === 0) {
        out += `<rect x="${(x * size).toFixed(2)}" y="${(y * size).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" fill="currentColor"/>`;
      }
    }
  }
  return out;
}

export const shapes = {
  /** L'étincelle à quatre branches, aux flancs creusés. Le motif signature. */
  star4: () =>
    wrap(
      '<path d="M50 0C54.6 33.4 66.6 45.4 100 50 66.6 54.6 54.6 66.6 50 100 45.4 66.6 33.4 54.6 0 50 33.4 45.4 45.4 33.4 50 0Z" fill="currentColor"/>',
    ),

  burst: () => wrap(`<path d="${starPath(8, 50, 19)}" fill="currentColor"/>`),

  blob: () =>
    wrap(
      '<path d="M52 4c21 0 41 13 43 32 2 19-11 27-9 40 2 13-13 22-32 20C33 94 14 87 8 71 2 55 7 33 19 19 29 7 39 4 52 4Z" fill="currentColor"/>',
    ),

  flower: (petals = 6) =>
    wrap(
      Array.from(
        { length: petals },
        (_, i) =>
          `<ellipse cx="50" cy="27" rx="16" ry="25" transform="rotate(${(i * 360) / petals} 50 50)" fill="currentColor"/>`,
      ).join(""),
    ),

  /** Le damier « distorted » : la grille est là, mais elle glisse. */
  checker: () => wrap(`<g transform="skewY(-9) translate(0 9)">${checkerCells(6)}</g>`),
};

const icon = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

export const icons = {
  "arrow-left": () => icon('<path d="M20 12H4M10 6l-6 6 6 6"/>'),
  plus: () => icon('<path d="M12 4v16M4 12h16"/>'),
  search: () => icon('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.6-4.6"/>'),
  close: () => icon('<path d="M5 5l14 14M19 5L5 19"/>'),
  list: () => icon('<path d="M4 7h16M4 12h16M4 17h11"/>'),
  sliders: () =>
    icon(
      '<path d="M3 8h18M3 16h18"/><rect x="7" y="5" width="6" height="6" fill="currentColor" stroke="none"/><rect x="13" y="13" width="6" height="6" fill="currentColor" stroke="none"/>',
    ),
  book: () => icon('<path d="M12 7 4 5v14l8 2M12 7l8-2v14l-8 2M12 7v14"/>'),
  copy: () => icon('<rect x="9" y="9" width="11" height="11"/><path d="M15 5H4v11h5"/>'),
  trash: () => icon('<path d="M4 7h16M10 7V4h4v3M6.5 7 8 20h8l1.5-13"/>'),
  notes: () => icon('<path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5"/>'),
};

/** Remplit tous les [data-icon] et [data-shape] d'une racine donnée. */
export function paint(root = document) {
  for (const node of qsa("[data-icon]", root)) {
    const draw = icons[node.dataset.icon];
    if (draw && !node.firstChild) node.innerHTML = draw();
  }
  for (const node of qsa("[data-shape]", root)) {
    const draw = shapes[node.dataset.shape];
    if (draw && !node.firstChild) node.innerHTML = draw();
  }
}
