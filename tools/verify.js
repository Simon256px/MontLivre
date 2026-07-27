#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.cache',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'release',
]);
const SOURCE_DIRECTORIES = ['src', 'tools', 'test', 'tests'];
const MIN_TEXT_CONTRAST = 4.5;

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function walk(directory, extension) {
  const files = [];
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) files.push(...walk(file, extension));
    } else if (entry.isFile() && file.toLowerCase().endsWith(extension)) {
      files.push(file);
    }
  }
  return files.sort();
}

function projectFiles(extension) {
  const files = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile()
        && !entry.name.startsWith('.')
        && entry.name.toLowerCase().endsWith(extension),
    )
    .map((entry) => path.join(ROOT, entry.name));
  for (const directory of SOURCE_DIRECTORIES) {
    files.push(...walk(path.join(ROOT, directory), extension));
  }
  return [...new Set(files)].sort();
}

function checkJavaScriptSyntax() {
  const files = projectFiles('.js');
  const errors = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    try {
      new vm.Script(source, { filename: relative(file) });
    } catch (error) {
      errors.push(`${relative(file)}: ${error.message}`);
    }
  }
  return {
    summary: `${files.length} fichier(s) JavaScript analysé(s)`,
    errors,
    warnings: [],
  };
}

function htmlAttributeMatches(source, attribute) {
  const pattern = new RegExp(
    `(?<![\\w:-])${attribute}\\b\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
    'gi',
  );
  return [...source.matchAll(pattern)].map((match) => ({
    index: match.index,
    value: match[1] ?? match[2] ?? match[3] ?? '',
  }));
}

function checkHtmlIds() {
  const files = projectFiles('.html');
  const errors = [];
  let total = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const seen = new Map();
    for (const match of htmlAttributeMatches(source, 'id')) {
      total++;
      const id = match.value.trim();
      const line = lineNumber(source, match.index);
      if (!id) {
        errors.push(`${relative(file)}:${line}: id vide`);
      } else if (seen.has(id)) {
        errors.push(
          `${relative(file)}:${line}: id "${id}" dupliqué (première occurrence ligne ${seen.get(id)})`,
        );
      } else {
        seen.set(id, line);
      }
    }
  }

  return {
    summary: `${total} id vérifié(s) dans ${files.length} fichier(s) HTML`,
    errors,
    warnings: [],
  };
}

function decodeLocalReference(value) {
  const trimmed = value.trim();
  if (
    !trimmed
    || trimmed.startsWith('#')
    || trimmed.startsWith('//')
    || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  ) {
    return null;
  }

  const withoutQuery = trimmed.split(/[?#]/, 1)[0];
  if (!withoutQuery) return null;
  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

function checkHtmlAssets() {
  const files = projectFiles('.html');
  const errors = [];
  let total = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const attribute of ['src', 'href']) {
      for (const match of htmlAttributeMatches(source, attribute)) {
        const reference = decodeLocalReference(match.value);
        if (reference === null) continue;
        total++;

        const target = reference.startsWith('/')
          ? path.resolve(ROOT, `.${reference}`)
          : path.resolve(path.dirname(file), reference);
        if (!fs.existsSync(target)) {
          errors.push(
            `${relative(file)}:${lineNumber(source, match.index)}: ${attribute} local introuvable `
            + `"${match.value}" (attendu: ${relative(target)})`,
          );
        }
      }
    }
  }

  return {
    summary: `${total} référence(s) locale(s) src/href vérifiée(s)`,
    errors,
    warnings: [],
  };
}

function extractLiteral(source, start) {
  let index = start;
  while (/\s/.test(source[index] || '')) index++;
  const opening = source[index];
  if (opening !== '[' && opening !== '{') return null;

  const closingFor = { '[': ']', '{': '}', '(': ')' };
  const stack = [opening];
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = index + 1; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i++;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (closingFor[char]) {
      stack.push(char);
      continue;
    }
    if (char === closingFor[stack[stack.length - 1]]) {
      stack.pop();
      if (stack.length === 0) return source.slice(index, i + 1);
    }
  }
  return null;
}

function registryEntries(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry === 'string') return [{ id: entry }];
      return entry && typeof entry === 'object' && entry.id ? [entry] : [];
    });
  }
  if (!value || typeof value !== 'object') return [];
  if (value.id) return [value];
  return Object.entries(value).flatMap(([id, entry]) => {
    if (entry && typeof entry === 'object') return [{ id, ...entry }];
    return [];
  });
}

function findPaletteRegistry(jsFiles) {
  const palettes = new Map();
  const warnings = [];
  const registryNames = new Set();
  const assignment = /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=\s*/g;

  for (const file of jsFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(assignment)) {
      if (!/(?:THEME|PALETTE)/.test(match[1])) continue;
      const literal = extractLiteral(source, match.index + match[0].length);
      if (!literal) continue;
      let value;
      try {
        value = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 500 });
      } catch (error) {
        warnings.push(
          `${relative(file)}:${lineNumber(source, match.index)}: registre ${match[1]} `
          + `non statique, ignoré (${error.message})`,
        );
        continue;
      }

      const entries = registryEntries(value);
      if (!entries.length) continue;
      registryNames.add(match[1]);
      for (const entry of entries) {
        const id = String(entry.id);
        const previous = palettes.get(id) || { id, _registries: [] };
        palettes.set(id, {
          ...previous,
          ...entry,
          id,
          _registries: [...new Set([...previous._registries, match[1]])],
        });
      }
    }
  }

  return { palettes, registryNames: [...registryNames].sort(), warnings };
}

function cssPaletteTokens(cssFiles) {
  const palettes = new Map();
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  const selectorPattern = /\[data-(?:theme|palette)\s*=\s*["']?([^"'\]\s]+)["']?\]/gi;
  const tokenPattern = /(--[a-z0-9_-]+)\s*:\s*([^;]+)\s*;?/gi;

  for (const file of cssFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const block of source.matchAll(blockPattern)) {
      const ids = [...block[1].matchAll(selectorPattern)].map((match) => match[1]);
      if (!ids.length) continue;
      const tokens = Object.fromEntries(
        [...block[2].matchAll(tokenPattern)].map((match) => [match[1], match[2].trim()]),
      );
      for (const id of ids) {
        palettes.set(id, { ...(palettes.get(id) || {}), ...tokens });
      }
    }
  }
  return palettes;
}

function cssRootTokens(cssFiles) {
  const tokens = {};
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  const tokenPattern = /(--[a-z0-9_-]+)\s*:\s*([^;]+)\s*;?/gi;
  for (const file of cssFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const block of source.matchAll(blockPattern)) {
      if (!block[1].split(',').some((selector) => selector.trim() === ':root')) continue;
      Object.assign(tokens, Object.fromEntries(
        [...block[2].matchAll(tokenPattern)]
          .map((match) => [match[1], match[2].trim()]),
      ));
    }
  }
  return tokens;
}

function normalizeRoleName(name) {
  return name
    .replace(/^--/, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function paletteRoles(entry, cssTokens) {
  const values = {};
  const containers = [
    cssTokens,
    entry,
    entry && entry.colors,
    entry && entry.roles,
    entry && entry.tokens,
    entry && entry.palette,
  ];
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue;
    for (const [name, value] of Object.entries(container)) {
      if (typeof value === 'string') values[normalizeRoleName(name)] = value.trim();
    }
  }

  const aliases = {
    bg: ['bg', 'background', 'appbackground', 'canvas'],
    paper: ['paper', 'surface', 'page', 'pagebackground', 'readingsurface'],
    ink: ['ink', 'text', 'foreground', 'textprimary', 'primarytext'],
    muted: ['muted', 'secondarytext', 'textsecondary', 'textmuted', 'subtletext'],
  };
  return Object.fromEntries(
    Object.entries(aliases).map(([role, names]) => [
      role,
      names.map((name) => values[name]).find(Boolean),
    ]),
  );
}

function parseChannel(value) {
  return value.endsWith('%')
    ? Math.max(0, Math.min(255, Number.parseFloat(value) * 2.55))
    : Math.max(0, Math.min(255, Number.parseFloat(value)));
}

function parseAlpha(value) {
  if (value === undefined) return 1;
  return value.endsWith('%')
    ? Math.max(0, Math.min(1, Number.parseFloat(value) / 100))
    : Math.max(0, Math.min(1, Number.parseFloat(value)));
}

function parseColor(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (value === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = [...digits].map((digit) => digit + digit).join('');
    }
    if (digits.length !== 6 && digits.length !== 8) return null;
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = /^rgba?\((.*)\)$/i.exec(value);
  if (rgb) {
    const parts = rgb[1].replace(/\//g, ',').split(/[,\s]+/).filter(Boolean);
    if (parts.length < 3 || parts.some((part) => Number.isNaN(Number.parseFloat(part)))) return null;
    return {
      r: parseChannel(parts[0]),
      g: parseChannel(parts[1]),
      b: parseChannel(parts[2]),
      a: parseAlpha(parts[3]),
    };
  }
  return null;
}

function composite(foreground, background) {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
    g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
    b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
    a: alpha,
  };
}

function luminance(color) {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const opaqueBackground = background.a < 1
    ? composite(background, { r: 255, g: 255, b: 255, a: 1 })
    : background;
  const opaqueForeground = foreground.a < 1
    ? composite(foreground, opaqueBackground)
    : foreground;
  const light = Math.max(luminance(opaqueForeground), luminance(opaqueBackground));
  const dark = Math.min(luminance(opaqueForeground), luminance(opaqueBackground));
  return (light + 0.05) / (dark + 0.05);
}

function checkPaletteContrast() {
  const jsFiles = projectFiles('.js').filter((file) => !file.endsWith(path.join('tools', 'verify.js')));
  const cssFiles = projectFiles('.css');
  const registry = findPaletteRegistry(jsFiles);
  const cssPalettes = cssPaletteTokens(cssFiles);
  const rootTokens = cssRootTokens(cssFiles);
  const errors = [];
  const warnings = [...registry.warnings];
  const checked = [];

  const palettes = registry.palettes.size
    ? registry.palettes
    : new Map([...cssPalettes.keys()].map((id) => [id, { id, _registries: [] }]));

  if (!registry.palettes.size) {
    warnings.push('aucun registre JS de palettes détecté; contrôle fondé sur les sélecteurs CSS');
  }
  if (!palettes.size) {
    errors.push('aucune palette détectée dans un registre JS ou un sélecteur CSS data-theme/data-palette');
  }

  for (const [id, entry] of palettes) {
    const isCustom = entry.scheme === 'custom'
      || entry.custom === true
      || /^(?:custom|perso|personnalise)$/i.test(id);
    if (isCustom) {
      warnings.push(`palette "${id}" dynamique: contrôle statique ignoré`);
      continue;
    }

    const themeTokens = { ...rootTokens, ...(cssPalettes.get(id) || {}) };
    const roles = paletteRoles(entry, themeTokens);
    const missing = Object.entries(roles)
      .filter(([, value]) => !value)
      .map(([role]) => role);
    if (missing.length) {
      errors.push(`palette "${id}": rôle(s) manquant(s): ${missing.join(', ')}`);
      continue;
    }

    const colors = {};
    for (const [role, value] of Object.entries(roles)) {
      colors[role] = parseColor(value);
      if (!colors[role]) {
        errors.push(`palette "${id}": couleur ${role} non vérifiable: "${value}"`);
      }
    }
    if (Object.values(colors).some((color) => !color)) continue;

    const pairs = [
      ['ink', 'paper'],
      ['ink', 'bg'],
      ['muted', 'paper'],
      ['muted', 'bg'],
    ];
    const ratios = [];
    for (const [foreground, background] of pairs) {
      const ratio = contrastRatio(colors[foreground], colors[background]);
      ratios.push(`${foreground}/${background} ${ratio.toFixed(2)}:1`);
      if (ratio + Number.EPSILON < MIN_TEXT_CONTRAST) {
        errors.push(
          `palette "${id}": contraste ${foreground}/${background} ${ratio.toFixed(2)}:1 `
          + `(minimum ${MIN_TEXT_CONTRAST.toFixed(1)}:1)`,
        );
      }
    }
    const semanticTokens = [
      ['focus', '--focus-ring', 3],
      ['accent-blue', '--accent-blue', MIN_TEXT_CONTRAST],
      ['accent-red', '--accent-red', MIN_TEXT_CONTRAST],
    ];
    for (const [label, token, minimum] of semanticTokens) {
      const color = parseColor(themeTokens[token]);
      if (!color) {
        errors.push(`palette "${id}": couleur sémantique ${token} manquante ou invalide`);
        continue;
      }
      const surfaceRatios = [
        ['paper', contrastRatio(color, colors.paper)],
        ['bg', contrastRatio(color, colors.bg)],
      ];
      const worst = surfaceRatios.reduce((a, b) => a[1] <= b[1] ? a : b);
      ratios.push(`${label} min ${worst[1].toFixed(2)}:1`);
      if (worst[1] + Number.EPSILON < minimum) {
        errors.push(
          `palette "${id}": contraste ${label}/${worst[0]} ${worst[1].toFixed(2)}:1 ` +
          `(minimum ${minimum.toFixed(1)}:1)`,
        );
      }
    }
    checked.push(`${id} (${ratios.join(', ')})`);
  }

  for (const id of cssPalettes.keys()) {
    if (registry.palettes.size && !registry.palettes.has(id)) {
      warnings.push(`palette CSS "${id}" absente du registre JS`);
    }
  }

  const registryLabel = registry.registryNames.length
    ? ` via ${registry.registryNames.join(', ')}`
    : '';
  return {
    summary: `${checked.length} palette(s) vérifiée(s)${registryLabel}`,
    details: checked,
    errors,
    warnings,
  };
}

const checks = [
  ['Syntaxe JavaScript', checkJavaScriptSyntax],
  ['Unicité des id HTML', checkHtmlIds],
  ['Ressources HTML locales', checkHtmlAssets],
  ['Contraste des palettes', checkPaletteContrast],
];

let errorCount = 0;
let warningCount = 0;
console.log('Vérification MontLivre');
console.log('======================');

for (const [name, check] of checks) {
  let result;
  try {
    result = check();
  } catch (error) {
    result = {
      summary: 'échec interne du contrôle',
      errors: [error.stack || error.message],
      warnings: [],
    };
  }

  const passed = result.errors.length === 0;
  console.log(`\n${passed ? 'OK' : 'ÉCHEC'}  ${name} — ${result.summary}`);
  for (const detail of result.details || []) console.log(`  · ${detail}`);
  for (const warning of result.warnings || []) {
    warningCount++;
    console.log(`  AVERTISSEMENT: ${warning}`);
  }
  for (const error of result.errors) {
    errorCount++;
    console.log(`  ERREUR: ${error}`);
  }
}

console.log('\n----------------------');
console.log(`${errorCount} erreur(s), ${warningCount} avertissement(s)`);
process.exitCode = errorCount === 0 ? 0 : 1;
