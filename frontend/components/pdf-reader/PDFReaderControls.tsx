'use client';

import { usePDFReader } from './PDFReaderProvider';

export function PDFReaderControls() {
  const {
    pdfDoc,
    currentPage,
    totalPages,
    scale,
    isReading,
    readingStatus,
    stopReading,
    startReading,
    goToPage,
    zoomIn,
    zoomOut,
    zoomReset,
    clearReadError,
  } = usePDFReader();

  return (
    <div className="shrink-0 flex flex-wrap items-center justify-center gap-3 px-6 py-2.5 bg-gray-900/80 backdrop-blur border-b border-gray-700 z-10">
      <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-1 py-1">
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= 0.5}
          className="w-7 h-7 flex items-center justify-center rounded text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-40 transition text-lg font-bold leading-none"
          title="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={zoomReset}
          className="w-16 text-center text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded py-1 transition"
          title="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= 3.0}
          className="w-7 h-7 flex items-center justify-center rounded text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-40 transition text-lg font-bold leading-none"
          title="Zoom in"
        >
          +
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-40 transition"
            title="Previous page"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-40 transition"
            title="Next page"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        <span className="text-gray-400 text-sm tabular-nums min-w-30 text-center">
          {totalPages > 0 ? `Page ${currentPage} of ${totalPages}` : ''}
        </span>
      </div>

      <div className="w-px h-6 bg-gray-700 hidden sm:block" aria-hidden />

      <button
        type="button"
        onClick={() => {
          if (isReading) {
            clearReadError();
            stopReading();
          } else {
            void startReading();
          }
        }}
        disabled={readingStatus === 'connecting' || !pdfDoc}
        className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all shadow-sm ${
          isReading
            ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20'
            : readingStatus === 'done'
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed'
        }`}
      >
        {readingStatus === 'connecting' ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Connecting…
          </>
        ) : isReading ? (
          <>
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="4" height="12" rx="1" />
              <rect x="14" y="6" width="4" height="12" rx="1" />
            </svg>
            Stop
          </>
        ) : readingStatus === 'done' ? (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            Done
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
            Read Page
          </>
        )}
      </button>
    </div>
  );
}
