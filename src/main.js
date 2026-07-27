const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

let win = null;

// Tests : LIVRE_USERDATA isole le profil, LIVRE_EVAL exécute un script
// dans le renderer et logge son résultat, LIVRE_SHOT capture l'écran
if (process.env.LIVRE_USERDATA) app.setPath('userData', process.env.LIVRE_USERDATA);

// Renommage « Livre » → « MontLivre » : le dossier de profil change de nom.
// On rapatrie une seule fois la bibliothèque, les notes, les croquis, les
// réglages et le cache d'extraction pour ne rien perdre à la mise à jour.
function migrateUserData() {
  if (process.env.LIVRE_USERDATA) return;
  try {
    const appData = app.getPath('appData');
    const oldDir = path.join(appData, 'Livre');
    const newDir = path.join(appData, 'MontLivre');
    if (!fsSync.existsSync(oldDir)) return;
    fsSync.mkdirSync(newDir, { recursive: true });
    let migrated = false;
    // Seulement nos données : les caches Chromium n'ont pas à suivre.
    const store = path.join(oldDir, 'livre-store.json');
    const newStore = path.join(newDir, 'livre-store.json');
    if (!fsSync.existsSync(newStore) && fsSync.existsSync(store)) {
      fsSync.copyFileSync(store, newStore);
      migrated = true;
    }
    const cache = path.join(oldDir, 'cache');
    const newCache = path.join(newDir, 'cache');
    if (!fsSync.existsSync(newCache) && fsSync.existsSync(cache)) {
      fsSync.cpSync(cache, newCache, { recursive: true });
      migrated = true;
    }
    if (migrated) console.log('[main] profil repris depuis', oldDir);
  } catch (e) {
    console.error('[main] migration du profil impossible :', e);
  }
}
migrateUserData();

const storePath = () => path.join(app.getPath('userData'), 'livre-store.json');
const cacheDir = () => path.join(app.getPath('userData'), 'cache');
const cachePath = (id) => path.join(cacheDir(), id.replace(/[^a-z0-9-]/gi, '') + '.json');
const allowedReadFiles = new Set();

function readFileKey(filePath) {
  if (typeof filePath !== 'string' || !filePath) return null;
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function authorizeReadFile(filePath, extensions = /\.(pdf|epub)$/i) {
  const key = readFileKey(filePath);
  if (!key || !extensions.test(filePath)) return false;
  allowedReadFiles.add(key);
  return true;
}

function authorizeBookPaths(data) {
  if (!data || !Array.isArray(data.books)) return;
  for (const book of data.books) authorizeReadFile(book && book.path);
}

function assertAuthorizedBookPaths(data) {
  if (!Array.isArray(data.books)) throw new TypeError('bibliothèque invalide');
  for (const book of data.books) {
    const key = readFileKey(book && book.path);
    if (!key || !allowedReadFiles.has(key)) {
      throw new Error('chemin de livre non autorisé');
    }
  }
}

function assertAuthorizedRead(event, filePath) {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('source IPC non autorisée');
  }
  const key = readFileKey(filePath);
  if (!key || !allowedReadFiles.has(key)) throw new Error('fichier non autorisé');
}

let storeTempCounter = 0;
let storeSessionCounter = 0;
const storeRevisionBySender = new Map();

function serializeStore(store) {
  if (!store || typeof store !== 'object' || Array.isArray(store)) {
    throw new TypeError('store invalide');
  }
  const serialized = JSON.stringify(store);
  if (typeof serialized !== 'string') throw new TypeError('store non sérialisable');
  return serialized;
}

function storeTempPath(target, revision) {
  storeTempCounter += 1;
  return `${target}.${process.pid}-${revision}-${storeTempCounter}.tmp`;
}

// Le fsync du dossier rend aussi le renommage durable sur les systèmes POSIX.
// Windows ne permet pas d'ouvrir un dossier de cette façon.
function syncParentDirectory(target) {
  if (process.platform === 'win32') return;
  let fd;
  try {
    fd = fsSync.openSync(path.dirname(target), 'r');
    fsSync.fsyncSync(fd);
  } catch {
    // Le fichier, lui, a déjà été fsync : certains systèmes refusent le fsync
    // des dossiers sans que cela remette en cause l'atomicité du renommage.
  } finally {
    if (fd !== undefined) {
      try { fsSync.closeSync(fd); } catch {}
    }
  }
}

function writeStoreAtomicSync(store, revision) {
  const target = storePath();
  const temp = storeTempPath(target, revision);
  const serialized = serializeStore(store);
  let fd;

  fsSync.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fd = fsSync.openSync(temp, 'wx', 0o600);
    fsSync.writeFileSync(fd, serialized, 'utf8');
    fsSync.fsyncSync(fd);
    fsSync.closeSync(fd);
    fd = undefined;
    fsSync.renameSync(temp, target);
    syncParentDirectory(target);
  } catch (error) {
    if (fd !== undefined) {
      try { fsSync.closeSync(fd); } catch {}
    }
    try { fsSync.unlinkSync(temp); } catch {}
    throw error;
  }
}

async function writeStoreAtomic(store, revision, isCurrent) {
  const target = storePath();
  const temp = storeTempPath(target, revision);
  const serialized = serializeStore(store);
  let file;

  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    file = await fs.open(temp, 'wx', 0o600);
    await file.writeFile(serialized, 'utf8');
    await file.sync();
    await file.close();
    file = null;

    // Le renommage est volontairement synchrone et immédiatement précédé du
    // contrôle de révision : aucune sauvegarde plus ancienne ne peut passer
    // entre les deux et écraser une sauvegarde de fermeture plus récente.
    if (!isCurrent()) {
      await fs.unlink(temp).catch(() => {});
      return false;
    }
    fsSync.renameSync(temp, target);
    syncParentDirectory(target);
    return true;
  } catch (error) {
    if (file) await file.close().catch(() => {});
    await fs.unlink(temp).catch(() => {});
    throw error;
  }
}

function acceptStoreSave(event, request) {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('source IPC non autorisée');
  }
  if (!request || !Number.isSafeInteger(request.session) ||
      !Number.isSafeInteger(request.revision) || request.revision < 1) {
    throw new TypeError('révision de sauvegarde invalide');
  }
  if (!request.store || typeof request.store !== 'object' || Array.isArray(request.store)) {
    throw new TypeError('store invalide');
  }
  // Un chemin ne peut être persisté que s'il provient d'une sélection, d'un
  // glisser-déposer, d'un import ou d'un store déjà approuvé au chargement.
  // Cela empêche un renderer compromis d'empoisonner le store, puis de faire
  // autoriser ce chemin arbitraire au redémarrage suivant.
  assertAuthorizedBookPaths(request.store);

  const senderId = event.sender.id;
  const current = storeRevisionBySender.get(senderId);
  if (!current || request.session !== current.session ||
      request.revision <= current.revision) return null;
  current.revision = request.revision;
  return {
    senderId,
    session: request.session,
    revision: request.revision,
    store: request.store,
  };
}

// PDF/EPUB passés en ligne de commande : `montlivre mon-livre.pdf`
const fileArgs = process.argv
  .slice(app.isPackaged ? 1 : 2)
  .filter((a) => /\.(pdf|epub)$/i.test(a))
  .map((a) => path.resolve(a));
fileArgs.forEach((filePath) => authorizeReadFile(filePath));

function createWindow() {
  const entryPath = path.join(__dirname, 'renderer', 'index.html');
  const entryUrl = pathToFileURL(entryPath).href;
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    title: 'MontLivre',
    backgroundColor: '#F2EBDA',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Le preload donne accès aux fichiers locaux : il ne doit jamais être
  // réexposé après une navigation vers une page distante.
  const keepOnAppPage = (details) => {
    if (details.url !== entryUrl) details.preventDefault();
  };
  win.webContents.on('will-navigate', keepOnAppPage);
  win.webContents.on('will-redirect', keepOnAppPage);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadFile(entryPath);

  win.webContents.on('did-finish-load', async () => {
    console.log('[main] fenêtre chargée');
    if (fileArgs.length) win.webContents.send('open-files', fileArgs);
    if (process.env.LIVRE_EVAL) {
      try {
        const script = await fs.readFile(process.env.LIVRE_EVAL, 'utf8');
        const result = await win.webContents.executeJavaScript(script, true);
        console.log('[eval]', JSON.stringify(result));
      } catch (e) {
        console.error('[eval] échec :', e);
      }
    }
  });
  win.webContents.on('console-message', function onConsoleMessage(details) {
    // Electron 35+ porte les informations sur l'événement. Une fonction à un
    // seul paramètre évite l'avertissement de dépréciation d'Electron 43.
    // `arguments` maintient le fallback pour les anciennes versions.
    const isNew = details && typeof details.message === 'string';
    const lvl = isNew ? details.level : arguments[1];
    const msg = isNew ? details.message : arguments[2];
    if (lvl === 'error' || lvl === 3) console.error('[renderer]', msg);
  });
  win.webContents.on('render-process-gone', (_e, details) =>
    console.error('[main] renderer parti :', details.reason));

  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));

  // Capture d'écran automatisée pour les tests : LIVRE_SHOT=chemin.png
  if (process.env.LIVRE_SHOT) {
    setTimeout(async () => {
      try {
        const img = await win.webContents.capturePage();
        await fs.writeFile(process.env.LIVRE_SHOT, img.toPNG());
        console.log('[main] capture enregistrée :', process.env.LIVRE_SHOT);
      } catch (e) {
        console.error('[main] capture impossible :', e);
      }
      app.quit();
    }, Number(process.env.LIVRE_SHOT_DELAY) || 9000);
  }
}

ipcMain.handle('pick-books', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Ajouter des livres',
    filters: [
      { name: 'Livres (PDF, EPUB)', extensions: ['pdf', 'epub'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'EPUB', extensions: ['epub'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });
  if (r.canceled) return [];
  r.filePaths.forEach((filePath) => authorizeReadFile(filePath));
  return r.filePaths;
});

ipcMain.on('authorize-dropped-file', (event, filePath) => {
  try {
    if (!win || win.isDestroyed() || event.sender !== win.webContents) {
      throw new Error('source IPC non autorisée');
    }
    event.returnValue = authorizeReadFile(filePath);
  } catch {
    event.returnValue = false;
  }
});

ipcMain.handle('read-file', (event, filePath) => {
  assertAuthorizedRead(event, filePath);
  return fs.readFile(filePath);
});
ipcMain.handle('file-signature', async (event, filePath) => {
  assertAuthorizedRead(event, filePath);
  const stat = await fs.stat(filePath);
  return { size: stat.size, mtimeMs: Math.trunc(stat.mtimeMs) };
});

ipcMain.handle('pick-font', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Importer une police',
    filters: [{ name: 'Polices', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
    properties: ['openFile'],
  });
  if (r.canceled) return null;
  const filePath = r.filePaths[0];
  return authorizeReadFile(filePath, /\.(ttf|otf|woff2?)$/i) ? filePath : null;
});

ipcMain.handle('load-store', async () => {
  try {
    const data = JSON.parse(await fs.readFile(storePath(), 'utf8'));
    authorizeBookPaths(data);
    return data;
  } catch {
    return null;
  }
});

ipcMain.on('begin-store-session', (event) => {
  try {
    if (!win || win.isDestroyed() || event.sender !== win.webContents) {
      throw new Error('source IPC non autorisée');
    }
    const session = ++storeSessionCounter;
    storeRevisionBySender.set(event.sender.id, { session, revision: 0 });
    event.returnValue = session;
  } catch (error) {
    console.error('[main] initialisation de la sauvegarde impossible :', error);
    event.returnValue = false;
  }
});

ipcMain.handle('save-store', async (event, request) => {
  let save;
  try {
    save = acceptStoreSave(event, request);
    if (!save) return false;
    return await writeStoreAtomic(save.store, save.revision,
      () => {
        const current = storeRevisionBySender.get(save.senderId);
        return current && current.session === save.session &&
          current.revision === save.revision;
      });
  } catch (error) {
    console.error('[main] sauvegarde du store impossible :', error);
    return false;
  }
});

ipcMain.on('save-store-sync', (event, request) => {
  try {
    const save = acceptStoreSave(event, request);
    if (save) writeStoreAtomicSync(save.store, save.revision);
    event.returnValue = true;
  } catch (error) {
    console.error('[main] sauvegarde synchrone du store impossible :', error);
    // Toujours répondre : sendSync ne doit jamais rester bloqué, même si le
    // disque est plein ou si les données reçues sont invalides.
    event.returnValue = false;
  }
});

ipcMain.handle('load-cache', async (_e, id) => {
  try {
    return JSON.parse(await fs.readFile(cachePath(id), 'utf8'));
  } catch {
    return null;
  }
});

ipcMain.handle('save-cache', async (_e, id, data) => {
  await fs.mkdir(cacheDir(), { recursive: true });
  await fs.writeFile(cachePath(id), JSON.stringify(data));
  return true;
});

ipcMain.handle('delete-cache', async (_e, id) => {
  try {
    await fs.unlink(cachePath(id));
  } catch {}
  return true;
});

const FILTERS = {
  md: [{ name: 'Markdown', extensions: ['md'] }],
  json: [{ name: 'Bibliothèque MontLivre (JSON)', extensions: ['json'] }],
};

// Tests : écrit dans LIVRE_TEST_EXPORT_DIR sans dialogue
async function testExportPath(defaultName) {
  if (!process.env.LIVRE_TEST_EXPORT_DIR) return undefined;
  await fs.mkdir(process.env.LIVRE_TEST_EXPORT_DIR, { recursive: true });
  return path.join(process.env.LIVRE_TEST_EXPORT_DIR, defaultName);
}

ipcMain.handle('export-file', async (_e, { defaultName, content, kind = 'md' }) => {
  let filePath = await testExportPath(defaultName);
  if (!filePath) {
    const r = await dialog.showSaveDialog(win, {
      title: 'Exporter',
      defaultPath: defaultName,
      filters: FILTERS[kind] || FILTERS.md,
    });
    if (r.canceled || !r.filePath) return null;
    filePath = r.filePath;
  }
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
});

ipcMain.handle('import-file', async (_e, { kind = 'json' } = {}) => {
  let filePath = process.env.LIVRE_TEST_IMPORT_FILE;
  if (!filePath) {
    const r = await dialog.showOpenDialog(win, {
      title: 'Importer',
      filters: FILTERS[kind] || FILTERS.json,
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    filePath = r.filePaths[0];
  }
  const content = await fs.readFile(filePath, 'utf8');
  if (kind === 'json') {
    try {
      const imported = JSON.parse(content);
      // Un JSON quelconque ne doit pas suffire à accorder des lectures. Seul
      // un véritable export MontLivre (y compris l'ancien nom « livre ») peut
      // restaurer les chemins qu'il contient.
      if (imported && ['montlivre', 'livre'].includes(imported.app)) {
        authorizeBookPaths(imported);
      }
    } catch {
      // Le renderer affichera le message d'import invalide approprié.
    }
  }
  return { path: filePath, content };
});

// Export d'un PDF de notes : rendu HTML → printToPDF dans une fenêtre cachée
ipcMain.handle('export-pdf', async (event, payload) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('source IPC non autorisée');
  }
  if (!payload || typeof payload.defaultName !== 'string' ||
      typeof payload.html !== 'string' || payload.defaultName.length > 240 ||
      payload.html.length > 8 * 1024 * 1024) {
    throw new TypeError('export PDF invalide');
  }
  const { defaultName, html } = payload;
  let filePath = await testExportPath(defaultName);
  if (!filePath) {
    const r = await dialog.showSaveDialog(win, {
      title: 'Exporter en PDF',
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return null;
    filePath = r.filePath;
  }
  const csp = `<meta http-equiv="Content-Security-Policy" ` +
    `content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; ` +
    `base-uri 'none'; object-src 'none'; frame-src 'none'; form-action 'none';">`;
  // Le squelette et sa politique précèdent toujours le HTML reçu. Même un
  // fragment contenant de faux <head> dans un commentaire ne peut donc pas
  // neutraliser ou retarder l'application de la CSP.
  const securedHtml = `<!DOCTYPE html><html lang="fr"><head>` +
    `<meta charset="utf-8">${csp}</head><body>${html}</body></html>`;
  const w = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      javascript: false,
      webSecurity: true,
    },
  });
  // Même un document compromis ne peut ni quitter sa page data:, ni ouvrir
  // une fenêtre annexe pour contourner la politique réseau ci-dessus.
  w.webContents.on('will-navigate', (details) => details.preventDefault());
  w.webContents.on('will-redirect', (details) => details.preventDefault());
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(securedHtml));
    const pdf = await w.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    await fs.writeFile(filePath, pdf);
  } finally {
    w.destroy();
  }
  return filePath;
});

ipcMain.handle('toggle-fullscreen', () => {
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});

ipcMain.handle('get-version', () => app.getVersion());

/* ---------- Mise à jour intégrée (GitHub Releases) ----------
   Uniquement à la demande de l'utilisateur : aucune vérification
   automatique au démarrage (principe offline). */
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch {}

ipcMain.handle('check-updates', async () => {
  if (!app.isPackaged) return { status: 'dev' };
  if (!autoUpdater) return { status: 'error', message: 'module de mise à jour absent' };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  return await new Promise((resolve) => {
    autoUpdater.removeAllListeners();
    autoUpdater.on('update-available', (i) =>
      win.webContents.send('update-state', { state: 'downloading', version: i.version }));
    autoUpdater.on('download-progress', (p) =>
      win.webContents.send('update-state', { state: 'progress', percent: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (i) => {
      win.webContents.send('update-state', { state: 'ready', version: i.version });
      resolve({ status: 'ready', version: i.version });
    });
    autoUpdater.on('update-not-available', () => resolve({ status: 'uptodate' }));
    autoUpdater.on('error', (e) => resolve({ status: 'error', message: String((e && e.message) || e) }));
    autoUpdater.checkForUpdates().catch((e) => resolve({ status: 'error', message: String(e) }));
  });
});

ipcMain.handle('install-update', () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});

// Ouverture d'un lien externe (dictionnaire) : restreint au Wiktionnaire fr
ipcMain.handle('open-external', (_e, url) => {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && u.hostname === 'fr.wiktionary.org') {
      shell.openExternal(url);
      return true;
    }
  } catch {}
  return false;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
