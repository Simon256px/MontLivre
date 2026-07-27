'use strict';

/* ═══════════ Utilitaires & état partagé ═══════════
   Scripts classiques chargés dans l'ordre : les déclarations
   top-level sont partagées entre tous les fichiers js/.        */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const debounce = (fn, ms) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};
const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const basename = (p) => p.split(/[\\/]/).pop();
const snippet = (t, n) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t);
// Minuscules sans accents, avec table de correspondance vers les
// offsets d'origine (NFD peut changer la longueur de la chaîne)
function foldWithMap(str) {
  let out = '';
  const map = [];
  for (let i = 0; i < str.length; i++) {
    const f = str[i].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const ch of f) { out += ch; map.push(i); }
  }
  return { out, map };
}

const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc =
  new URL('../../node_modules/pdfjs-dist/build/pdf.worker.min.js', location.href).href;
// Les Worker file:// sont refusés par Chromium : pdf.js retombe alors sur un
// « fake worker » qui décode sur le thread UI et gèle l'app sur les gros PDF.
// On charge donc le code du worker en blob: pour garantir un vrai thread.
const pdfWorkerReady = (async () => {
  try {
    const code = await (await fetch(pdfjsLib.GlobalWorkerOptions.workerSrc)).text();
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  } catch (e) {
    console.error('[pdf] worker blob impossible, fallback fake worker', e);
  }
})();
const PDF_OPTS = {
  isEvalSupported: false, // neutralise CVE-2024-4367 (JS via polices piégées)
  standardFontDataUrl: new URL('../../node_modules/pdfjs-dist/standard_fonts/', location.href).href,
  cMapUrl: new URL('../../node_modules/pdfjs-dist/cmaps/', location.href).href,
  cMapPacked: true,
};

const GAP = 64; // espace entre deux colonnes-pages
const CACHE_V = 6; // à incrémenter quand la logique d'extraction change

// Marqueurs sentinelles insérés pendant l'extraction pour repérer les
// appels de note, puis convertis en offsets par extractNoteMarkers().
const NOTE_OPEN = '\uE000';
const NOTE_SEP = '\uE001';
const NOTE_CLOSE = '\uE002';
function makeNoteMarker(key, visible) {
  return NOTE_OPEN + key + NOTE_SEP + visible + NOTE_CLOSE;
}
// Remplace les marqueurs par leur texte visible et renvoie
// { text, refs: [{ start, end, key }] } (offsets dans le texte final)
function extractNoteMarkers(text) {
  const refs = [];
  const re = new RegExp(NOTE_OPEN + '([^' + NOTE_SEP + ']*)' + NOTE_SEP + '([^' + NOTE_CLOSE + ']*)' + NOTE_CLOSE);
  let m;
  while ((m = re.exec(text))) {
    refs.push({ start: m.index, end: m.index + m[2].length, key: m[1] });
    text = text.slice(0, m.index) + m[2] + text.slice(m.index + m[0].length);
  }
  return { text, refs };
}
const THEME_PRESETS = [
  { id: 'creme', label: 'Ivoire', description: 'Clair, doux et neutre', scheme: 'light' },
  { id: 'sepia', label: 'Lin', description: 'Chaleur d’un papier ancien', scheme: 'light' },
  { id: 'sauge', label: 'Sauge', description: 'Une lumière calme et végétale', scheme: 'light' },
  { id: 'ambre', label: 'Ambre', description: 'Soirée sans lumière bleue', scheme: 'dark' },
  { id: 'nuit', label: 'Minuit', description: 'Sombre, frais et équilibré', scheme: 'dark' },
  { id: 'contraste', label: 'Contraste', description: 'Noir sur blanc, sans texture', scheme: 'light' },
  { id: 'perso', label: 'Sur mesure', description: 'Votre palette personnelle', scheme: 'custom' },
];
const TEXTURE_PRESETS = [
  { id: 'none', label: 'Lisse', description: 'Aucun relief' },
  { id: 'paper', label: 'Papier doux', description: 'Grain très fin' },
  { id: 'fibers', label: 'Fibres', description: 'Trame naturelle' },
];
const THEMES = THEME_PRESETS.map((t) => t.id);
const TEXTURES = TEXTURE_PRESETS.map((t) => t.id);
const ACCENTS = ['var(--yellow)', 'var(--blue)', 'var(--green)', 'var(--red)', 'var(--pink)', 'var(--purple)'];
const HL_COLORS = ['yellow', 'green', 'blue', 'pink'];
const FONTS = {
  literata: "'Literata', Georgia, serif",
  atkinson: "'Atkinson Hyperlegible', 'Segoe UI', sans-serif",
  plex: "'IBM Plex Serif', Georgia, serif",
  opendyslexic: "'OpenDyslexic', 'Comic Sans MS', sans-serif",
  manrope: "'Manrope', 'Segoe UI', sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  palatino: "'Palatino Linotype', 'Book Antiqua', Georgia, serif",
  segoe: "'Segoe UI', system-ui, sans-serif",
};
const DEFAULT_SETTINGS = {
  theme: 'creme',
  font: 'literata',
  fontSize: 19,
  lineHeight: 1.75,
  pageWidth: 620,
  justify: true,
  pageMargin: 46, // marge horizontale de la page (px)
  pageSound: false, // son de tournage de page
  bionic: false,
  bionicIntensity: 0.45,
  focus: 'off',        // 'off' | 'ruler' (règle) | 'para' (paragraphe)
  instantHl: false,    // surlignage instantané à la sélection
  lastHlColor: 'yellow',
  flow: 'pages',   // 'pages' | 'scroll'
  spread: 'auto',  // 'auto' | '1' | '2'
  rsvpWpm: 350,
  dictOnline: false, // dictionnaire Wiktionnaire (requête réseau) — opt-in
  dailyGoalMin: 20,  // objectif de lecture quotidien en minutes (0 = off)
  pomodoroFocus: 25, // durée d'une session de lecture (minutes)
  pomodoroBreak: 5,  // durée d'une pause (minutes)
  pageAnim: 'slide', // 'slide' | 'curl' | 'none'
  bookDesign: true,  // mise en page d'auteur : chapitres, lettrines, ornements
  texture: 'paper',  // 'none' | 'paper' | 'fibers'
  textureIntensity: 0.42, // 0–1, reste indépendant de la palette
  custom: { bg: '#EAE4D3', paper: '#F7F1E1', ink: '#2A2620' }, // thème sur mesure
  customFonts: [],   // [{ name, data(base64) }] polices importées
};

// #rrggbb → "r, g, b"
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : '0, 0, 0';
}

function validHex(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex || '');
}

function hexChannels(hex) {
  const safe = validHex(hex) ? hex : '#000000';
  return [1, 3, 5].map((i) => parseInt(safe.slice(i, i + 2), 16));
}

function relativeLuminance(hex) {
  const rgb = hexChannels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function mixHex(a, b, amountA) {
  const ca = hexChannels(a);
  const cb = hexChannels(b);
  const p = Math.max(0, Math.min(1, amountA));
  const out = ca.map((v, i) => Math.round(v * p + cb[i] * (1 - p)));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Un texte secondaire reste volontairement discret, sans descendre sous AA
// sur aucune des surfaces où l'interface peut l'afficher.
function accessibleMuted(ink, paper, ...otherBackgrounds) {
  const backgrounds = [paper, ...otherBackgrounds];
  if (backgrounds.some((background) => contrastRatio(ink, background) < 4.5)) {
    return ink;
  }
  for (let step = 55; step <= 100; step += 5) {
    const weight = step / 100;
    const candidate = mixHex(ink, paper, weight);
    if (backgrounds.every((background) => contrastRatio(candidate, background) >= 4.5)) {
      return candidate;
    }
  }
  return ink;
}

function safestTextColor(background) {
  return contrastRatio('#000000', background) >= contrastRatio('#FFFFFF', background)
    ? '#000000'
    : '#FFFFFF';
}

let store = { version: 2, settings: { ...DEFAULT_SETTINGS }, books: [], stats: { daily: {} }, achievements: {} };
// { book, paras, page, total, totalCols, cols, colW, furthestProg, toc }
let current = null;
let timerId = null;
let searchState = { active: false, q: '', results: [], idx: 0 };

const persist = debounce(() => {
  // Vérifie les succès à chaque sauvegarde : ils dépendent des mêmes données
  if (typeof checkAchievements === 'function') checkAchievements();
  window.livre.saveStore(store);
}, 500);
// Écriture immédiate (fermeture de fenêtre, sortie du lecteur) : garantit
// que la position de lecture n'est jamais perdue.
function flushStore() {
  try { window.livre.saveStore(store); } catch {}
}

function todayKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('sv-SE'); // YYYY-MM-DD local
}
function bumpDaily(field, amount) {
  const k = todayKey();
  const day = store.stats.daily[k] || (store.stats.daily[k] = { seconds: 0, words: 0 });
  day[field] += amount;
}

function fmtTime(sec) {
  if (!sec || sec < 60) return sec ? '< 1 min' : '0 min';
  const totalMinutes = Math.round(sec / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}
function fmtDur(mins) {
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`;
}

function readerVisible() {
  return !$('#readerScreen').classList.contains('hidden');
}
function switchScreen(name) {
  $('#libraryScreen').classList.toggle('hidden', name !== 'library');
  $('#readerScreen').classList.toggle('hidden', name !== 'reader');
  updateFocusRuler();
}
// Interruption d'un chargement long : levée depuis les boucles
// d'extraction quand l'utilisateur clique sur « Interrompre »
let loadCancelled = false;
class CancelledError extends Error {
  constructor() { super('chargement interrompu'); this.name = 'CancelledError'; }
}
function throwIfCancelled() {
  if (loadCancelled) throw new CancelledError();
}
// Rend une promesse longue (page pdf.js…) interruptible : surveille le
// drapeau d'annulation pendant l'attente et rejette immédiatement.
function cancellable(promise) {
  return new Promise((resolve, reject) => {
    const iv = setInterval(() => {
      if (loadCancelled) { clearInterval(iv); reject(new CancelledError()); }
    }, 150);
    promise.then(
      (v) => { clearInterval(iv); resolve(v); },
      (e) => { clearInterval(iv); reject(e); }
    );
  });
}
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

function showLoader(text, { progress = false, cancelable = false } = {}) {
  $('#loaderText').textContent = text;
  $('#loaderBar').classList.toggle('hidden', !progress);
  $('#loaderCancel').classList.toggle('hidden', !cancelable);
  if (progress) $('#loaderFill').style.width = '0%';
  $('#loader').classList.remove('hidden');
}
function setProgress(done, total, text) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  $('#loaderFill').style.width = pct + '%';
  if (text) $('#loaderText').textContent = `${text} · ${pct} %`;
}
function hideLoader() {
  $('#loader').classList.add('hidden');
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

function bionify(text, intensity) {
  return text.split(/(\s+)/).map((tok) => {
    if (!tok || /^\s+$/.test(tok)) return tok;
    const m = tok.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}’'-]+)(.*)$/u);
    if (!m) return esc(tok);
    const [, pre, word, post] = m;
    const n = Math.max(1, Math.min(word.length, Math.round(word.length * intensity)));
    return esc(pre) + '<b>' + esc(word.slice(0, n)) + '</b>' + esc(word.slice(n)) + esc(post);
  }).join('');
}
