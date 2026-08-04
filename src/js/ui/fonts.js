/** Les polices embarquées, décrites une seule fois.
 *
 *  `css/fonts.css` les déclare pour l'interface. Le livre, lui, est rendu dans
 *  une iframe : elle n'hérite d'aucun @font-face du document parent, il faut
 *  donc les lui redonner — avec des URL absolues, puisque son document est un
 *  blob: sans base relative utilisable.
 */

const FACES = [
  { family: "Archivo", file: "archivo-latin.woff2", weight: "100 900", stretch: "62% 125%" },
  { family: "Archivo", file: "archivo-latin-ext.woff2", weight: "100 900", stretch: "62% 125%" },
  { family: "Literata", file: "literata-latin.woff2", weight: "200 900" },
  { family: "Literata", file: "literata-latin-ext.woff2", weight: "200 900" },
];

const url = (file) => new URL(`../../fonts/${file}`, import.meta.url).href;

export function fontFaceRules() {
  return FACES.map(
    (face) => `@font-face {
      font-family: "${face.family}";
      font-style: normal;
      font-weight: ${face.weight};
      ${face.stretch ? `font-stretch: ${face.stretch};` : ""}
      font-display: block;
      src: url("${url(face.file)}") format("woff2");
    }`,
  ).join("\n");
}
