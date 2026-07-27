'use strict';

/* ═══════════ Bibliothèque & statistiques ═══════════ */

let libraryQuery = '';
let libraryFilter = { shelf: 'all', tag: null };

// Étagère automatique d'un livre selon son avancement
function bookShelf(b) {
  const p = b.progress || 0;
  if (p <= 0) return 'unread';
  if (p >= 1) return 'done';
  return 'reading';
}

// Renvoie les ids des livres correspondant aux chemins (ajoutés ou déjà présents)
async function addBooks(paths) {
  const ids = [];
  loadCancelled = false;
  for (const p of paths) {
    const existing = store.books.find((b) => b.path === p);
    if (existing) { ids.push(existing.id); continue; }
    showLoader(`Ouverture de ${basename(p)}…`, { cancelable: true });
    try {
      throwIfCancelled();
      const format = /\.epub$/i.test(p) ? 'epub' : 'pdf';
      const buf = await window.livre.readFile(p);
      throwIfCancelled();
      let title = basename(p).replace(/\.(pdf|epub)$/i, '');
      let author = '';
      let cover = null;
      let pages = 0;
      if (format === 'epub') {
        const { zip, opf, opfDir } = await epubOpen(buf);
        const meta = await epubMeta(zip, opf, opfDir);
        title = meta.title || title;
        author = meta.author || '';
        cover = meta.cover;
        pages = opf.getElementsByTagNameNS('*', 'itemref').length;
      } else {
        await pdfWorkerReady;
        const pdf = await cancellable(pdfjsLib.getDocument({ data: new Uint8Array(buf), ...PDF_OPTS }).promise);
        const meta = await pdf.getMetadata().catch(() => null);
        title = String(meta?.info?.Title || '').trim() || title;
        author = String(meta?.info?.Author || '').trim();
        cover = await renderCover(pdf);
        pages = pdf.numPages;
        pdf.destroy();
      }
      const id = crypto.randomUUID();
      ids.push(id);
      store.books.push({
        id,
        path: p,
        format,
        title,
        author,
        pages,
        cover,
        words: null,
        progress: 0,
        anchor: null,
        readingSeconds: 0,
        annotations: [],
        bookmarks: [],
        sketches: [],
        favorite: false,
        tags: [],
        addedAt: Date.now(),
        lastOpenedAt: 0,
      });
    } catch (e) {
      if (e instanceof CancelledError) { toast('Ajout interrompu'); break; }
      console.error(e);
      alert(`Impossible d'ouvrir « ${basename(p)} » : ${e.message || e}`);
    }
  }
  hideLoader();
  persist();
  renderLibrary();
  return ids;
}

function removeBook(id) {
  const book = store.books.find((b) => b.id === id);
  if (!book) return;
  if (!confirm(`Retirer « ${book.title} » de la bibliothèque ?\n(Le fichier n'est pas supprimé.)`)) return;
  store.books = store.books.filter((b) => b.id !== id);
  window.livre.deleteCache(id);
  persist();
  renderLibrary();
}

function renderShelfBar() {
  $$('#shelfBar .shelf').forEach((btn) =>
    btn.classList.toggle('active', btn.dataset.shelf === libraryFilter.shelf));
  // puces de tags (union de tous les tags)
  const all = new Set();
  for (const b of store.books) for (const t of (b.tags || [])) all.add(t);
  const tags = [...all].sort((a, b) => a.localeCompare(b, 'fr'));
  $('#tagChips').innerHTML = tags.map((t) =>
    `<button class="pill tagchip${libraryFilter.tag === t ? ' active' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`
  ).join('');
}

function renderLibrary() {
  renderStatsPanel();
  renderShelfBar();
  const grid = $('#bookGrid');
  const fold = (s) => foldWithMap(s).out;
  const q = fold(libraryQuery.trim());
  let books = [...store.books].sort(
    (a, b) => (b.lastOpenedAt || b.addedAt) - (a.lastOpenedAt || a.addedAt)
  );
  if (libraryFilter.shelf === 'fav') books = books.filter((b) => b.favorite);
  else if (libraryFilter.shelf !== 'all') books = books.filter((b) => bookShelf(b) === libraryFilter.shelf);
  if (libraryFilter.tag) books = books.filter((b) => (b.tags || []).includes(libraryFilter.tag));
  if (q) books = books.filter((b) => fold(b.title + ' ' + (b.author || '') + ' ' + (b.tags || []).join(' ')).includes(q));

  $('#emptyState').classList.toggle('hidden', store.books.length > 0);

  const totalSec = store.books.reduce((n, b) => n + (b.readingSeconds || 0), 0);
  const filtered = q || libraryFilter.tag || libraryFilter.shelf !== 'all';
  $('#libStats').textContent = store.books.length
    ? (filtered
        ? `${books.length} livre${books.length > 1 ? 's' : ''} affiché${books.length > 1 ? 's' : ''}`
        : `${store.books.length} livre${store.books.length > 1 ? 's' : ''} · ${fmtTime(totalSec)} de lecture au total`)
    : 'Ta bibliothèque est vide';

  grid.innerHTML = books.map((b, i) => {
    const accent = ACCENTS[i % ACCENTS.length];
    const pct = Math.round((b.progress || 0) * 100);
    const cover = b.cover
      ? `<img src="${b.cover}" alt="">`
      : `<span class="letter">${esc((b.title[0] || '?').toUpperCase())}</span>`;
    const unit = b.format === 'epub' ? 'sections' : 'pages';
    const started = b.progress > 0 && b.progress < 1;
    const resume = started ? `<button class="resume" title="Reprendre la lecture">▶</button>` : '';
    const meta = started
      ? `${b.pages} ${unit} · reprendre à ${pct} %`
      : `${b.pages} ${unit} · ${fmtTime(b.readingSeconds)}${pct >= 100 ? ' · terminé ✦' : ''}`;
    const tags = (b.tags || []).map((t) => `<span class="ctag">${esc(t)}</span>`).join('');
    return `<article class="book-card" data-id="${b.id}">
      <div class="cover" style="background:${b.cover ? 'var(--bg)' : accent}">${cover}${resume}<span class="format">${b.format}</span></div>
      <button class="fav${b.favorite ? ' on' : ''}" title="Favori">★</button>
      <button class="del" title="Retirer de la bibliothèque">✕</button>
      <h3>${esc(b.title)}</h3>
      <p class="meta">${meta}</p>
      <div class="progress"><div class="fill" style="width:${pct}%"></div></div>
      <div class="cardtags">${tags}<button class="tagedit" title="Modifier les tags">🏷</button></div>
    </article>`;
  }).join('');

  $$('.book-card', grid).forEach((card) => {
    const id = card.dataset.id;
    card.addEventListener('click', () => openBook(id));
    $('.del', card).addEventListener('click', (e) => { e.stopPropagation(); removeBook(id); });
    $('.fav', card).addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(id); });
    $('.tagedit', card).addEventListener('click', (e) => { e.stopPropagation(); editTags(id); });
    const resumeBtn = $('.resume', card);
    if (resumeBtn) resumeBtn.addEventListener('click', (e) => { e.stopPropagation(); openBook(id); });
  });
}

function toggleFavorite(id) {
  const b = store.books.find((x) => x.id === id);
  if (!b) return;
  b.favorite = !b.favorite;
  persist();
  renderLibrary();
}

function editTags(id) {
  const b = store.books.find((x) => x.id === id);
  if (!b) return;
  const input = prompt(`Tags pour « ${b.title} »\n(séparés par des virgules)`, (b.tags || []).join(', '));
  if (input === null) return;
  b.tags = [...new Set(input.split(',').map((t) => t.trim()).filter(Boolean))];
  if (libraryFilter.tag && !store.books.some((x) => (x.tags || []).includes(libraryFilter.tag))) {
    libraryFilter.tag = null; // le tag filtré n'existe plus
  }
  persist();
  renderLibrary();
}

/* ---------- Import / export de la bibliothèque ---------- */

function importedText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.replace(/\0/g, '').trim() || fallback;
}

function importedNumber(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function importedId(value) {
  return typeof value === 'string' && /^[a-z0-9-]{1,100}$/i.test(value)
    ? value
    : crypto.randomUUID();
}

function importedImage(value, types) {
  if (typeof value !== 'string') return null;
  const re = new RegExp(`^data:image/(?:${types});base64,[a-z0-9+/=]+$`, 'i');
  return re.test(value) ? value : null;
}

function sanitizeImportedAnnotation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const para = Math.floor(importedNumber(value.para, -1, -1));
  const start = Math.floor(importedNumber(value.start, -1, -1));
  const end = Math.floor(importedNumber(value.end, -1, -1));
  if (para < 0 || start < 0 || end <= start) return null;
  return {
    id: importedId(value.id),
    para,
    start,
    end,
    color: HL_COLORS.includes(value.color) ? value.color : 'yellow',
    note: importedText(value.note),
    text: importedText(value.text),
    created: importedNumber(value.created, Date.now()),
  };
}

function sanitizeImportedBookmark(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const para = Math.floor(importedNumber(value.para, -1, -1));
  if (para < 0) return null;
  return {
    id: importedId(value.id),
    para,
    label: importedText(value.label, 'Signet'),
    created: importedNumber(value.created, Date.now()),
  };
}

function sanitizeImportedSketch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const para = Math.floor(importedNumber(value.para, -1, -1));
  const image = importedImage(value.image, 'png');
  if (para < 0 || !image) return null;
  return {
    id: importedId(value.id),
    para,
    image,
    created: importedNumber(value.created, Date.now()),
  };
}

function sanitizeImportedBook(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const filePath = importedText(value.path);
  if (!filePath || !/\.(pdf|epub)$/i.test(filePath)) return null;
  const format = value.format === 'epub' || /\.epub$/i.test(filePath) ? 'epub' : 'pdf';
  const title = importedText(value.title,
    basename(filePath).replace(/\.(pdf|epub)$/i, '') || 'Sans titre');
  const tags = Array.isArray(value.tags)
    ? [...new Set(value.tags
        .map((t) => importedText(t).replace(/["<>]/g, '').slice(0, 80))
        .filter(Boolean))]
    : [];
  const annotations = Array.isArray(value.annotations)
    ? value.annotations.map(sanitizeImportedAnnotation).filter(Boolean)
    : [];
  const bookmarks = Array.isArray(value.bookmarks)
    ? value.bookmarks.map(sanitizeImportedBookmark).filter(Boolean)
    : [];
  const sketches = Array.isArray(value.sketches)
    ? value.sketches.map(sanitizeImportedSketch).filter(Boolean)
    : [];
  return {
    id: importedId(value.id),
    path: filePath,
    format,
    title,
    author: importedText(value.author),
    pages: Math.floor(importedNumber(value.pages)),
    cover: importedImage(value.cover, 'png|jpe?g|gif|webp|svg\\+xml'),
    words: value.words == null ? null : Math.floor(importedNumber(value.words)),
    progress: importedNumber(value.progress, 0, 0, 1),
    anchor: value.anchor == null ? null : Math.floor(importedNumber(value.anchor)),
    readingSeconds: Math.floor(importedNumber(value.readingSeconds)),
    annotations,
    bookmarks,
    sketches,
    favorite: value.favorite === true,
    tags,
    addedAt: importedNumber(value.addedAt, Date.now()),
    lastOpenedAt: importedNumber(value.lastOpenedAt),
    companionPos: importedNumber(value.companionPos, 0, 0, 1),
  };
}

function mergeImportedItems(currentItems, importedItems, fingerprint) {
  const out = Array.isArray(currentItems)
    ? currentItems.filter((item) => item && typeof item === 'object')
    : [];
  const ids = new Set(out.map((item) => item && item.id).filter(Boolean));
  const contents = new Set(out.map(fingerprint));
  for (const item of importedItems) {
    const content = fingerprint(item);
    if (ids.has(item.id) || contents.has(content)) continue;
    out.push(item);
    ids.add(item.id);
    contents.add(content);
  }
  return out;
}

function normalizeImportedSettings(raw) {
  const custom = raw && raw.custom && typeof raw.custom === 'object' && !Array.isArray(raw.custom)
    ? raw.custom : {};
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(raw || {}),
    custom: { ...DEFAULT_SETTINGS.custom, ...custom },
    // Une sauvegarde antérieure à l'import de polices ne possède pas encore
    // ce champ : conserver alors les polices déjà présentes sur ce profil.
    customFonts: Array.isArray(raw && raw.customFonts)
      ? raw.customFonts
      : (typeof store !== 'undefined' && Array.isArray(store.settings?.customFonts)
          ? store.settings.customFonts : DEFAULT_SETTINGS.customFonts),
  };

  // Premier passage portable pour les anciennes versions ; il filtre aussi
  // les champs que le normaliseur global éventuel ne connaît pas.
  const enumValue = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
  if (typeof merged.focus === 'boolean') merged.focus = merged.focus ? 'ruler' : 'off';
  if (merged.spread === 1 || merged.spread === 2) merged.spread = String(merged.spread);
  merged.theme = enumValue(merged.theme, THEMES, DEFAULT_SETTINGS.theme);
  merged.flow = enumValue(merged.flow, ['pages', 'scroll'], DEFAULT_SETTINGS.flow);
  merged.spread = enumValue(merged.spread, ['auto', '1', '2'], DEFAULT_SETTINGS.spread);
  merged.pageAnim = enumValue(merged.pageAnim, ['slide', 'curl', 'none'], DEFAULT_SETTINGS.pageAnim);
  merged.focus = enumValue(merged.focus, ['off', 'ruler', 'para'], DEFAULT_SETTINGS.focus);
  merged.lastHlColor = enumValue(merged.lastHlColor, HL_COLORS, DEFAULT_SETTINGS.lastHlColor);
  if (typeof TEXTURES !== 'undefined') {
    merged.texture = enumValue(merged.texture, TEXTURES, DEFAULT_SETTINGS.texture);
  }
  for (const key of ['justify', 'pageSound', 'bionic', 'instantHl', 'dictOnline', 'bookDesign']) {
    merged[key] = typeof merged[key] === 'boolean' ? merged[key] : DEFAULT_SETTINGS[key];
  }
  const limits = {
    fontSize: [12, 40], lineHeight: [1.1, 3], pageWidth: [320, 1200],
    pageMargin: [12, 160], bionicIntensity: [0.1, 1], rsvpWpm: [50, 2000],
    dailyGoalMin: [0, 600], pomodoroFocus: [1, 180], pomodoroBreak: [1, 60],
    textureIntensity: [0, 1],
  };
  for (const [key, [min, max]] of Object.entries(limits)) {
    if (DEFAULT_SETTINGS[key] !== undefined) {
      merged[key] = importedNumber(merged[key], DEFAULT_SETTINGS[key], min, max);
    }
  }
  for (const key of ['bg', 'paper', 'ink']) {
    if (!/^#[0-9a-f]{6}$/i.test(merged.custom[key] || '')) {
      merged.custom[key] = DEFAULT_SETTINGS.custom[key];
    }
  }
  const fonts = Array.isArray(merged.customFonts) ? merged.customFonts : [];
  merged.customFonts = fonts.flatMap((font) => {
    if (!font || typeof font !== 'object') return [];
    const name = importedText(font.name).replace(/["<>]/g, '').slice(0, 80);
    const data = typeof font.data === 'string' && /^[a-z0-9+/=]+$/i.test(font.data)
      ? font.data : '';
    return name && data ? [{ name, data }] : [];
  }).filter((font, i, all) => all.findIndex((f) => f.name === font.name) === i);
  const customName = typeof merged.font === 'string' && merged.font.startsWith('custom:')
    ? merged.font.slice(7) : null;
  if (!Object.hasOwn(FONTS, merged.font) &&
      (!customName || !merged.customFonts.some((font) => font.name === customName))) {
    merged.font = DEFAULT_SETTINGS.font;
  }
  if (typeof normalizeSettings === 'function') {
    store.settings = merged;
    return normalizeSettings();
  }
  return merged;
}

async function exportLibrary() {
  const data = {
    app: 'montlivre',
    exportedAt: new Date().toISOString(),
    version: store.version,
    settings: store.settings,
    stats: store.stats,
    achievements: store.achievements,
    books: store.books,
  };
  const stamp = new Date().toISOString().slice(0, 10);
  const path = await window.livre.exportFile({
    defaultName: `Bibliotheque MontLivre - ${stamp}.json`,
    content: JSON.stringify(data, null, 2),
    kind: 'json',
  });
  if (path) toast(`Bibliothèque exportée : ${basename(path)}`);
}

async function importLibrary() {
  const picked = await window.livre.importFile({ kind: 'json' });
  if (!picked) return;
  let data;
  try {
    data = JSON.parse(picked.content);
  } catch {
    alert("Fichier illisible : ce n'est pas un export de bibliothèque valide.");
    return;
  }
  // « livre » : sauvegardes d'avant le renommage en MontLivre
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      !['montlivre', 'livre'].includes(data.app) || !Array.isArray(data.books)) {
    alert("Ce fichier n'est pas un export de bibliothèque MontLivre.");
    return;
  }
  let added = 0, merged = 0, ignored = 0;
  for (const rawBook of data.books) {
    const ib = sanitizeImportedBook(rawBook);
    if (!ib) { ignored++; continue; }
    const existing = store.books.find((b) => b.id === ib.id || b.path === ib.path);
    if (existing) {
      // Fusion additive : une restauration ne doit jamais effacer les notes
      // ou croquis créés depuis la sauvegarde importée.
      existing.annotations = mergeImportedItems(
        existing.annotations, ib.annotations,
        (a) => `${a.para}:${a.start}:${a.end}:${a.color}:${a.text}:${a.note || ''}`
      );
      existing.bookmarks = mergeImportedItems(
        existing.bookmarks, ib.bookmarks,
        (bm) => `${bm.para}:${bm.label}`
      );
      existing.sketches = mergeImportedItems(
        existing.sketches, ib.sketches,
        (sk) => `${sk.para}:${sk.image}`
      );
      existing.tags = [...new Set([...(existing.tags || []), ...(ib.tags || [])])];
      existing.favorite = existing.favorite || ib.favorite;
      if ((ib.lastOpenedAt || 0) > (existing.lastOpenedAt || 0)) {
        existing.progress = ib.progress;
        existing.anchor = ib.anchor;
        existing.lastOpenedAt = ib.lastOpenedAt;
      }
      existing.readingSeconds = Math.max(existing.readingSeconds || 0, ib.readingSeconds || 0);
      merged++;
    } else {
      store.books.push(ib);
      added++;
    }
  }
  if (data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)) {
    store.settings = normalizeImportedSettings(data.settings);
    if (typeof registerCustomFont === 'function') {
      const validFonts = [];
      for (const font of store.settings.customFonts || []) {
        if (await registerCustomFont(font.name, font.data)) validFonts.push(font);
      }
      store.settings.customFonts = validFonts;
      if (typeof normalizeSettings === 'function') store.settings = normalizeSettings(store.settings);
    }
    if (typeof rebuildFontSelect === 'function') rebuildFontSelect();
    if (typeof syncControls === 'function') syncControls();
    if (current && readerVisible() && typeof relayout === 'function') relayout();
  }
  if (data.achievements && typeof data.achievements === 'object' && !Array.isArray(data.achievements)) {
    store.achievements = { ...data.achievements, ...store.achievements };
  }
  // stats : on prend le max par jour (évite de doubler lors d'une restauration)
  if (data.stats && data.stats.daily && typeof data.stats.daily === 'object') {
    for (const [day, d] of Object.entries(data.stats.daily)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !d || typeof d !== 'object') continue;
      const cur = store.stats.daily[day] || { seconds: 0, words: 0 };
      store.stats.daily[day] = {
        seconds: Math.max(importedNumber(cur.seconds), importedNumber(d.seconds)),
        words: Math.max(importedNumber(cur.words), importedNumber(d.words)),
      };
    }
  }
  persist();
  renderLibrary();
  toast(`Import terminé : ${added} ajouté(s), ${merged} fusionné(s)` +
    (ignored ? `, ${ignored} ignoré(s)` : ''));
}

function setShelf(shelf) {
  libraryFilter.shelf = shelf;
  renderLibrary();
}
function setTagFilter(tag) {
  libraryFilter.tag = libraryFilter.tag === tag ? null : tag;
  renderLibrary();
}

/* ---------- Statistiques quotidiennes ---------- */

function currentStreak() {
  const daily = store.stats.daily;
  let streak = 0;
  let offset = daily[todayKey()]?.seconds > 0 ? 0 : -1;
  while (daily[todayKey(offset)]?.seconds > 0) {
    streak++;
    offset--;
  }
  return streak;
}

function renderStatsPanel() {
  const daily = store.stats.daily;
  const today = daily[todayKey()] || { seconds: 0, words: 0 };
  renderGoalRing(today.seconds);
  $('#statStreak').textContent = currentStreak() + ' j';

  // vitesse moyenne sur les 30 derniers jours
  let secs = 0, words = 0;
  for (let o = 0; o > -30; o--) {
    const d = daily[todayKey(o)];
    if (d) { secs += d.seconds; words += d.words; }
  }
  $('#statWpm').textContent = secs >= 120 && words > 0 ? String(Math.round(words / (secs / 60))) : '—';

  // mini graphique des 14 derniers jours, avec ligne d'objectif
  const chart = $('#statChart');
  const days = [];
  for (let o = -13; o <= 0; o++) days.push(daily[todayKey(o)]?.seconds || 0);
  const goalSec = (store.settings.dailyGoalMin || 0) * 60;
  const max = Math.max(600, goalSec, ...days); // échelle mini : 10 min
  const bars = days.map((sec, i) => {
    const h = Math.max(3, Math.round((sec / max) * 40));
    const reached = goalSec > 0 && sec >= goalSec;
    const cls = sec === 0 ? 'empty' : (i === 13 ? 'today' : (reached ? 'reached' : ''));
    const label = `${todayKey(i - 13)} — ${fmtTime(sec)}`;
    return `<div class="bar ${cls}" style="height:${h}px" title="${label}"></div>`;
  }).join('');
  const goalLine = goalSec > 0
    ? `<div class="goal-line" style="bottom:${Math.round((goalSec / max) * 40)}px" title="Objectif : ${store.settings.dailyGoalMin} min"></div>`
    : '';
  chart.innerHTML = bars + goalLine;
}

// Anneau de progression de l'objectif quotidien
function renderGoalRing(todaySec) {
  const goalMin = store.settings.dailyGoalMin || 0;
  const el = $('#statGoal');
  if (!goalMin) {
    el.innerHTML =
      `<span class="stat-num">${fmtTime(todaySec)}</span><span class="stat-label">aujourd’hui</span>`;
    return;
  }
  const min = Math.round(todaySec / 60);
  const frac = Math.min(1, todaySec / (goalMin * 60));
  const R = 22, C = 2 * Math.PI * R;
  const done = frac >= 1;
  el.innerHTML =
    `<svg class="ring" width="56" height="56" viewBox="0 0 56 56">
       <circle cx="28" cy="28" r="${R}" fill="none" stroke="var(--bg)" stroke-width="6"/>
       <circle cx="28" cy="28" r="${R}" fill="none" stroke="${done ? 'var(--green)' : 'var(--blue)'}"
         stroke-width="6" stroke-linecap="round" transform="rotate(-90 28 28)"
         stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}"/>
       <text x="28" y="32" text-anchor="middle" class="ring-txt">${done ? '✓' : min}</text>
     </svg>
     <span class="stat-label">${done ? 'objectif ✓' : `${min} / ${goalMin} min`}</span>`;
}

function editDailyGoal() {
  const cur = store.settings.dailyGoalMin || 0;
  const input = prompt('Objectif de lecture quotidien, en minutes\n(0 pour désactiver) :', String(cur));
  if (input === null) return;
  const n = Math.max(0, Math.min(600, Math.round(Number(input)) || 0));
  store.settings.dailyGoalMin = n;
  persist();
  renderStatsPanel();
  if (typeof syncControls === 'function') syncControls();
}
