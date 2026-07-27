'use strict';

/* ═══════════ Câblage de l'interface & démarrage ═══════════ */

const APPEARANCE_VARS = [
  '--bg', '--paper', '--ink', '--muted', '--dim', '--shadow',
  '--selection', '--texture-blend', '--focus-ring', '--accent-blue',
  '--accent-red',
];

function clampSetting(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

// Les sauvegardes sont éditables et les anciens exports peuvent contenir des
// valeurs désormais inconnues. Une préférence invalide ne doit jamais rendre
// l'interface transparente ou inutilisable.
function normalizeSettings(settings = store.settings) {
  const s = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? settings
    : { ...DEFAULT_SETTINGS, custom: { ...DEFAULT_SETTINGS.custom } };
  if (settings === store.settings || !store.settings) store.settings = s;
  if (!THEMES.includes(s.theme)) s.theme = DEFAULT_SETTINGS.theme;
  if (!TEXTURES.includes(s.texture)) s.texture = DEFAULT_SETTINGS.texture;
  if (!['pages', 'scroll'].includes(s.flow)) s.flow = DEFAULT_SETTINGS.flow;
  if (!['auto', '1', '2'].includes(String(s.spread))) s.spread = DEFAULT_SETTINGS.spread;
  else s.spread = String(s.spread);
  if (!['slide', 'curl', 'none'].includes(s.pageAnim)) s.pageAnim = DEFAULT_SETTINGS.pageAnim;
  if (typeof s.focus === 'boolean') s.focus = s.focus ? 'ruler' : 'off';
  if (!['off', 'ruler', 'para'].includes(s.focus)) s.focus = DEFAULT_SETTINGS.focus;
  if (!HL_COLORS.includes(s.lastHlColor)) s.lastHlColor = DEFAULT_SETTINGS.lastHlColor;
  if (typeof s.font !== 'string' || !s.font) s.font = DEFAULT_SETTINGS.font;
  for (const key of ['justify', 'pageSound', 'bionic', 'instantHl', 'dictOnline', 'bookDesign']) {
    if (typeof s[key] !== 'boolean') s[key] = DEFAULT_SETTINGS[key];
  }

  s.fontSize = clampSetting(s.fontSize, 15, 26, DEFAULT_SETTINGS.fontSize);
  s.lineHeight = clampSetting(s.lineHeight, 1.4, 2.2, DEFAULT_SETTINGS.lineHeight);
  s.pageWidth = clampSetting(s.pageWidth, 440, 760, DEFAULT_SETTINGS.pageWidth);
  s.pageMargin = clampSetting(s.pageMargin, 24, 90, DEFAULT_SETTINGS.pageMargin);
  s.bionicIntensity = clampSetting(s.bionicIntensity, 0.2, 0.7, DEFAULT_SETTINGS.bionicIntensity);
  s.textureIntensity = clampSetting(s.textureIntensity, 0, 1, DEFAULT_SETTINGS.textureIntensity);
  s.rsvpWpm = clampSetting(s.rsvpWpm, 150, 700, DEFAULT_SETTINGS.rsvpWpm);
  s.dailyGoalMin = clampSetting(s.dailyGoalMin, 0, 600, DEFAULT_SETTINGS.dailyGoalMin);
  s.pomodoroFocus = clampSetting(s.pomodoroFocus, 10, 60, DEFAULT_SETTINGS.pomodoroFocus);
  s.pomodoroBreak = clampSetting(s.pomodoroBreak, 3, 20, DEFAULT_SETTINGS.pomodoroBreak);

  const custom = s.custom || {};
  s.custom = {
    bg: validHex(custom.bg) ? custom.bg : DEFAULT_SETTINGS.custom.bg,
    paper: validHex(custom.paper) ? custom.paper : DEFAULT_SETTINGS.custom.paper,
    ink: validHex(custom.ink) ? custom.ink : DEFAULT_SETTINGS.custom.ink,
  };
  const customFonts = Array.isArray(s.customFonts) ? s.customFonts : [];
  s.customFonts = customFonts.flatMap((f) => {
    if (!f || typeof f.name !== 'string' || typeof f.data !== 'string') return [];
    const name = f.name.replace(/["<>]/g, '').trim().slice(0, 80);
    const data = f.data;
    if (!name || data.length > 32 * 1024 * 1024 || !/^[a-z0-9+/=]+$/i.test(data)) return [];
    return [{ name, data }];
  }).filter((f, i, all) => all.findIndex((x) => x.name === f.name) === i);
  const customFontName = s.font.startsWith('custom:') ? s.font.slice(7) : null;
  const validFont = customFontName
    ? s.customFonts.some((f) => f.name === customFontName)
    : Object.hasOwn(FONTS, s.font);
  if (!validFont) {
    s.font = DEFAULT_SETTINGS.font;
  }
  return s;
}

function safeCustomAppearance(custom) {
  const paper = custom.paper;
  const ink = contrastRatio(custom.ink, paper) >= 4.5
    ? custom.ink
    : safestTextColor(paper);
  // L'interface et la page partagent la même couleur de texte. Si le fond
  // choisi lui est incompatible, on rapproche le pourtour de la page plutôt
  // que de rendre les commandes invisibles.
  const bg = contrastRatio(ink, custom.bg) >= 4.5 ? custom.bg : paper;
  return {
    bg,
    paper,
    ink,
    adjusted: bg !== custom.bg || ink !== custom.ink,
  };
}

// Une seule porte d'entrée applique palette, texture et préférences système.
function applyAppearance() {
  const s = normalizeSettings();
  const b = document.body;
  const preset = THEME_PRESETS.find((t) => t.id === s.theme) || THEME_PRESETS[0];
  b.dataset.theme = preset.id;
  b.dataset.texture = s.texture;
  document.documentElement.style.colorScheme =
    preset.scheme === 'custom'
      ? (relativeLuminance(s.custom.paper) < 0.35 ? 'dark' : 'light')
      : preset.scheme;

  // La texture reste sous le texte. En contraste élevé, elle est neutralisée
  // sans écraser le choix mémorisé par l'utilisateur.
  const textureOpacity = s.theme === 'contraste' || s.texture === 'none'
    ? 0
    : s.textureIntensity * 0.1;
  b.style.setProperty('--texture-opacity', textureOpacity.toFixed(3));

  if (s.theme === 'perso') {
    const c = safeCustomAppearance(s.custom);
    const dark = relativeLuminance(c.paper) < 0.35;
    b.style.setProperty('--bg', c.bg);
    b.style.setProperty('--paper', c.paper);
    b.style.setProperty('--ink', c.ink);
    b.style.setProperty('--muted', accessibleMuted(c.ink, c.paper, c.bg));
    b.style.setProperty('--dim', `rgba(${hexToRgb(c.bg)}, .82)`);
    b.style.setProperty('--shadow', dark ? 'rgba(0, 0, 0, .72)' : mixHex(c.ink, c.bg, 0.82));
    b.style.setProperty('--selection', `rgba(${hexToRgb(c.ink)}, .16)`);
    b.style.setProperty('--texture-blend', dark ? 'soft-light' : 'multiply');
    b.style.setProperty('--focus-ring', c.ink);
    b.style.setProperty('--accent-blue', c.ink);
    b.style.setProperty('--accent-red', c.ink);
  } else {
    APPEARANCE_VARS.forEach((v) => b.style.removeProperty(v));
  }
}

function renderContrastStatus() {
  const el = $('#contrastStatus');
  if (!el) return;
  const { ink, paper } = store.settings.custom;
  const ratio = Math.min(
    contrastRatio(ink, paper),
    contrastRatio(ink, store.settings.custom.bg)
  );
  const safe = safeCustomAppearance(store.settings.custom);
  el.classList.toggle('warn', ratio < 7);
  el.classList.toggle('bad', safe.adjusted);
  el.textContent = safe.adjusted
    ? `Contraste ${ratio.toFixed(1)}:1 · couleurs sûres appliquées à l’aperçu`
    : ratio >= 7
      ? `Contraste ${ratio.toFixed(1)}:1 · excellent pour la lecture`
      : `Contraste ${ratio.toFixed(1)}:1 · lisible, mais perfectible`;
}

// Polices importées : enregistrement FontFace + entrées du menu déroulant
async function registerCustomFont(name, dataB64) {
  try {
    const bin = atob(dataB64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const face = new FontFace(name, u8.buffer);
    const loaded = await face.load();
    document.fonts.add(loaded);
    FONTS['custom:' + name] = `'${name}', 'Segoe UI', sans-serif`;
    return true;
  } catch {
    return false;
  }
}

function rebuildFontSelect() {
  const grp = $('#fontCustom');
  const fonts = store.settings.customFonts || [];
  grp.innerHTML = fonts.map((f) => `<option value="custom:${esc(f.name)}">${esc(f.name)}</option>`).join('');
  grp.style.display = fonts.length ? '' : 'none';
}

async function importFontFile() {
  const path = window.LIVRE_TEST_FONT || await window.livre.pickFont();
  if (!path) return;
  const bytes = await window.livre.readFile(path);
  const u8 = new Uint8Array(bytes);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  const dataB64 = btoa(bin);
  const name = basename(path).replace(/\.(ttf|otf|woff2?|ttc)$/i, '').slice(0, 40);
  if (!await registerCustomFont(name, dataB64)) { toast('Police illisible'); return; }
  store.settings.customFonts = (store.settings.customFonts || []).filter((f) => f.name !== name);
  store.settings.customFonts.push({ name, data: dataB64 });
  store.settings.font = 'custom:' + name;
  rebuildFontSelect();
  persist();
  await document.fonts.ready;
  syncControls();
  relayout();
  toast(`Police « ${name} » importée`);
}

function syncControls() {
  const s = normalizeSettings();
  applyAppearance();
  $$('.dot').forEach((d) => {
    const active = d.dataset.theme === s.theme;
    d.classList.toggle('active', active);
    d.setAttribute('aria-pressed', String(active));
  });
  $$('.theme-card').forEach((d) => {
    const active = d.dataset.theme === s.theme;
    d.classList.toggle('active', active);
    d.setAttribute('aria-checked', String(active));
  });
  $$('.texture-card').forEach((d) => {
    const active = d.dataset.texture === s.texture;
    d.classList.toggle('active', active);
    d.setAttribute('aria-checked', String(active));
  });
  $('#fontSelect').value = s.font;
  $('#flowSelect').value = s.flow;
  $('#spreadSelect').value = s.spread;
  $('#animSelect').value = s.pageAnim;
  $('#colBg').value = s.custom.bg;
  $('#colPaper').value = s.custom.paper;
  $('#colInk').value = s.custom.ink;
  $('#textureRange').value = Math.round(s.textureIntensity * 100);
  $('#textureVal').textContent = s.texture === 'none'
    ? 'désactivée'
    : Math.round(s.textureIntensity * 100) + ' %';
  $('#textureIntensitySetting').classList.toggle('is-disabled', s.texture === 'none');
  $('#textureRange').disabled = s.texture === 'none';
  $('#customThemePanel').classList.toggle('active', s.theme === 'perso');
  renderContrastStatus();
  applyPageAnimStyle();
  $('#sizeRange').value = s.fontSize;
  $('#sizeVal').textContent = s.fontSize + ' px';
  $('#lhRange').value = s.lineHeight;
  $('#lhVal').textContent = s.lineHeight.toFixed(2);
  $('#widthRange').value = s.pageWidth;
  $('#widthVal').textContent = s.pageWidth + ' px';
  $('#marginRange').value = s.pageMargin;
  $('#marginVal').textContent = s.pageMargin + ' px';
  document.documentElement.style.setProperty('--page-margin', s.pageMargin + 'px');
  $('#pageSoundChk').checked = s.pageSound;
  $('#bookDesignChk').checked = s.bookDesign;
  $('#justifyChk').checked = s.justify;
  $('#bionicChk').checked = s.bionic;
  $('#intensityRange').value = s.bionicIntensity;
  $('#intensityVal').textContent = Math.round(s.bionicIntensity * 100) + ' %';
  $('#focusSelect').value = s.focus;
  $('#instantHlChk').checked = s.instantHl;
  $('#instantHlBtn').classList.toggle('on', s.instantHl);
  $('#dictChk').checked = s.dictOnline;
  $('#goalRange').value = s.dailyGoalMin;
  $('#goalVal').textContent = s.dailyGoalMin ? s.dailyGoalMin + ' min' : 'off';
  $('#pomoFocusRange').value = s.pomodoroFocus;
  $('#pomoFocusVal').textContent = s.pomodoroFocus + ' min';
  $('#pomoBreakRange').value = s.pomodoroBreak;
  $('#pomoBreakVal').textContent = s.pomodoroBreak + ' min';
  $('#bionicBtn').classList.toggle('on', s.bionic);
  $('#focusBtn').classList.toggle('on', s.focus !== 'off');
  updateFocusRuler();
}

// rerender : true quand le changement affecte la mise en page du texte
function applySettings(rerender) {
  syncControls();
  persist();
  if (rerender) relayout();
}

function toggleDrawer(id) {
  const el = $(id);
  const wasOpen = el.classList.contains('open');
  $('#notesDrawer').classList.remove('open');
  $('#tocDrawer').classList.remove('open');
  if (!wasOpen) el.classList.add('open');
}

/* --- Page Options (menu de jeu) --- */
function optionsVisible() {
  return !$('#optionsScreen').classList.contains('hidden');
}
function openOptions(pane) {
  syncControls();
  renderAchievements();
  if (pane) switchOptPane(pane);
  $('#optionsScreen').classList.remove('hidden');
}
function closeOptions() {
  $('#optionsScreen').classList.add('hidden');
}
function switchOptPane(pane) {
  $$('#optNav .opt-tab').forEach((b) => b.classList.toggle('active', b.dataset.pane === pane));
  $$('.opt-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== pane));
}

function buildUI() {
  for (const holder of ['#libDots', '#readerDots']) {
    $(holder).innerHTML = THEME_PRESETS.map((t) =>
      `<button class="dot" data-theme="${t.id}" title="${esc(t.label)}" ` +
      `aria-label="Ambiance ${esc(t.label)}" aria-pressed="false"></button>`).join('');
  }

  $('#themeGallery').innerHTML = THEME_PRESETS.map((t) =>
    `<button class="theme-card" data-theme="${t.id}" role="radio" aria-checked="false">
       <span class="theme-preview" aria-hidden="true"><i></i><b></b></span>
       <span class="theme-copy"><strong>${esc(t.label)}</strong><small>${esc(t.description)}</small></span>
       <span class="theme-check" aria-hidden="true">✓</span>
     </button>`
  ).join('');
  $('#textureGallery').innerHTML = TEXTURE_PRESETS.map((t) =>
    `<button class="texture-card" data-texture="${t.id}" role="radio" aria-checked="false">
       <span class="texture-preview" aria-hidden="true"></span>
       <span><strong>${esc(t.label)}</strong><small>${esc(t.description)}</small></span>
     </button>`
  ).join('');

  $$('.dot, .theme-card').forEach((d) => d.addEventListener('click', () => {
    store.settings.theme = d.dataset.theme;
    applySettings(false);
  }));
  $$('.texture-card').forEach((d) => d.addEventListener('click', () => {
    store.settings.texture = d.dataset.texture;
    applySettings(false);
  }));

  /* --- Chargement interruptible --- */
  $('#loaderCancel').addEventListener('click', () => {
    loadCancelled = true;
    if (typeof cancelOcrInitialization === 'function') cancelOcrInitialization();
    $('#loaderText').textContent = 'Interruption…';
    $('#loaderCancel').classList.add('hidden');
  });

  /* --- Bibliothèque --- */
  const pick = async () => {
    const paths = await window.livre.pickBooks();
    if (paths.length) addBooks(paths);
  };
  $('#addBtn').addEventListener('click', pick);
  $('#emptyAddBtn').addEventListener('click', pick);
  $('#libSearch').addEventListener('input', debounce((e) => {
    libraryQuery = e.target.value;
    renderLibrary();
  }, 200));
  $$('#shelfBar .shelf').forEach((btn) =>
    btn.addEventListener('click', () => setShelf(btn.dataset.shelf)));
  $('#tagChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.tagchip');
    if (chip) setTagFilter(chip.dataset.tag);
  });
  $('#statGoal').addEventListener('click', editDailyGoal);
  $('#exportLibBtn').addEventListener('click', exportLibrary);
  $('#importLibBtn').addEventListener('click', importLibrary);

  /* --- Barre de lecture --- */
  $('#backBtn').addEventListener('click', closeReader);
  $('#tocBtn').addEventListener('click', () => toggleDrawer('#tocDrawer'));
  $('#searchBtn').addEventListener('click', openSearch);
  $('#bookmarkBtn').addEventListener('click', toggleBookmark);
  $('#sketchBtn').addEventListener('click', () => {
    if (sketchVisible()) sketchClose(true);
    else sketchOpen();
  });
  const sketchCanvas = $('#sketchCanvas');
  sketchCanvas.addEventListener('pointerdown', sketchPointerDown);
  sketchCanvas.addEventListener('pointermove', sketchPointerMove);
  sketchCanvas.addEventListener('pointerup', sketchPointerUp);
  sketchCanvas.addEventListener('pointercancel', sketchPointerUp);
  $$('#sketchTools .pen').forEach((d) => d.addEventListener('click', () => {
    sketch.color = SKETCH_COLORS[d.dataset.pen];
    $$('#sketchTools .pen').forEach((x) => x.classList.toggle('sel', x === d));
  }));
  $('#sketchClearBtn').addEventListener('click', sketchClear);
  $('#sketchSaveBtn').addEventListener('click', () => sketchClose(true));
  $('#sketchCancelBtn').addEventListener('click', () => sketchClose(false));
  $('#sketchView').addEventListener('click', hideSketchView);
  $('#notesBtn').addEventListener('click', () => {
    notesQuery = '';
    $('#notesSearch').value = '';
    renderNotesDrawer();
    toggleDrawer('#notesDrawer');
  });
  $('#rsvpBtn').addEventListener('click', rsvpOpen);
  $('#pomodoroBtn').addEventListener('click', pomodoroToggle);
  $('#pomoStop').addEventListener('click', pomodoroStop);
  $('#bionicBtn').addEventListener('click', () => {
    store.settings.bionic = !store.settings.bionic;
    applySettings(true);
  });
  // le bouton ▤ fait défiler les trois modes focus
  $('#focusBtn').addEventListener('click', () => {
    const order = ['off', 'ruler', 'para'];
    const next = order[(order.indexOf(store.settings.focus) + 1) % order.length];
    store.settings.focus = next;
    applySettings(false);
    toast(next === 'off' ? 'Focus désactivé' : next === 'ruler' ? 'Focus : règle de lecture' : 'Focus : paragraphe (↑/↓)');
  });
  $('#instantHlBtn').addEventListener('click', () => {
    store.settings.instantHl = !store.settings.instantHl;
    applySettings(false);
    toast(store.settings.instantHl
      ? '🖍 Surlignage instantané : sélectionne du texte pour surligner'
      : 'Surlignage instantané désactivé');
  });
  $('#companionBtn').addEventListener('click', toggleCompanionPicker);
  $('#companionCloseBtn').addEventListener('click', closeCompanion);
  $('#companionBody').addEventListener('scroll', debounce(saveCompanionPos, 400));
  $('#fullscreenBtn').addEventListener('click', toggleFullscreen);
  $('#settingsBtn').addEventListener('click', () => openOptions());
  $('#prevBtn').addEventListener('click', () => turnPage(-1));
  $('#nextBtn').addEventListener('click', () => turnPage(1));

  /* --- Recherche plein texte --- */
  $('#searchInput').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = e.target.value;
    if (searchState.active && q === searchState.q && searchState.results.length) {
      jumpToHit(searchState.idx + (e.shiftKey ? -1 : 1));
    } else {
      doSearch(q);
    }
  });
  $('#searchPrev').addEventListener('click', () => jumpToHit(searchState.idx - 1));
  $('#searchNext').addEventListener('click', () => jumpToHit(searchState.idx + 1));
  $('#searchClose').addEventListener('click', () => closeSearch());

  /* --- Tiroirs --- */
  $('#tocCloseBtn').addEventListener('click', () => $('#tocDrawer').classList.remove('open'));
  $('#notesCloseBtn').addEventListener('click', () => $('#notesDrawer').classList.remove('open'));
  $('#optCloseBtn').addEventListener('click', closeOptions);
  $$('#optNav .opt-tab').forEach((b) =>
    b.addEventListener('click', () => switchOptPane(b.dataset.pane)));
  $('#libOptionsBtn').addEventListener('click', () => openOptions());
  $('#optExportLib').addEventListener('click', exportLibrary);
  $('#optImportLib').addEventListener('click', importLibrary);
  $('#resetStatsBtn').addEventListener('click', () => {
    if (!confirm('Réinitialiser les temps de lecture et la série ?\n(Les succès déjà obtenus restent conservés.)')) return;
    store.stats = { daily: {} };
    for (const book of store.books) book.readingSeconds = 0;
    persist();
    renderAchievements();
    renderLibrary();
    toast('Statistiques réinitialisées');
  });
  $('#resetSettingsBtn').addEventListener('click', () => {
    if (!confirm('Revenir aux réglages par défaut ?\n(Bibliothèque, notes et stats conservées.)')) return;
    const fonts = store.settings.customFonts;
    store.settings = { ...DEFAULT_SETTINGS, customFonts: fonts };
    persist();
    syncControls();
    if (current && readerVisible()) relayout();
    toast('Réglages réinitialisés');
  });
  $('#resetAllBtn').addEventListener('click', async () => {
    if (!confirm('Tout effacer : bibliothèque, notes, statistiques et réglages ?\nLes fichiers PDF/EPUB sur le disque ne sont pas touchés.')) return;
    if (!confirm('Vraiment sûr ? Cette action est définitive.')) return;
    for (const b of store.books) window.livre.deleteCache(b.id);
    store = { version: 2, settings: { ...DEFAULT_SETTINGS }, books: [], stats: { daily: {} }, achievements: {} };
    flushStore();
    syncControls();
    rebuildFontSelect();
    renderAchievements();
    renderLibrary();
    closeOptions();
    toast('Tout a été effacé');
  });
  $('#bookDesignChk').addEventListener('change', (e) => {
    store.settings.bookDesign = e.target.checked;
    applySettings(true);
  });

  /* --- Mise à jour intégrée --- */
  window.livre.getVersion().then((v) => { $('#appVersion').textContent = 'MontLivre v' + v; });
  $('#checkUpdateBtn').addEventListener('click', async () => {
    const st = $('#updateStatus');
    st.textContent = 'Vérification en cours…';
    const r = await window.livre.checkUpdates();
    if (r.status === 'dev') st.textContent = 'Version de développement : mise à jour via git.';
    else if (r.status === 'uptodate') st.textContent = 'Tu as déjà la dernière version ✦';
    else if (r.status === 'ready') {
      st.textContent = `Version ${r.version} téléchargée — clique pour installer.`;
      $('#installUpdateBtn').classList.remove('hidden');
    } else st.textContent = 'Vérification impossible : ' + (r.message || 'erreur inconnue');
  });
  window.livre.onUpdateState((s) => {
    const st = $('#updateStatus');
    if (s.state === 'downloading') st.textContent = `Téléchargement de la version ${s.version}…`;
    else if (s.state === 'progress') st.textContent = `Téléchargement… ${s.percent} %`;
    else if (s.state === 'ready') {
      st.textContent = `Version ${s.version} prête — clique pour installer.`;
      $('#installUpdateBtn').classList.remove('hidden');
    }
  });
  $('#installUpdateBtn').addEventListener('click', () => {
    flushStore();
    window.livre.installUpdate();
  });
  $('#exportBtn').addEventListener('click', exportAnnotations);
  $('#exportPdfBtn').addEventListener('click', exportAnnotationsPdf);
  $('#notesSearch').addEventListener('input', debounce((e) => {
    notesQuery = e.target.value;
    renderNotesDrawer();
  }, 150));

  /* --- Réglages --- */
  $('#fontSelect').addEventListener('change', (e) => {
    store.settings.font = e.target.value;
    applySettings(true);
  });
  $('#flowSelect').addEventListener('change', (e) => {
    store.settings.flow = e.target.value;
    applySettings(true);
  });
  $('#spreadSelect').addEventListener('change', (e) => {
    store.settings.spread = e.target.value;
    applySettings(true);
  });
  $('#animSelect').addEventListener('change', (e) => {
    store.settings.pageAnim = e.target.value;
    applyPageAnimStyle();
    persist();
  });
  $('#fontImportBtn').addEventListener('click', importFontFile);
  const onCustomColor = () => {
    store.settings.custom = {
      bg: $('#colBg').value,
      paper: $('#colPaper').value,
      ink: $('#colInk').value,
    };
    store.settings.theme = 'perso';
    applySettings(false);
  };
  ['#colBg', '#colPaper', '#colInk'].forEach((id) =>
    $(id).addEventListener('input', onCustomColor));
  $('#textureRange').addEventListener('input', (e) => {
    store.settings.textureIntensity = Number(e.target.value) / 100;
    applySettings(false);
  });
  $('#sizeRange').addEventListener('input', (e) => {
    store.settings.fontSize = Number(e.target.value);
    applySettings(true);
  });
  $('#lhRange').addEventListener('input', (e) => {
    store.settings.lineHeight = Number(e.target.value);
    applySettings(true);
  });
  $('#widthRange').addEventListener('input', (e) => {
    store.settings.pageWidth = Number(e.target.value);
    applySettings(true);
  });
  $('#marginRange').addEventListener('input', (e) => {
    store.settings.pageMargin = Number(e.target.value);
    applySettings(true);
  });
  $('#pageSoundChk').addEventListener('change', (e) => {
    store.settings.pageSound = e.target.checked;
    applySettings(false);
    if (e.target.checked) playPageSound();
  });
  $('#justifyChk').addEventListener('change', (e) => {
    store.settings.justify = e.target.checked;
    applySettings(true);
  });
  $('#bionicChk').addEventListener('change', (e) => {
    store.settings.bionic = e.target.checked;
    applySettings(true);
  });
  $('#intensityRange').addEventListener('input', (e) => {
    store.settings.bionicIntensity = Number(e.target.value);
    applySettings(store.settings.bionic);
  });
  $('#focusSelect').addEventListener('change', (e) => {
    store.settings.focus = e.target.value;
    applySettings(false);
  });
  $('#instantHlChk').addEventListener('change', (e) => {
    store.settings.instantHl = e.target.checked;
    applySettings(false);
  });
  $('#dictChk').addEventListener('change', (e) => {
    store.settings.dictOnline = e.target.checked;
    persist();
  });
  $('#goalRange').addEventListener('input', (e) => {
    store.settings.dailyGoalMin = Number(e.target.value);
    syncControls();
    persist();
    renderStatsPanel();
  });
  $('#pomoFocusRange').addEventListener('input', (e) => {
    store.settings.pomodoroFocus = Number(e.target.value);
    syncControls();
    persist();
  });
  $('#pomoBreakRange').addEventListener('input', (e) => {
    store.settings.pomodoroBreak = Number(e.target.value);
    syncControls();
    persist();
  });

  /* --- Surlignage --- */
  document.addEventListener('mouseup', (e) => {
    if (e.target.closest('#hlToolbar, #annPopover, .drawer')) return;
    setTimeout(onTextSelected, 10); // laisse la sélection se stabiliser
  });
  $$('#hlToolbar .hl-dot').forEach((dot) =>
    dot.addEventListener('click', () => applyHighlight(dot.dataset.color)));
  $$('#annPopover .hl-dot').forEach((dot) =>
    dot.addEventListener('click', () => recolorAnnotation(dot.dataset.color)));
  $('#annDeleteBtn').addEventListener('click', () => {
    const id = editingAnnId;
    hideAnnPopover(false);
    if (id) deleteAnnotation(id);
  });
  $('#bookContent').addEventListener('click', (e) => {
    const ref = e.target.closest('sup.noteref');
    if (ref) {
      e.stopPropagation();
      showNotePopover(ref.dataset.note, e.clientX, e.clientY);
      return;
    }
    const mark = e.target.closest('mark.hl');
    if (mark && getSelection().isCollapsed) {
      e.stopPropagation();
      showAnnPopover(mark.dataset.ann, e.clientX, e.clientY);
      return;
    }
    // mode focus paragraphe : cliquer un paragraphe le rend courant
    if (store.settings.focus === 'para') {
      const p = e.target.closest('#bookContent > [data-i]');
      if (p && getSelection().isCollapsed) setFocusPara(Number(p.dataset.i), false);
    }
  });
  // Double-clic sur un mot → dictionnaire
  $('#bookContent').addEventListener('dblclick', (e) => {
    const sel = getSelection();
    const word = sel && !sel.isCollapsed ? sel.toString().trim() : '';
    if (word && !/\s/.test(word)) {
      hideHlToolbar();
      lookupWord(word, e.clientX, e.clientY);
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#annPopover') && !e.target.closest('mark.hl')) hideAnnPopover();
    if (!e.target.closest('#hlToolbar') && !e.target.closest('#bookContent')) hideHlToolbar();
    if (!e.target.closest('#dictPopover') && !e.target.closest('#bookContent')) hideDictPopover();
    if (!e.target.closest('#notePopover') && !e.target.closest('sup.noteref')) hideNotePopover();
    if (!e.target.closest('#companionPicker') && !e.target.closest('#companionBtn')) {
      $('#companionPicker').classList.add('hidden');
    }
  });

  /* --- RSVP --- */
  $('#rsvpClose').addEventListener('click', rsvpClose);
  $('#rsvpPlay').addEventListener('click', () => rsvpSetPlaying(!rsvp.playing));
  $('#rsvpBack').addEventListener('click', () => rsvpStep(-1));
  $('#rsvpFwd').addEventListener('click', () => rsvpStep(1));
  $('#rsvpWpm').addEventListener('input', (e) => {
    store.settings.rsvpWpm = Number(e.target.value);
    $('#rsvpWpmVal').textContent = store.settings.rsvpWpm + ' mots/min';
    persist();
  });
  // Barre glissable : pointer capture (souris, doigt, stylet) + bulle d'aperçu
  const rsvpBar = $('#rsvpBar');
  const barFrac = (e) => {
    const r = rsvpBar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const updateBubble = (e) => {
    const f = barFrac(e);
    const idx = Math.round(f * (rsvp.words.length - 1));
    const w = rsvp.words[idx];
    if (!w) return;
    const bubble = $('#rsvpBubble');
    bubble.textContent = w.w;
    const pct = document.createElement('span');
    pct.className = 'pct';
    pct.textContent = Math.round(f * 100) + ' %';
    bubble.appendChild(pct);
    bubble.style.left = (f * 100) + '%';
  };
  rsvpBar.addEventListener('pointerdown', (e) => {
    rsvpBar.classList.add('dragging');
    rsvpBar.setPointerCapture(e.pointerId);
    rsvpSeek(barFrac(e));
    updateBubble(e);
  });
  rsvpBar.addEventListener('pointermove', (e) => {
    updateBubble(e);
    if (rsvpBar.classList.contains('dragging')) rsvpSeek(barFrac(e));
  });
  const endDrag = (e) => {
    rsvpBar.classList.remove('dragging');
    try { rsvpBar.releasePointerCapture(e.pointerId); } catch {}
  };
  rsvpBar.addEventListener('pointerup', endDrag);
  rsvpBar.addEventListener('pointercancel', endDrag);
  const resumeRsvpAtWord = (e) => {
    const w = e.target.closest('.w');
    if (w) rsvpGoto(Number(w.dataset.i));
  };
  $('#rsvpContext').addEventListener('click', resumeRsvpAtWord);
  $('#rsvpPreview').addEventListener('click', resumeRsvpAtWord);

  /* --- Clavier --- */
  document.addEventListener('keydown', (e) => {
    if (optionsVisible()) {
      if (e.key === 'Escape') closeOptions();
      return;
    }
    if (rsvpVisible()) {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
        if (e.key === 'Escape') rsvpClose();
        return;
      }
      if (e.key === ' ') { e.preventDefault(); rsvpSetPlaying(!rsvp.playing); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); rsvpStep(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); rsvpStep(-1); }
      else if (e.key === 'Escape') rsvpClose();
      return;
    }
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
      if (e.key === 'Escape') {
        if (e.target.id === 'searchInput') closeSearch();
        else if (e.target.id === 'annNote') hideAnnPopover();
        else e.target.blur();
      }
      return;
    }
    if (!readerVisible() || !current) return;
    if (e.key === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openSearch(); }
    else if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
    else if (store.settings.focus === 'para' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      stepFocusPara(e.key === 'ArrowDown' ? 1 : -1);
    }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
      e.preventDefault();
      turnPage(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
      e.preventDefault();
      turnPage(-1);
    } else if (e.key === 'Escape') {
      if (!$('#sketchView').classList.contains('hidden')) hideSketchView();
      else if (sketchVisible()) sketchClose(false);
      else if (!$('#companionPicker').classList.contains('hidden')) $('#companionPicker').classList.add('hidden');
      else if (noteVisible()) hideNotePopover();
      else if (dictVisible()) hideDictPopover();
      else if (!$('#hlToolbar').classList.contains('hidden')) hideHlToolbar();
      else if (!$('#searchBar').classList.contains('hidden')) closeSearch();
      else if ($$('.drawer.open').length) {
        $$('.drawer.open').forEach((d) => d.classList.remove('open'));
      } else if (document.body.classList.contains('fullscreen')) toggleFullscreen();
      else closeReader();
    }
  });

  /* --- Molette, souris, redimensionnement --- */
  let wheelLock = 0;
  $('.reader-main').addEventListener('wheel', (e) => {
    if (!current || store.settings.flow === 'scroll') return;
    const now = Date.now();
    if (now - wheelLock < 180) return;
    wheelLock = now;
    turnPage(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });
  // Le volet parallèle a son propre défilement : sa molette ne doit pas
  // tourner en même temps la page du livre principal.
  $('#companionBody').addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  $('#bookViewport').addEventListener('scroll', debounce(onScrolled, 150));

  document.addEventListener('mousemove', (e) => {
    if (document.body.classList.contains('fullscreen')) {
      document.body.classList.toggle('peek', e.clientY < 60);
    }
    if (store.settings.focus !== 'ruler' || !readerVisible()) return;
    const y = e.clientY;
    $('#focusRuler').style.background =
      `linear-gradient(to bottom, var(--dim) 0px, var(--dim) ${y - 46}px,` +
      ` transparent ${y - 46}px, transparent ${y + 52}px, var(--dim) ${y + 52}px)`;
  });

  window.addEventListener('resize', debounce(() => {
    if (current && readerVisible()) relayout();
  }, 200));

  /* --- Glisser-déposer --- */
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('dropping');
  });
  window.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) document.body.classList.remove('dropping');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('dropping');
    const paths = [...e.dataTransfer.files]
      .filter((f) => /\.(pdf|epub)$/i.test(f.name))
      .map((f) => window.livre.pathForFile(f))
      .filter(Boolean);
    if (paths.length) addBooks(paths);
  });

  // Sauvegarde immédiate à la fermeture : la position de lecture est
  // toujours préservée, même sans attendre le debounce.
  window.addEventListener('beforeunload', flushStore);

  /* --- Événements du processus principal --- */
  window.livre.onFullscreen(onFullscreenChanged);
  // Fichier passé en argument : on l'ajoute et on l'ouvre directement
  window.livre.onOpenFiles(async (paths) => {
    const ids = await addBooks(paths);
    if (ids.length) openBook(ids[0]);
  });
}

/* ---------- Démarrage ---------- */

(async function init() {
  const saved = await window.livre.loadStore();
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    store = saved;
    const savedSettings = store.settings && typeof store.settings === 'object' &&
      !Array.isArray(store.settings) ? store.settings : {};
    store.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
    store.books = (Array.isArray(store.books) ? store.books : [])
      .map((book) => sanitizeImportedBook(book))
      .filter(Boolean);
    const savedStats = store.stats && typeof store.stats === 'object' &&
      !Array.isArray(store.stats) ? store.stats : {};
    const savedDaily = savedStats.daily && typeof savedStats.daily === 'object' &&
      !Array.isArray(savedStats.daily) ? savedStats.daily : {};
    const daily = {};
    for (const [day, value] of Object.entries(savedDaily)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
          !value || typeof value !== 'object' || Array.isArray(value)) continue;
      daily[day] = {
        seconds: importedNumber(value.seconds),
        words: importedNumber(value.words),
      };
    }
    store.stats = { daily };
    store.settings.custom = { ...DEFAULT_SETTINGS.custom, ...(store.settings.custom || {}) };
    store.settings.customFonts = store.settings.customFonts || [];
    store.achievements = store.achievements && typeof store.achievements === 'object' &&
      !Array.isArray(store.achievements) ? store.achievements : {};
    // focus était un booléen avant la v1.0
    if (typeof store.settings.focus === 'boolean') {
      store.settings.focus = store.settings.focus ? 'ruler' : 'off';
    }
  }
  normalizeSettings();
  // La palette sauvegardée s'applique avant le chargement potentiellement
  // long des polices personnalisées : aucun flash clair en mode nuit/ambre.
  applyAppearance();
  // Ré-enregistre les polices importées avant de bâtir l'interface
  const validFonts = [];
  for (const font of store.settings.customFonts) {
    if (await registerCustomFont(font.name, font.data)) validFonts.push(font);
  }
  store.settings.customFonts = validFonts;
  normalizeSettings();
  buildUI();
  rebuildFontSelect();
  syncControls();
  renderLibrary();
})();
