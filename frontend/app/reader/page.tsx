'use client';

import { PDFReaderControls } from '@/components/pdf-reader/PDFReaderControls';
import { PDFReaderCanvas } from '@/components/pdf-reader/PDFReaderCanvas';

export default function ReaderPage() {
  return (
    <>
      <PDFReaderControls />
      <PDFReaderCanvas />
    </>
  );
}
