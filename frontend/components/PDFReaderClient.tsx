'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { getPdfFile, clearPdfFile } from '@/lib/pdfStore';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// ─── Audio Queue ─────────────────────────────────────────────────────────────

function createAudioContext(): AudioContext {
  const Ctor =
    typeof window !== 'undefined' &&
    (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) {
    throw new Error('Web Audio API is not supported in this browser.');
  }
  return new Ctor();
}

class AudioQueue {
  private ctx: AudioContext;
  private queue: Array<{ buffer: AudioBuffer; sentenceId: number }> = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private onSentenceChange: (id: number | null) => void;
  private onComplete: () => void;
  private cancelled = false;

  constructor(onSentenceChange: (id: number | null) => void, onComplete: () => void) {
    this.ctx = createAudioContext();
    this.onSentenceChange = onSentenceChange;
    this.onComplete = onComplete;
  }

  /** Must run during / right after a user gesture, before other long `await`s, or playback stays silent. */
  async resumeAudioContext(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  async enqueue(base64: string, sentenceId: number): Promise<void> {
    if (this.cancelled) return;
    const binary = atob(base64);
    const buf = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    const audioBuffer = await this.ctx.decodeAudioData(buf);
    if (this.cancelled) return;
    this.queue.push({ buffer: audioBuffer, sentenceId });
    if (!this.isPlaying) this.playNext();
  }

  private playNext(): void {
    if (this.cancelled || this.queue.length === 0) {
      this.isPlaying = false;
      this.onSentenceChange(null);
      if (!this.cancelled) this.onComplete();
      return;
    }
    this.isPlaying = true;
    const { buffer, sentenceId } = this.queue.shift()!;
    this.onSentenceChange(sentenceId);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.onended = () => this.playNext();
    this.currentSource = source;
    source.start();
  }

  stop(): void {
    this.cancelled = true;
    this.queue = [];
    this.isPlaying = false;
    try {
      this.currentSource?.stop();
    } catch {}
    this.onSentenceChange(null);
    try {
      this.ctx.close();
    } catch {}
  }
}

// ─── Sentence splitter ────────────────────────────────────────────────────────

function splitIntoSentences(text: string): string[] {
  const cleaned = text
    .replace(/-\s*\n\s*/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];

  // Split on sentence-ending punctuation followed by a space and uppercase/digit
  const parts = cleaned.split(/(?<=[.!?])\s+(?=[A-Z\d"'([])/);
  return parts.map((s) => s.trim()).filter((s) => s.length > 1);
}

// ─── PDFReaderClient ──────────────────────────────────────────────────────────

export default function PDFReaderClient() {
  const router = useRouter();

  // PDF document state
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [fileName, setFileName] = useState('');
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [pageLoading, setPageLoading] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Audio / TTS state
  const [isReading, setIsReading] = useState(false);
  const [activeSentenceId, setActiveSentenceId] = useState<number | null>(null);
  const [readingStatus, setReadingStatus] = useState<'idle' | 'connecting' | 'reading' | 'done'>('idle');
  const [readError, setReadError] = useState<string | null>(null);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<ReturnType<PDFPageProxy['render']> | null>(null);
  const textLayerInstanceRef = useRef<pdfjsLib.TextLayer | null>(null);
  const sentenceMapRef = useRef<Map<number, Set<number>>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const audioQueueRef = useRef<AudioQueue | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);

  // ─── Load PDF on mount ────────────────────────────────────────────────────

  useEffect(() => {
    const file = getPdfFile();
    if (!file) {
      router.push('/');
      return;
    }
    setFileName(file.name);

    let destroyed = false;

    (async () => {
      const arrayBuffer = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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

  // ─── Thumbnail generation ────────────────────────────────────────────────

  const generateThumbnails = useCallback(async (doc: PDFDocumentProxy) => {
    const thumbs: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      try {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 0.18 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvas, viewport }).promise;
        thumbs.push(canvas.toDataURL());
        page.cleanup();
      } catch {
        thumbs.push('');
      }
      setThumbnails([...thumbs]);
    }
  }, []);

  // ─── Render current page ─────────────────────────────────────────────────

  useEffect(() => {
    if (!pdfDoc) return;

    let cancelled = false;

    (async () => {
      setPageLoading(true);

      // Cancel previous render task
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      // Cancel previous text layer
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

      // Render text layer
      const textDiv = textLayerRef.current!;
      textDiv.innerHTML = '';

      const textContent = await page.getTextContent();
      if (cancelled) return;

      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textDiv,
        viewport,
      });
      textLayerInstanceRef.current = textLayer;

      await textLayer.render();
      if (cancelled) return;

      // Build sentence → text-div index mapping
      const items = (textContent.items as Array<TextItem | TextMarkedContent>)
        .filter((item): item is TextItem => 'str' in item);

      const fullText = items.map((item) => item.str).join('');
      const sentences = splitIntoSentences(fullText);

      // Character range for each text item
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

  // ─── Apply / remove highlights ───────────────────────────────────────────

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

  // ─── Scroll active thumbnail into view ───────────────────────────────────

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const activeThumbnail = sidebar.querySelector<HTMLElement>('[data-active="true"]');
    activeThumbnail?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage]);

  // ─── TTS / WebSocket ─────────────────────────────────────────────────────

  const stopReading = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    audioQueueRef.current?.stop();
    audioQueueRef.current = null;
    setIsReading(false);
    setActiveSentenceId(null);
    setReadingStatus('idle');
  }, []);

  const startReading = useCallback(async () => {
    if (!pdfDoc || isReading) return;

    setReadError(null);
    setReadingStatus('connecting');

    // Create audio pipeline and unlock AudioContext in the same user-gesture turn as the click.
    // If we await PDF work first, the context stays suspended and nothing is audible.
    const queue = new AudioQueue(
      (id) => setActiveSentenceId(id),
      () => {
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

  // Stop reading when changing pages
  const goToPage = useCallback(
    (page: number) => {
      stopReading();
      setCurrentPage(page);
    },
    [stopReading],
  );

  // ─── Zoom helpers ─────────────────────────────────────────────────────────

  const zoomIn = () => setScale((s) => Math.min(+(s + 0.25).toFixed(2), 3.0));
  const zoomOut = () => setScale((s) => Math.max(+(s - 0.25).toFixed(2), 0.5));
  const zoomReset = () => setScale(1.0);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-800 shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => {
              stopReading();
              clearPdfFile();
              router.push('/');
            }}
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
            title="Back to upload"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <span className="font-medium text-sm text-white truncate max-w-xs">{fileName}</span>
          </div>
        </div>

        <span className="text-gray-400 text-sm shrink-0">
          {totalPages > 0 ? `Page ${currentPage} of ${totalPages}` : ''}
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ── Left Sidebar — Page Thumbnails ── */}
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
                    data-active={isActive}
                    onClick={() => goToPage(pageNum)}
                    className={`group relative w-full rounded-md overflow-hidden border-2 transition-all duration-150 ${
                      isActive
                        ? 'border-indigo-500 shadow-lg shadow-indigo-500/30'
                        : 'border-transparent hover:border-gray-600'
                    }`}
                  >
                    {thumb ? (
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

        {/* ── Main Content ── */}
        <main className="flex-1 flex flex-col overflow-hidden bg-gray-800">
          {/* Toolbar */}
          <div className="shrink-0 flex items-center justify-center gap-3 px-6 py-2.5 bg-gray-900/80 backdrop-blur border-b border-gray-700 z-10">
            {/* Zoom controls */}
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-1 py-1">
              <button
                onClick={zoomOut}
                disabled={scale <= 0.5}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-40 transition text-lg font-bold leading-none"
                title="Zoom out"
              >
                −
              </button>
              <button
                onClick={zoomReset}
                className="w-16 text-center text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded py-1 transition"
                title="Reset zoom"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                onClick={zoomIn}
                disabled={scale >= 3.0}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-40 transition text-lg font-bold leading-none"
                title="Zoom in"
              >
                +
              </button>
            </div>

            {/* Page navigation */}
            <div className="flex items-center gap-1">
              <button
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

            {/* Divider */}
            <div className="w-px h-6 bg-gray-700" />

            {/* Read / Stop button */}
            <button
              onClick={() => {
                if (isReading) {
                  setReadError(null);
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

          {readError && (
            <div className="shrink-0 px-6 py-2 bg-red-950/80 border-b border-red-900 text-red-200 text-sm text-center">
              {readError}
            </div>
          )}

          {/* PDF Viewport */}
          <div className="flex-1 overflow-auto flex justify-center py-8 px-6">
            {!pdfDoc ? (
              <div className="flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div
                ref={pageContainerRef}
                className="relative shadow-2xl bg-white"
                style={{
                  width: canvasSize.width || undefined,
                  height: canvasSize.height || undefined,
                }}
              >
                <canvas ref={canvasRef} className="block" />

                {/* Text layer — transparent text spans positioned over the canvas */}
                <div
                  ref={textLayerRef}
                  className="textLayer absolute top-0 left-0"
                  style={{ pointerEvents: 'none' }}
                />

                {/* Page loading overlay */}
                {pageLoading && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                    <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
