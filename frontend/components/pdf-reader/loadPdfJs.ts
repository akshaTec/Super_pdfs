/**
 * pdf.js touches DOM APIs like DOMMatrix at import time. Load it only in the browser
 * via dynamic import so Next.js SSR / RSC never executes `pdf.mjs` in Node.
 */
let cache: Promise<typeof import('pdfjs-dist')> | null = null;

export function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('pdf.js must only load in the browser'));
  }
  if (!cache) {
    cache = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return pdfjs;
    });
  }
  return cache;
}

export type PdfJsModule = Awaited<ReturnType<typeof loadPdfJs>>;
