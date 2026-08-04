/** Fabrique d'éléments. Les titres de livres viennent de fichiers tiers :
 *  tout passe par des nœuds texte, jamais par innerHTML — sauf `html`, réservé
 *  aux chaînes SVG que nous écrivons nous-mêmes dans shapes.js. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key === "style") setStyle(node, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node && key !== "list" && key !== "form") node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }

  append(node, children);
  return node;
}

function setStyle(node, style) {
  if (typeof style === "string") {
    node.setAttribute("style", style);
    return;
  }
  for (const [key, value] of Object.entries(style)) {
    // Object.assign ne sait pas poser une variable CSS.
    if (key.startsWith("--")) node.style.setProperty(key, value);
    else node.style[key] = value;
  }
}

function append(node, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(node, child);
    else node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

export function clear(node) {
  node.replaceChildren();
  return node;
}
