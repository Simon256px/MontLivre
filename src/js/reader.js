import { clear, el } from "./ui/dom.js";
import { fontFaceRules } from "./ui/fonts.js";
import "../vendor/foliate-js/view.js";
import { FootnoteHandler } from "../vendor/foliate-js/footnotes.js";

const IDLE_MS = 2400;
const HOVER_MS = 320;
const HIDE_MS = 260;

const NOTE_LABELS = {
  footnote: "Note",
  endnote: "Note",
  note: "Note",
  biblioentry: "Référence",
  definition: "Définition",
};

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

  // ---- Notes de bas de page ----
  //
  // foliate fait le plus dur : reconnaître un appel de note (epub:type, rôles
  // ARIA, ou simple exposant), aller chercher le fragment et le rendre dans une
  // vue à part. Il nous reste à le poser au bon endroit de l'écran.

  const sectionOfDoc = new WeakMap();
  const footnotes = new FootnoteHandler();
  let hoverTimer = 0;
  let hideTimer = 0;
  let noteAnchor = null;

  /** Le livre est dans une iframe : ses coordonnées ne valent rien pour le
   *  document parent. `frameElement` fait le pont — et il traverse la racine
   *  fantôme fermée du paginateur, parce qu'on le lit de l'intérieur. */
  function anchorRect(doc, element) {
    const frameRect = doc.defaultView?.frameElement?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const dx = frameRect?.left ?? 0;
    const dy = frameRect?.top ?? 0;
    return {
      left: rect.left + dx,
      right: rect.right + dx,
      top: rect.top + dy,
      bottom: rect.bottom + dy,
    };
  }

  function placeNote(rect) {
    const box = nodes.note.getBoundingClientRect();
    const margin = 12;

    let left = (rect.left + rect.right) / 2 - box.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - box.width - margin));

    // Au-dessus de l'appel si la place existe, en dessous sinon.
    let top = rect.top - box.height - 10;
    if (top < margin) top = rect.bottom + 10;
    top = Math.max(margin, Math.min(top, window.innerHeight - box.height - margin));

    nodes.note.style.left = `${Math.round(left)}px`;
    nodes.note.style.top = `${Math.round(top)}px`;
  }

  function hideNote() {
    clearTimeout(hideTimer);
    clearTimeout(hoverTimer);
    nodes.note.hidden = true;
    nodes.note.style.opacity = "";
    clear(nodes.noteBody);
    noteAnchor = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideNote, HIDE_MS);
  }

  /** La vue de la note doit être dans le document AVANT que foliate n'essaie de
   *  la rendre : hors du DOM elle n'a pas de mise en page, son `load` ne part
   *  jamais, et `render` n'arrive donc jamais non plus. On l'attache ici, à
   *  l'aveugle, et on ne la dévoile qu'une fois le contenu posé. */
  footnotes.addEventListener("before-render", ({ detail }) => {
    const renderer = detail.view.renderer;
    renderer?.setStyles?.(bookStyles(readTokens()));
    // Une note se parcourt d'un trait, elle ne se pagine pas.
    renderer?.setAttribute("flow", "scrolled");
    renderer?.setAttribute("gap", "4%");
    renderer?.setAttribute("margin", "14px");

    clear(nodes.noteBody).append(detail.view);
    nodes.note.style.opacity = "0";
    nodes.note.hidden = false;
    if (noteAnchor) placeNote(noteAnchor);
  });

  footnotes.addEventListener("render", ({ detail }) => {
    nodes.noteLabel.textContent = NOTE_LABELS[detail.type] ?? "Note";
    nodes.note.style.opacity = "1";
    if (noteAnchor) placeNote(noteAnchor);
  });

  async function openFootnote(doc, link) {
    if (!view?.book) return;
    const raw = link.getAttribute("href");
    if (!raw) return;

    const section = view.book.sections?.[sectionOfDoc.get(doc)];
    const href = section?.resolveHref?.(raw) ?? raw;
    if (view.book.isExternal?.(href)) return;

    noteAnchor = anchorRect(doc, link);
    try {
      // `handle` n'attend de l'événement que `detail` et `preventDefault` : on
      // peut donc lui en fabriquer un depuis un survol aussi bien qu'un clic.
      await footnotes.handle(view.book, { detail: { a: link, href }, preventDefault() {} });
    } catch (error) {
      console.warn("Note illisible", error);
      hideNote();
    }
  }

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

    // Une page tournée sous une note ouverte laisserait l'infobulle orpheline.
    hideNote();
    markTocItem(detail.tocItem?.href ?? null);

    // Le CFI, lui, est toujours exploitable : c'est lui qui fait la reprise.
    if (entry && (fraction !== null || detail.cfi)) {
      onProgress?.(entry, fraction ?? entry.fraction ?? 0, detail.cfi ?? null);
    }
  }

  function close() {
    hideNote();
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
    view.addEventListener("load", (event) => {
      sectionOfDoc.set(event.detail.doc, event.detail.index);
      bindBookDocument(event.detail.doc);
    });
    // Un clic sur un appel de note ouvre la même infobulle, sans naviguer.
    view.addEventListener("link", (event) => {
      const link = event.detail.a;
      const doc = link?.ownerDocument;
      if (!doc) return;
      clearTimeout(hoverTimer);
      noteAnchor = anchorRect(doc, link);
      footnotes.handle(view.book, event)?.catch?.((error) => {
        console.warn("Note illisible", error);
        hideNote();
      });
    });
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

  /** `instanceof` ne traverse pas les royaumes : un <input> de l'iframe n'est
   *  pas une instance du HTMLInputElement du document parent. On regarde donc
   *  la balise, pas le constructeur. */
  function isTyping(target) {
    const tag = target?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable === true;
  }

  function onKey(event) {
    if (document.body.dataset.view !== "reader") return;
    if (isTyping(event.target)) return;

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
        if (!nodes.note.hidden) hideNote();
        else if (!nodes.toc.hidden) toggleToc(false);
        else wake();
        break;
      default:
    }
  }

  /** Un cran de molette envoie un événement, un geste de pavé tactile en envoie
   *  des dizaines. Sans bride, le livre part de vingt pages d'un coup. */
  let wheelLock = 0;
  function onWheel(event) {
    const delta =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 8) return;

    const now = Date.now();
    if (now - wheelLock < 340) return;
    wheelLock = now;
    turn(delta > 0 ? 1 : -1);
  }

  /** Clic sur les bords pour tourner, comme sur une liseuse. Les liens et les
   *  sélections en cours gardent la priorité. */
  function onClick(event) {
    if (event.target?.closest?.("a[href]")) return;
    const win = event.view ?? window;
    if (!win.getSelection?.()?.isCollapsed) return;

    const width = win.innerWidth || 1;
    if (event.clientX < width * 0.22) turn(-1);
    else if (event.clientX > width * 0.78) turn(1);
    else wake();
  }

  /** Le livre vit dans une iframe, et les événements n'en sortent pas : ni
   *  keydown ni wheel ne remontent au document parent. Il faut rebrancher les
   *  mêmes gestionnaires sur chaque section chargée — sans ça, tourner la page
   *  devient impossible dès qu'on a cliqué une fois dans le texte. */
  function bindBookDocument(doc) {
    doc.addEventListener("keydown", onKey);
    doc.addEventListener("wheel", onWheel, { passive: true });
    doc.addEventListener("click", onClick);
    doc.addEventListener("pointermove", wake);

    doc.addEventListener("mouseover", (event) => {
      const link = event.target?.closest?.("a[href]");
      if (!link) return;
      clearTimeout(hoverTimer);
      clearTimeout(hideTimer);
      hoverTimer = setTimeout(() => openFootnote(doc, link), HOVER_MS);
    });

    doc.addEventListener("mouseout", (event) => {
      if (!event.target?.closest?.("a[href]")) return;
      clearTimeout(hoverTimer);
      scheduleHide();
    });
  }

  nodes.page.addEventListener("pointermove", wake);
  nodes.page.addEventListener("wheel", onWheel, { passive: true });
  nodes.page.addEventListener("click", onClick);
  nodes.tocToggle.addEventListener("click", () => toggleToc());
  document.addEventListener("keydown", onKey);

  // On peut aller lire la note à la souris sans qu'elle se dérobe.
  nodes.note.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  nodes.note.addEventListener("mouseleave", scheduleHide);
  nodes.noteClose.addEventListener("click", hideNote);

  return { open, close, toggleToc, wake, turn, applyLayout, hideNote };
}
