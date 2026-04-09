'use client';

import { usePDFReader } from './PDFReaderProvider';

export function PDFReaderCanvas() {
  const { pdfDoc, pageLoading, canvasSize, canvasRef, textLayerRef, pageContainerRef, readError } = usePDFReader();

  return (
    <>
      {readError && (
        <div className="shrink-0 px-6 py-2 bg-red-950/80 border-b border-red-900 text-red-200 text-sm text-center">
          {readError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex w-full flex-1 items-start justify-center px-6 py-8">
          {!pdfDoc ? (
            <div className="flex min-h-[50vh] w-full items-center justify-center">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div
              ref={pageContainerRef}
              className="relative max-w-full shrink-0 overflow-hidden bg-white shadow-2xl"
              style={{
                width: canvasSize.width ? Math.round(canvasSize.width) : undefined,
                height: canvasSize.height ? Math.round(canvasSize.height) : undefined,
              }}
            >
              <canvas ref={canvasRef} className="block max-w-full" />

              <div
                ref={textLayerRef}
                className="textLayer absolute top-0 left-0"
                style={{ pointerEvents: 'none' }}
              />

              {pageLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
