import { clear, el } from "./ui/dom.js";
import { fontFaceRules } from "./ui/fonts.js";
import "../vendor/foliate-js/view.js";

const IDLE_MS = 2400;

/** Aplatit le sommaire en gardant la profondeur, pour l'indentation. */
function flattenToc(items, depth = 0, out = []) {
  for (const item of items ?? []) {
    out.push({ label: item.label?.trim() || "—", href: item.href, depth });
    if (item.subitems?.length) flattenToc(item.subitems, depth + 1, out);
  }
  return out;
}

/** Les réglages vivent dans des variables CSS ; on les relit ici pour n'avoir
 *  qu'une seule source de vérité, puis on les réinjecte dans le document du
 *  livre — qui est un iframe et n'hérite donc de rien. */
function readTokens() {
  const style = getComputedStyle(document.body);
  const get = (name) => style.getPropertyValue(name).trim();
  return {
    ink: get("--paper-ink"),
    paper: get("--paper"),
    font: get("--font-read"),
    size: parseFloat(get("--read-size")) || 18,
    leading: parseFloat(get("--read-leading")) || 1.6,
    measure: parseFloat(get("--read-measure")) || 62,
    margin: parseFloat(get("--read-margin")) || 56,
    dark: document.body.dataset.theme === "nuit",
  };
}

function bookStyles(t) {
  return `
    ${fontFaceRules()}
    html {
      color-scheme: ${t.dark ? "dark" : "light"};
      font-size: ${t.size}px;
      hyphens: auto;
    }
    html, body { color: ${t.ink}; background: none; }
    body {
      font-family: ${t.font};
      line-height: ${t.leading};
      -webkit-font-smoothing: antialiased;
    }
    p, li, blockquote, dd { line-height: ${t.leading}; }
    a:any-link { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 2px; }
    img, svg, video { max-width: 100%; height: auto; }
  `;
}

export function createReader(nodes, { onProgress } = {}) {
  let view = null;
  let entry = null;
  let idleTimer = 0;
  let currentHref = null;

  function setImmersive(on) {
    document.body.classList.toggle("is-immersive", on && nodes.toc.hidden);
  }

  function wake() {
    setImmersive(false);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setImmersive(true), IDLE_MS);
  }

  /** Largeur de colonne : le réglage est en signes, le paginateur veut une
   *  longueur. Un signe vaut à peu près la moitié du corps en sérif. */
  function applyLayout() {
    if (!view?.renderer) return;
    const t = readTokens();
    view.renderer.setStyles?.(bookStyles(t));
    view.renderer.setAttribute("margin", `${Math.round(t.margin)}px`);
    view.renderer.setAttribute("gap", "7%");
    view.renderer.setAttribute("max-inline-size", `${Math.round(t.measure * t.size * 0.5)}px`);
    view.renderer.setAttribute("max-column-count", "1");
  }

  function renderToc(toc) {
    const items = flattenToc(toc);
    clear(nodes.tocList);
    nodes.tocToggle.hidden = items.length === 0;

    for (const item of items) {
      nodes.tocList.append(
        el(
          "li",
          {},
          el(
            "button",
            {
              class: "toc__link",
              type: "button",
              "data-depth": String(Math.min(item.depth, 1)),
              "data-href": item.href || "",
              onClick: () => {
                if (item.href) view?.goTo(item.href);
                toggleToc(false);
              },
            },
            item.label,
          ),
        ),
      );
    }
  }

  function markTocItem(href) {
    if (href === currentHref) return;
    currentHref = href;
    for (const link of nodes.tocList.querySelectorAll(".toc__link")) {
      link.setAttribute("aria-current", String(link.dataset.href === href));
    }
  }

  function toggleToc(open = nodes.toc.hidden) {
    nodes.toc.hidden = !open;
    nodes.tocToggle.setAttribute("aria-expanded", String(open));
    if (open) setImmersive(false);
    else wake();
  }

  /** Tant que le paginateur n'a pas mesuré ses colonnes, il renvoie des NaN.
   *  On ne les affiche pas, et surtout on n'écrase pas une position déjà
   *  enregistrée avec une progression qui n'existe pas encore. */
  function onRelocate({ detail }) {
    const fraction = Number.isFinite(detail.fraction) ? detail.fraction : null;
    const page = detail.location?.current;
    const pages = detail.location?.total;

    if (fraction !== null) nodes.fill.style.width = `${(fraction * 100).toFixed(2)}%`;

    if (Number.isFinite(page) && Number.isFinite(pages)) {
      nodes.folio.textContent = `${page} / ${pages}`;
    } else if (fraction !== null) {
      nodes.folio.textContent = `${Math.round(fraction * 100)} %`;
    }

    markTocItem(detail.tocItem?.href ?? null);

    // Le CFI, lui, est toujours exploitable : c'est lui qui fait la reprise.
    if (entry && (fraction !== null || detail.cfi)) {
      onProgress?.(entry, fraction ?? entry.fraction ?? 0, detail.cfi ?? null);
    }
  }

  function close() {
    view?.close();
    view?.remove();
    view = null;
    entry = null;
    currentHref = null;
    clear(nodes.tocList);
    nodes.fill.style.width = "0%";
    nodes.folio.textContent = "";
  }

  /** `book` est la fiche de la bibliothèque, `file` un File/Blob ou une URL. */
  async function open(book, file) {
    close();
    entry = book;
    nodes.title.textContent = book.title;
    toggleToc(false);

    view = document.createElement("foliate-view");
    view.addEventListener("relocate", onRelocate);
    nodes.page.replaceChildren(view);

    await view.open(file);
    applyLayout();
    renderToc(view.book?.toc);

    // Une fois la mise en page prête, on retombe sur le CFI mémorisé.
    await view.init({ lastLocation: book.cfi || null });
    wake();
    return view.book?.metadata ?? null;
  }

  function turn(direction) {
    if (!view) return;
    if (direction > 0) view.next();
    else view.prev();
    setImmersive(true);
  }

  nodes.page.addEventListener("pointermove", wake);
  nodes.page.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaY) < 12) return;
      turn(event.deltaY > 0 ? 1 : -1);
    },
    { passive: true },
  );
  nodes.tocToggle.addEventListener("click", () => toggleToc());

  document.addEventListener("keydown", (event) => {
    if (document.body.dataset.view !== "reader") return;
    if (event.target instanceof HTMLInputElement) return;

    switch (event.key) {
      case "ArrowRight":
      case "PageDown":
        turn(1);
        break;
      case "ArrowLeft":
      case "PageUp":
        turn(-1);
        break;
      case " ":
        event.preventDefault();
        turn(event.shiftKey ? -1 : 1);
        break;
      case "Escape":
        if (!nodes.toc.hidden) toggleToc(false);
        else wake();
        break;
      default:
    }
  });

  return { open, close, toggleToc, wake, turn, applyLayout };
}
