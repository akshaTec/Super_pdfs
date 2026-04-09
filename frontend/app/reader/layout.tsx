import type { ReactNode } from 'react';
import ReaderLayoutLoader from '@/components/pdf-reader/ReaderLayoutLoader';

export default function ReaderLayout({ children }: { children: ReactNode }) {
  return <ReaderLayoutLoader>{children}</ReaderLayoutLoader>;
}
