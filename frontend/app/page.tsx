'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setPdfFile } from '@/lib/pdfStore';

export default function UploadPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        setError('Please upload a PDF file.');
        return;
      }
      setError(null);
      setPdfFile(file);
      router.push('/reader');
    },
    [router],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-950 via-slate-900 to-indigo-950 flex items-center justify-center p-8">
      <div className="w-full max-w-xl">
        {/* Logo / Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-indigo-600 mb-6 shadow-xl shadow-indigo-500/40">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
              />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">SuperPDF Reader</h1>
          <p className="text-slate-400 text-lg">Upload a PDF and have it read aloud with text highlighting</p>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer
            transition-all duration-200 select-none
            ${
              isDragging
                ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01]'
                : 'border-slate-600 bg-slate-800/50 hover:border-indigo-500 hover:bg-slate-800/80'
            }
          `}
        >
          <div
            className={`inline-flex items-center justify-center w-16 h-16 rounded-xl mb-6 transition-colors ${isDragging ? 'bg-indigo-500/20' : 'bg-slate-700'}`}
          >
            <svg
              className={`w-8 h-8 transition-colors ${isDragging ? 'text-indigo-400' : 'text-slate-400'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>

          <h2 className={`text-xl font-semibold mb-2 transition-colors ${isDragging ? 'text-indigo-300' : 'text-white'}`}>
            {isDragging ? 'Drop it here!' : 'Drop your PDF here'}
          </h2>
          <p className="text-slate-400">
            or <span className="text-indigo-400 font-medium">browse files</span>
          </p>
          <p className="text-slate-500 text-sm mt-4">PDF files only</p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-.75-4.75a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-1.5 0v4.5zm.75-8.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"
              />
            </svg>
            <span className="text-sm">{error}</span>
          </div>
        )}

        <p className="mt-8 text-center text-slate-600 text-sm">
          Your PDF is processed locally — nothing is uploaded to any server
        </p>
      </div>
    </div>
  );
}
