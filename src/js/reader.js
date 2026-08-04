import { clear, el } from "./ui/dom.js";

const IDLE_MS = 2400;

/** Le lecteur.
 *
 *  Jalon 2 : la page est un simple bloc défilant, le temps de valider la
 *  typographie et le comportement du chrome. Au jalon 3, `renderBody` et la
 *  paire `next`/`prev` passent la main à <foliate-view> ; tout le reste
 *  (immersion, sommaire, rail de progression) reste tel quel.
 */
export function createReader(nodes, { onProgress } = {}) {
  let book = null;
  let idleTimer = 0;

  function setImmersive(on) {
    document.body.classList.toggle("is-immersive", on && nodes.toc.hidden);
  }

  function wake() {
    setImmersive(false);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setImmersive(true), IDLE_MS);
  }

  function reportProgress() {
    const { scrollTop, scrollHeight, clientHeight } = nodes.page;
    const travel = Math.max(1, scrollHeight - clientHeight);
    const fraction = Math.min(1, Math.max(0, scrollTop / travel));

    nodes.fill.style.width = `${(fraction * 100).toFixed(2)}%`;
    nodes.folio.textContent = `${Math.round(fraction * 100)} %`;
    if (book) onProgress?.(book, fraction);
  }

  function renderToc(toc = []) {
    clear(nodes.tocList);
    nodes.tocToggle.hidden = toc.length === 0;

    toc.forEach((entry, index) => {
      nodes.tocList.append(
        el(
          "li",
          {},
          el(
            "button",
            {
              class: "toc__link",
              type: "button",
              "data-depth": String(entry.depth || 0),
              onClick: () => {
                goToSection(index);
                toggleToc(false);
              },
            },
            entry.label,
          ),
        ),
      );
    });
  }

  function goToSection(index) {
    const target = nodes.page.querySelectorAll("[data-section]")[index];
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleToc(open = nodes.toc.hidden) {
    nodes.toc.hidden = !open;
    nodes.tocToggle.setAttribute("aria-expanded", String(open));
    if (open) setImmersive(false);
    else wake();
  }

  function renderBody(loaded) {
    const body = el("div", { class: "page__body" });
    for (const section of loaded.sections || []) {
      body.append(el("h2", { "data-section": "" }, section.title));
      for (const paragraph of section.paragraphs) body.append(el("p", {}, paragraph));
    }
    clear(nodes.page).append(body);
    nodes.page.scrollTop = 0;
  }

  function turn(direction) {
    nodes.page.scrollBy({ top: direction * nodes.page.clientHeight * 0.92, behavior: "smooth" });
    setImmersive(true);
  }

  function open(next) {
    book = next;
    nodes.title.textContent = next.title;
    renderToc(next.toc);
    renderBody(next);
    toggleToc(false);
    reportProgress();
    if (next.fraction) {
      // Laisse la mise en page se poser avant de sauter à la position reprise.
      requestAnimationFrame(() => {
        nodes.page.scrollTop = next.fraction * (nodes.page.scrollHeight - nodes.page.clientHeight);
        reportProgress();
      });
    }
    wake();
  }

  nodes.page.addEventListener("scroll", reportProgress, { passive: true });
  nodes.page.addEventListener("pointermove", wake);
  nodes.tocToggle.addEventListener("click", () => toggleToc());

  function onKey(event) {
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
        return;
    }
  }

  document.addEventListener("keydown", onKey);

  return { open, toggleToc, wake, turn };
}
