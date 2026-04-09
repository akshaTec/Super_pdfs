'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { getPdfFile, clearPdfFile } from '@/lib/pdfStore';
import { AudioQueue } from './audio-queue';
import { loadPdfJs, type PdfJsModule } from './loadPdfJs';
import { splitIntoSentences } from './sentences';

type TextLayerInstance = InstanceType<PdfJsModule['TextLayer']>;

export type PDFReaderContextValue = {
  pdfDoc: PDFDocumentProxy | null;
  currentPage: number;
  totalPages: number;
  scale: number;
  fileName: string;
  thumbnails: string[];
  pageLoading: boolean;
  canvasSize: { width: number; height: number };
  isReading: boolean;
  readingStatus: 'idle' | 'connecting' | 'reading' | 'done';
  readError: string | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  textLayerRef: React.RefObject<HTMLDivElement | null>;
  pageContainerRef: React.RefObject<HTMLDivElement | null>;
  sidebarRef: React.RefObject<HTMLDivElement | null>;
  stopReading: () => void;
  startReading: () => Promise<void>;
  goToPage: (page: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  leaveReader: () => void;
  clearReadError: () => void;
};

const PDFReaderContext = createContext<PDFReaderContextValue | null>(null);

export function usePDFReader(): PDFReaderContextValue {
  const ctx = useContext(PDFReaderContext);
  if (!ctx) {
    throw new Error('usePDFReader must be used within PDFReaderProvider');
  }
  return ctx;
}

export function PDFReaderProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [fileName, setFileName] = useState('');
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [pageLoading, setPageLoading] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const [isReading, setIsReading] = useState(false);
  const [activeSentenceId, setActiveSentenceId] = useState<number | null>(null);
  const [readingStatus, setReadingStatus] = useState<'idle' | 'connecting' | 'reading' | 'done'>('idle');
  const [readError, setReadError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<ReturnType<PDFPageProxy['render']> | null>(null);
  const textLayerInstanceRef = useRef<TextLayerInstance | null>(null);
  const sentenceMapRef = useRef<Map<number, Set<number>>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const audioQueueRef = useRef<AudioQueue | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  /** True while startReading is setting up or a session is active — blocks overlapping starts (state updates are async). */
  const readingSessionLockRef = useRef(false);

  useEffect(() => {
    const file = getPdfFile();
    if (!file) {
      router.push('/');
      return;
    }
    setFileName(file.name);

    let destroyed = false;

    (async () => {
      const pdfjs = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      if (destroyed) {
        doc.destroy();
        return;
      }
      pdfDocRef.current = doc;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      generateThumbnails(doc);
    })().catch(console.error);

    return () => {
      destroyed = true;
      pdfDocRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateThumbnails = useCallback(async (doc: PDFDocumentProxy) => {
    const thumbs: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      try {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 0.18 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
        thumbs.push(canvas.toDataURL());
        page.cleanup();
      } catch {
        thumbs.push('');
      }
      setThumbnails([...thumbs]);
    }
  }, []);

  useEffect(() => {
    if (!pdfDoc) return;

    let cancelled = false;

    (async () => {
      const pdfjs = await loadPdfJs();
      setPageLoading(true);

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      if (textLayerInstanceRef.current) {
        textLayerInstanceRef.current.cancel();
        textLayerInstanceRef.current = null;
      }

      const page = await pdfDoc.getPage(currentPage);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setCanvasSize({ width: viewport.width, height: viewport.height });

      const renderTask = page.render({ canvas, viewport });
      renderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch (e: unknown) {
        if ((e as { name?: string }).name === 'RenderingCancelledException') return;
        throw e;
      }

      if (cancelled) return;

      const textDiv = textLayerRef.current!;
      textDiv.innerHTML = '';

      const textContent = await page.getTextContent();
      if (cancelled) return;

      const items = (textContent.items as Array<TextItem | TextMarkedContent>)
        .filter((item): item is TextItem => 'str' in item);

      const fullText = items.map((item) => item.str).join('');

      if (!fullText.trim()) {
        textLayerInstanceRef.current = null;
        sentenceMapRef.current = new Map();
        page.cleanup();
        if (!cancelled) setPageLoading(false);
        return;
      }

      const textLayer = new pdfjs.TextLayer({
        textContentSource: textContent,
        container: textDiv,
        viewport,
      });
      textLayerInstanceRef.current = textLayer;

      await textLayer.render();
      if (cancelled) return;

      const sentences = splitIntoSentences(fullText);

      const itemRanges: Array<[number, number]> = [];
      let pos = 0;
      for (const item of items) {
        itemRanges.push([pos, pos + item.str.length]);
        pos += item.str.length;
      }

      const newMap = new Map<number, Set<number>>();
      let sentenceStart = 0;
      for (let si = 0; si < sentences.length; si++) {
        const sentenceEnd = sentenceStart + sentences[si].length;
        const indices = new Set<number>();
        for (let ii = 0; ii < itemRanges.length; ii++) {
          const [iStart, iEnd] = itemRanges[ii];
          if (iStart < sentenceEnd && iEnd > sentenceStart) {
            indices.add(ii);
          }
        }
        newMap.set(si, indices);
        sentenceStart = sentenceEnd;
      }
      sentenceMapRef.current = newMap;

      page.cleanup();
      if (!cancelled) setPageLoading(false);
    })().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    const textLayer = textLayerInstanceRef.current;
    if (!textLayer) return;

    const divs = textLayer.textDivs;
    divs.forEach((div) => div.classList.remove('reading-highlight'));

    if (activeSentenceId === null) return;

    const indices = sentenceMapRef.current.get(activeSentenceId) ?? new Set<number>();
    indices.forEach((i) => {
      if (divs[i]) divs[i].classList.add('reading-highlight');
    });
  }, [activeSentenceId]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const activeThumbnail = sidebar.querySelector<HTMLElement>('[data-active="true"]');
    activeThumbnail?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage]);

  const stopReading = useCallback(() => {
    readingSessionLockRef.current = false;
    wsRef.current?.close();
    wsRef.current = null;
    audioQueueRef.current?.stop();
    audioQueueRef.current = null;
    setIsReading(false);
    setActiveSentenceId(null);
    setReadingStatus('idle');
  }, []);

  const startReading = useCallback(async () => {
    if (!pdfDoc || isReading || readingSessionLockRef.current) return;

    if (wsRef.current || audioQueueRef.current) {
      wsRef.current?.close();
      wsRef.current = null;
      audioQueueRef.current?.stop();
      audioQueueRef.current = null;
      setActiveSentenceId(null);
    }

    readingSessionLockRef.current = true;

    setReadError(null);
    setReadingStatus('connecting');

    const queue = new AudioQueue(
      (id) => setActiveSentenceId(id),
      () => {
        readingSessionLockRef.current = false;
        setIsReading(false);
        setReadingStatus('done');
        setTimeout(() => setReadingStatus('idle'), 2000);
      },
    );
    audioQueueRef.current = queue;
    try {
      await queue.resumeAudioContext();
    } catch (e) {
      console.error(e);
      setReadError('Could not start audio. Check browser permissions.');
      queue.stop();
      audioQueueRef.current = null;
      readingSessionLockRef.current = false;
      setReadingStatus('idle');
      return;
    }

    const page = await pdfDoc.getPage(currentPage);
    const textContent = await page.getTextContent();
    const pageText = (textContent.items as Array<TextItem | TextMarkedContent>)
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str)
      .join(' ');
    page.cleanup();

    if (!pageText.trim()) {
      queue.stop();
      audioQueueRef.current = null;
      readingSessionLockRef.current = false;
      setReadingStatus('idle');
      setReadError('No text found on this page to read.');
      return;
    }

    setIsReading(true);

    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? 'ws://localhost:8000'}/ws/stream_reading`,
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setReadingStatus('reading');
      ws.send(JSON.stringify({ page_text: pageText }));
    };

    ws.onmessage = async (event: MessageEvent) => {
      const data = JSON.parse(event.data as string) as {
        type: string;
        sentence_id?: number;
        audio_b64?: string;
        detail?: string;
      };

      if (data.type === 'audio_chunk' && data.audio_b64 !== undefined && data.sentence_id !== undefined) {
        try {
          await queue.enqueue(data.audio_b64, data.sentence_id);
        } catch (e) {
          console.error('Failed to decode/play audio chunk:', e);
          setReadError('Could not play audio from the server.');
          stopReading();
        }
      } else if (data.type === 'completed') {
        queue.markStreamEnded();
        ws.close();
      } else if (data.type === 'error') {
        console.error('TTS error:', data.detail);
        setReadError(data.detail ?? 'TTS error from server.');
        stopReading();
      }
    };

    ws.onerror = () => {
      setReadError('Could not connect to the reader service. Is the backend running on port 8000?');
      stopReading();
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
  }, [pdfDoc, currentPage, isReading, stopReading]);

  const goToPage = useCallback(
    (page: number) => {
      stopReading();
      setCurrentPage(page);
    },
    [stopReading],
  );

  const zoomIn = useCallback(() => setScale((s) => Math.min(+(s + 0.25).toFixed(2), 3.0)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(+(s - 0.25).toFixed(2), 0.5)), []);
  const zoomReset = useCallback(() => setScale(1.0), []);

  const leaveReader = useCallback(() => {
    stopReading();
    clearPdfFile();
    router.push('/');
  }, [stopReading, router]);

  const clearReadError = useCallback(() => setReadError(null), []);

  const value: PDFReaderContextValue = {
    pdfDoc,
    currentPage,
    totalPages,
    scale,
    fileName,
    thumbnails,
    pageLoading,
    canvasSize,
    isReading,
    readingStatus,
    readError,
    canvasRef,
    textLayerRef,
    pageContainerRef,
    sidebarRef,
    stopReading,
    startReading,
    goToPage,
    zoomIn,
    zoomOut,
    zoomReset,
    leaveReader,
    clearReadError,
  };

  return <PDFReaderContext.Provider value={value}>{children}</PDFReaderContext.Provider>;
}
