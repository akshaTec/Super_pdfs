'use client';

import type { ReactNode } from 'react';
import { PDFReaderProvider } from './PDFReaderProvider';
import { PDFReaderHeader } from './PDFReaderHeader';
import { PDFReaderSidebar } from './PDFReaderSidebar';

export default function ReaderLayoutClient({ children }: { children: ReactNode }) {
  return (
    <PDFReaderProvider>
      <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
        <PDFReaderHeader />
        <div className="flex flex-1 overflow-hidden min-h-0">
          <PDFReaderSidebar />
          <div className="flex-1 flex flex-col overflow-hidden bg-gray-800 min-w-0">{children}</div>
        </div>
      </div>
    </PDFReaderProvider>
  );
}
