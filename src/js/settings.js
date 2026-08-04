import { clear, el } from "./ui/dom.js";

export const DEFAULTS = {
  theme: "papier",
  accent: "ochre",
  font: "serif",
  size: 18,
  leading: 1.62,
  measure: 62,
  margin: 56,
};

const THEMES = [
  { id: "papier", label: "Papier", bg: "#f2f0ea", ink: "#16130f" },
  { id: "lin", label: "Lin", bg: "#e8e0cf", ink: "#2a2115" },
  { id: "nuit", label: "Nuit", bg: "#141414", ink: "#d6d2c8" },
  { id: "contraste", label: "Contraste", bg: "#ffffff", ink: "#000000" },
];

const ACCENTS = [
  { id: "yolk", label: "Yolk", hex: "#ffa51e" },
  { id: "ochre", label: "Ochre", hex: "#ff5500" },
  { id: "violet", label: "Violet", hex: "#7d00ff" },
  { id: "moss", label: "Moss", hex: "#00aa46" },
];

const FONTS = [
  { id: "serif", label: "Sérif", stack: '"Literata", Georgia, "Iowan Old Style", serif' },
  { id: "sans", label: "Sans", stack: '"Archivo", "Segoe UI", Arial, sans-serif' },
];

/** Le thème et l'accent sont des attributs (le CSS s'en charge) ; la typo de
 *  lecture passe par des variables, parce que foliate-js devra les relire pour
 *  les réinjecter dans l'iframe du livre. */
export function applySettings(settings) {
  const { body } = document;
  body.dataset.theme = settings.theme;
  body.dataset.accent = settings.accent;

  const root = document.documentElement.style;
  const font = FONTS.find((f) => f.id === settings.font) || FONTS[0];
  root.setProperty("--font-read", font.stack);
  root.setProperty("--read-size", `${settings.size}px`);
  root.setProperty("--read-leading", String(settings.leading));
  root.setProperty("--read-measure", `${settings.measure}ch`);
  root.setProperty("--read-margin", `${settings.margin}px`);
}

function row(label, hint, control) {
  return el(
    "div",
    { class: "set-row" },
    el(
      "div",
      {},
      el("p", { class: "set-row__label" }, label),
      hint ? el("p", { class: "set-row__hint" }, hint) : null,
    ),
    control,
  );
}

function group(title, ...rows) {
  return el("section", { class: "set-group" }, el("p", { class: "set-group__head" }, title), ...rows);
}

function pressGroup(container, pressed) {
  for (const child of container.children) {
    child.setAttribute("aria-pressed", String(child === pressed));
  }
}

function segmented(options, current, onPick) {
  const box = el("div", { class: "seg", role: "group" });
  for (const option of options) {
    const button = el(
      "button",
      {
        type: "button",
        "aria-pressed": String(option.id === current),
        onClick: () => {
          pressGroup(box, button);
          onPick(option.id);
        },
      },
      option.label,
    );
    box.append(button);
  }
  return box;
}

function slider({ label, min, max, step, value, format, onInput }) {
  const readout = el("span", { class: "stepper__value" }, format(value));
  const input = el("input", {
    class: "range",
    type: "range",
    min,
    max,
    step,
    value,
    "aria-label": label,
    onInput: (event) => {
      const next = Number(event.target.value);
      readout.textContent = format(next);
      onInput(next);
    },
  });
  return el("div", { class: "stepper" }, input, readout);
}

export function renderSettings(container, settings, onChange) {
  const set = (key) => (value) => {
    settings[key] = value;
    onChange(settings);
  };

  const accents = el("div", { class: "swatches", role: "group" });
  for (const accent of ACCENTS) {
    const button = el("button", {
      class: "swatch",
      type: "button",
      title: accent.label,
      "aria-label": `Accent ${accent.label}`,
      "aria-pressed": String(accent.id === settings.accent),
      style: { background: accent.hex },
      onClick: () => {
        pressGroup(accents, button);
        set("accent")(accent.id);
      },
    });
    accents.append(button);
  }

  const themes = el("div", { class: "swatches", role: "group" });
  for (const theme of THEMES) {
    const button = el(
      "button",
      {
        class: "theme-preview",
        type: "button",
        title: theme.label,
        "aria-label": `Thème ${theme.label}`,
        "aria-pressed": String(theme.id === settings.theme),
        style: { background: theme.bg },
        onClick: () => {
          pressGroup(themes, button);
          set("theme")(theme.id);
        },
      },
      el("span", { style: { background: theme.ink } }),
      el("span", { style: { background: theme.ink, width: "70%" } }),
      el("span", { style: { background: theme.ink, width: "85%" } }),
    );
    themes.append(button);
  }

  clear(container).append(
    group(
      "Apparence",
      row("Accent", "Une seule couleur vive à l'écran à la fois.", accents),
      row("Thème", "Ne change que la page de lecture, sauf Nuit.", themes),
    ),
    group(
      "Lecture",
      row("Police", null, segmented(FONTS, settings.font, set("font"))),
      row(
        "Taille",
        null,
        slider({
          label: "Taille du texte",
          min: 14,
          max: 28,
          step: 1,
          value: settings.size,
          format: (v) => `${v} px`,
          onInput: set("size"),
        }),
      ),
      row(
        "Interligne",
        null,
        slider({
          label: "Interligne",
          min: 1.2,
          max: 2.2,
          step: 0.02,
          value: settings.leading,
          format: (v) => v.toFixed(2),
          onInput: set("leading"),
        }),
      ),
      row(
        "Largeur",
        "Longueur de ligne. Autour de 60 signes, l'œil ne se perd pas.",
        slider({
          label: "Largeur de la colonne",
          min: 40,
          max: 96,
          step: 1,
          value: settings.measure,
          format: (v) => `${v} signes`,
          onInput: set("measure"),
        }),
      ),
      row(
        "Marges",
        null,
        slider({
          label: "Marges",
          min: 24,
          max: 104,
          step: 4,
          value: settings.margin,
          format: (v) => `${v} px`,
          onInput: set("margin"),
        }),
      ),
    ),
    group("À propos", row("MontLivre", "Version 2.0.0 — hors ligne, sans compte.", el("span", {}))),
  );
}
