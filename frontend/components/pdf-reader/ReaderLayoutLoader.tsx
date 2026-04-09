'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const ReaderLayoutClient = dynamic(() => import('./ReaderLayoutClient'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Loading PDF reader…</p>
      </div>
    </div>
  ),
});

export default function ReaderLayoutLoader({ children }: { children: ReactNode }) {
  return <ReaderLayoutClient>{children}</ReaderLayoutClient>;
}
