const { contextBridge, ipcRenderer, webUtils } = require('electron');

const storeSession = ipcRenderer.sendSync('begin-store-session');
let storeRevision = 0;
let latestStore = null;
let isUnloading = false;
let openFilesListener = null;
const pendingOpenFiles = [];

// Le processus principal peut envoyer les arguments de ligne de commande dès
// `did-finish-load`, avant la fin de la restauration asynchrone du renderer.
// On les met en file pour ne jamais perdre l'ouverture demandée.
ipcRenderer.on('open-files', (_event, paths) => {
  if (openFilesListener) openFilesListener(paths);
  else pendingOpenFiles.push(paths);
});

function saveStore(store) {
  latestStore = store;
  const request = { session: storeSession, revision: ++storeRevision, store };
  if (isUnloading) return ipcRenderer.sendSync('save-store-sync', request);
  return ipcRenderer.invoke('save-store', request);
}

// Le renderer possède déjà son flush `beforeunload`. Ce listener, enregistré
// avant lui, fait basculer cet appel vers l'IPC synchrone. Il réécrit aussi le
// dernier instantané connu pour conserver une sauvegarde de secours si le
// listener du renderer ne peut pas aller jusqu'au bout.
window.addEventListener('beforeunload', () => {
  isUnloading = true;
  if (latestStore) {
    try {
      ipcRenderer.sendSync('save-store-sync', {
        session: storeSession,
        revision: ++storeRevision,
        store: latestStore,
      });
    } catch {}
  }
});

contextBridge.exposeInMainWorld('livre', {
  pickBooks: () => ipcRenderer.invoke('pick-books'),
  pickFont: () => ipcRenderer.invoke('pick-font'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  fileSignature: (filePath) => ipcRenderer.invoke('file-signature', filePath),
  loadStore: () => ipcRenderer.invoke('load-store'),
  saveStore,
  loadCache: (id) => ipcRenderer.invoke('load-cache', id),
  saveCache: (id, data) => ipcRenderer.invoke('save-cache', id, data),
  deleteCache: (id) => ipcRenderer.invoke('delete-cache', id),
  exportFile: (opts) => ipcRenderer.invoke('export-file', opts),
  importFile: (opts) => ipcRenderer.invoke('import-file', opts),
  exportPdf: (opts) => ipcRenderer.invoke('export-pdf', opts),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateState: (cb) => ipcRenderer.on('update-state', (_e, s) => cb(s)),
  onFullscreen: (cb) => ipcRenderer.on('fullscreen', (_e, on) => cb(on)),
  onOpenFiles: (cb) => {
    openFilesListener = cb;
    while (pendingOpenFiles.length) cb(pendingOpenFiles.shift());
  },
  pathForFile: (file) => {
    try {
      const filePath = webUtils.getPathForFile(file);
      return filePath && ipcRenderer.sendSync('authorize-dropped-file', filePath)
        ? filePath
        : null;
    } catch {
      return null;
    }
  },
});
