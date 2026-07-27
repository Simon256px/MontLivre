'use strict';

/* ═══════════ OCR des PDF scannés (Tesseract WASM) ═══════════
   100 % offline : le moteur (tesseract.js-core) et les modèles
   français + anglais sont embarqués dans l'app. Chaque page du PDF
   est rendue en image puis reconnue ; le texte est réassemblé en
   paragraphes. Progression et interruption partagées avec le loader. */

const OCR_LANG = 'fra+eng';
let ocrWorker = null;
let ocrWorkerGeneration = 0;
let ocrInitialization = null;
let ocrGeneration = 0;
let ocrPage = 0, ocrTotal = 1, ocrPageProgress = 0;

function ocrAvailable() {
  return typeof Tesseract !== 'undefined';
}

function ocrPaths() {
  const u = (p) => new URL(p, location.href).href;
  return {
    workerPath: u('../../node_modules/tesseract.js/dist/worker.min.js'),
    corePath: u('../../node_modules/tesseract.js-core/'),
    langPath: u('vendor/tessdata/'),
  };
}

function ocrShowProgress() {
  const done = Math.min(ocrTotal, ocrPage + ocrPageProgress);
  setProgress(done, ocrTotal, `Reconnaissance du texte (OCR) — page ${Math.min(ocrPage + 1, ocrTotal)} / ${ocrTotal}`);
}

function cancelOcrInitialization() {
  ocrGeneration++;
}

function getOcrWorker(generation) {
  if (ocrWorker && ocrWorkerGeneration === generation) {
    return Promise.resolve(ocrWorker);
  }
  if (ocrInitialization && ocrInitialization.generation === generation) {
    return ocrInitialization.promise;
  }
  const { workerPath, corePath, langPath } = ocrPaths();
  const initialization = { generation, promise: null };
  initialization.promise = Tesseract.createWorker(OCR_LANG, 1, {
      workerPath, corePath, langPath,
      gzip: false, // les .traineddata embarqués ne sont pas compressés
      logger: (m) => {
        if (generation === ocrGeneration &&
            m.status === 'recognizing text' && typeof m.progress === 'number') {
          ocrPageProgress = m.progress;
          ocrShowProgress();
        }
      },
      errorHandler: (e) => console.error('[ocr]', e),
    })
    .then(async (worker) => {
      // Le worker appartient à une tentative précise. Une annulation, même
      // suivie très vite d'une nouvelle ouverture, le rend définitivement
      // obsolète et il ne peut pas remplacer le worker de la nouvelle lecture.
      if (generation !== ocrGeneration || loadCancelled) {
        try { await worker.terminate(); } catch {}
        throw new CancelledError();
      }
      ocrWorker = worker;
      ocrWorkerGeneration = generation;
      return worker;
    })
    .finally(() => {
      if (ocrInitialization === initialization) ocrInitialization = null;
    });
  ocrInitialization = initialization;
  return initialization.promise;
}

async function ocrTerminate(worker) {
  if (!worker) return;
  if (ocrWorker === worker) {
    ocrWorker = null;
    ocrWorkerGeneration = 0;
  }
  try { await worker.terminate(); } catch {}
}

// Réassemble le texte OCR d'une page en paragraphes (bloc = ligne(s)
// séparées par une ligne vide ; césures de fin de ligne recollées)
function ocrTextToParas(text, paras) {
  for (const block of (text || '').split(/\n{2,}/)) {
    const t = block
      .replace(/-\n(\p{Ll})/gu, '$1') // césure « exem-\nple » → « exemple »
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length > 1) paras.push({ type: 'p', text: t });
  }
}

async function ocrPdf(pdf) {
  showLoader('Préparation de l’OCR…', { progress: true, cancelable: true });
  const generation = ++ocrGeneration;
  const paras = [];
  ocrTotal = pdf.numPages;
  let worker = null;
  try {
    worker = await cancellable(getOcrWorker(generation));
    if (generation !== ocrGeneration) throw new CancelledError();
    throwIfCancelled();
    for (let i = 1; i <= pdf.numPages; i++) {
      if (generation !== ocrGeneration) throw new CancelledError();
      throwIfCancelled();
      ocrPage = i - 1;
      ocrPageProgress = 0;
      ocrShowProgress();
      const page = await cancellable(pdf.getPage(i));
      const base = page.getViewport({ scale: 1 });
      // vise ~2000 px de large pour une bonne reconnaissance (~250 dpi)
      const scale = Math.min(3, Math.max(1.5, 2000 / base.width));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await cancellable(page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise);
      const { data } = await cancellable(worker.recognize(canvas));
      ocrTextToParas(data.text, paras);
      canvas.width = canvas.height = 0; // libère la mémoire du canvas
      if (page.cleanup) page.cleanup();
    }
  } finally {
    await ocrTerminate(worker);
  }
  const words = paras.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
  return { paras, words, ocr: true };
}
