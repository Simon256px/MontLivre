'use strict';

/* ═══════════ Dictionnaire en ligne (opt-in) ═══════════
   Double-clic sur un mot → définition du Wiktionnaire français. La
   requête réseau n'a lieu que si l'utilisateur a activé l'option
   (settings.dictOnline), sinon le popover propose d'abord de l'activer.

   L'endpoint REST /definition n'existe que sur le Wiktionnaire anglais
   (501 en français) : on passe donc par l'API action=parse et on
   extrait les définitions du wikitext (lignes « # » sous les sections
   de nature grammaticale). */

const dictCache = new Map();
let dictRequest = 0;

// Codes de section {{S|...}} qui ne sont PAS des natures de mot
const NON_POS = new Set([
  'étymologie', 'prononciation', 'synonymes', 'antonymes', 'dérivés',
  'apparentés', 'hyperonymes', 'hyponymes', 'holonymes', 'méronymes',
  'traductions', 'anagrammes', 'références', 'voir', 'voir aussi',
  'vocabulaire', 'phrases', 'notes', 'variantes', 'variantes orthographiques',
  'gentilé', 'paronymes', 'quasi-synonymes', 'abréviations', 'composés',
  'expressions', 'trad-début', 'trad-fin', 'dérivés autres langues',
]);
const POS_LABEL = {
  'nom': 'Nom', 'nom commun': 'Nom', 'nom propre': 'Nom propre',
  'verbe': 'Verbe', 'adjectif': 'Adjectif', 'adj': 'Adjectif',
  'adverbe': 'Adverbe', 'adv': 'Adverbe', 'pronom': 'Pronom',
  'préposition': 'Préposition', 'conjonction': 'Conjonction',
  'interjection': 'Interjection', 'article': 'Article',
  'numéral': 'Numéral', 'adjectif numéral': 'Adjectif numéral',
  'locution': 'Locution', 'locution-phrase': 'Locution',
};

// Nettoie le wikitext d'une définition en texte lisible
function wtClean(s) {
  // {{lexique|physique|optique|fr}} → « (physique, optique) »
  s = s.replace(/\{\{(?:lexique|term|label|info lex)\s*\|([^{}]*?)\}\}/gi, (_m, args) => {
    const parts = args.split('|').filter((p) => p && p !== 'fr' && !p.includes('='));
    return parts.length ? '(' + parts.join(', ') + ') ' : '';
  });
  let prev; // retire les autres modèles (en boucle pour gérer l'imbrication)
  do { prev = s; s = s.replace(/\{\{[^{}]*\}\}/g, ''); } while (s !== prev);
  s = s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1'); // [[cible|texte]] → texte
  s = s.replace(/\[\[([^\]]*)\]\]/g, '$1');           // [[texte]] → texte
  s = s.replace(/'''([^']*)'''/g, '$1').replace(/''([^']*)''/g, '$1');
  s = s.replace(/<[^>]+>/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

function parseWikitext(wt) {
  const langRe = /^==\s*\{\{langue\|([a-zà-ÿ-]+)\}\}\s*==/i;
  const secRe = /^={3,}\s*\{\{S\|([^|}]+)/;
  let inFr = true; // avant tout en-tête de langue, on suppose le français
  let cur = null;
  const out = [];
  for (const line of wt.split('\n')) {
    const lm = line.match(langRe);
    if (lm) { inFr = lm[1].toLowerCase() === 'fr'; cur = null; continue; }
    if (!inFr) continue;
    const sm = line.match(secRe);
    if (sm) {
      const code = sm[1].trim().toLowerCase();
      if (NON_POS.has(code)) { cur = null; continue; }
      const label = POS_LABEL[code] || (code.charAt(0).toUpperCase() + code.slice(1));
      cur = { partOfSpeech: label, definitions: [] };
      out.push(cur);
      continue;
    }
    // Définition = ligne « # … » (pas « ## » sous-sens ni « #* » exemple)
    if (cur && /^#[^#*:]/.test(line)) {
      const def = wtClean(line.replace(/^#+\s*/, ''));
      if (def && def.length > 1) cur.definitions.push(def);
    }
  }
  return out.filter((e) => e.definitions.length);
}

async function fetchDefs(word) {
  const variants = [word];
  const lower = word.toLowerCase();
  if (lower !== word) variants.push(lower);
  for (const w of variants) {
    const url = 'https://fr.wiktionary.org/w/api.php?action=parse&format=json' +
      '&origin=*&prop=wikitext&redirects=1&page=' + encodeURIComponent(w);
    let data;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      data = await res.json();
    } catch { continue; }
    const wt = data.parse && data.parse.wikitext && data.parse.wikitext['*'];
    if (!wt) continue;
    const entries = parseWikitext(wt);
    if (entries.length) return entries;
  }
  return [];
}

function dictVisible() {
  return !$('#dictPopover').classList.contains('hidden');
}
function hideDictPopover() {
  dictRequest++;
  $('#dictPopover').classList.add('hidden');
}
function positionDict(x, y) {
  const pop = $('#dictPopover');
  pop.style.left = Math.max(12, Math.min(window.innerWidth - 342, x - 165)) + 'px';
  pop.style.top = Math.min(window.innerHeight - 280, y + 16) + 'px';
}

async function lookupWord(rawWord, x, y) {
  const word = (rawWord || '').replace(/[^\p{L}\p{N}’'-]/gu, '').trim();
  if (!word) return;
  const request = ++dictRequest;
  const pop = $('#dictPopover');
  pop.classList.remove('hidden');
  positionDict(x, y);

  if (!store.settings.dictOnline) {
    pop.innerHTML =
      `<div class="dict-head"><b>Dictionnaire</b>` +
      `<button class="item-del" id="dictClose">✕</button></div>` +
      `<p class="dict-msg">Le dictionnaire consulte le Wiktionnaire en ligne. ` +
      `Active-le pour chercher « ${esc(word)} ».</p>` +
      `<button class="pill primary" id="dictEnable">Activer le dictionnaire</button>`;
    $('#dictClose').addEventListener('click', hideDictPopover);
    $('#dictEnable').addEventListener('click', () => {
      store.settings.dictOnline = true;
      const chk = $('#dictChk');
      if (chk) chk.checked = true;
      persist();
      lookupWord(word, x, y);
    });
    return;
  }

  renderDict(word, { loading: true });
  const key = word.toLowerCase();
  try {
    let entries = dictCache.get(key);
    if (!entries) {
      entries = await fetchDefs(word);
      dictCache.set(key, entries);
    }
    if (!dictVisible() || request !== dictRequest) return; // fermé ou autre mot demandé entre-temps
    renderDict(word, { entries });
  } catch {
    if (dictVisible() && request === dictRequest) renderDict(word, { failed: true });
  }
}

function renderDict(word, { loading, entries, failed } = {}) {
  const pop = $('#dictPopover');
  let body;
  if (loading) {
    body = `<p class="dict-msg">Recherche…</p>`;
  } else if (failed || !entries || !entries.length) {
    const link = `https://fr.wiktionary.org/wiki/${encodeURIComponent(word)}`;
    body = `<p class="dict-msg">Aucune définition trouvée (ou pas de connexion).</p>` +
      `<button class="dict-link" data-ext="${esc(link)}">Ouvrir sur le Wiktionnaire ↗</button>`;
  } else {
    body = entries.slice(0, 3).map((en) => {
      const defs = en.definitions.slice(0, 3)
        .map((d) => `<li>${esc(d)}</li>`).join('');
      return `<div class="dict-pos">${esc(en.partOfSpeech)}</div><ol>${defs}</ol>`;
    }).join('');
  }
  pop.innerHTML =
    `<div class="dict-head"><b>${esc(word)}</b>` +
    `<button class="item-del" id="dictClose">✕</button></div>` +
    body +
    `<div class="dict-foot">via Wiktionnaire</div>`;
  $('#dictClose').addEventListener('click', hideDictPopover);
  const ext = $('.dict-link', pop);
  if (ext) ext.addEventListener('click', () => window.livre.openExternal(ext.dataset.ext));
}
