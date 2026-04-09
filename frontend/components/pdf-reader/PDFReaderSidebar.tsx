'use client';

import { usePDFReader } from './PDFReaderProvider';

export function PDFReaderSidebar() {
  const { thumbnails, currentPage, sidebarRef, goToPage } = usePDFReader();

  return (
    <aside
      ref={sidebarRef}
      className="bg-gray-900 border-r border-gray-800 overflow-y-auto"
      style={{ width: '168px', minWidth: '168px', flexShrink: 0 }}
    >
      <div className="flex flex-col gap-2.5 p-3">
        {thumbnails.length === 0 ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-full rounded-md bg-gray-800 animate-pulse aspect-3/4" />
            ))}
          </>
        ) : (
          thumbnails.map((thumb, i) => {
            const pageNum = i + 1;
            const isActive = currentPage === pageNum;
            return (
              <button
                key={i}
                type="button"
                data-active={isActive}
                onClick={() => goToPage(pageNum)}
                className={`group relative w-full rounded-md overflow-hidden border-2 transition-all duration-150 ${
                  isActive
                    ? 'border-indigo-500 shadow-lg shadow-indigo-500/30'
                    : 'border-transparent hover:border-gray-600'
                }`}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URLs from pdf.js; next/image not applicable
                  <img src={thumb} alt={`Page ${pageNum}`} className="w-full block bg-white" draggable={false} />
                ) : (
                  <div className="w-full aspect-3/4 bg-gray-700 flex items-center justify-center text-gray-500 text-xs">
                    {pageNum}
                  </div>
                )}
                <div
                  className={`absolute inset-x-0 bottom-0 py-1 text-center text-xs font-medium transition-colors ${
                    isActive ? 'bg-indigo-600/90 text-white' : 'bg-black/50 text-gray-300 group-hover:bg-black/70'
                  }`}
                >
                  {pageNum}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
