// app/(site)/layout.tsx
import type { ReactNode } from 'react';
import SiteHeader from '../components/SiteHeader';

// gleiche Breite wie im Admin (bei Bedarf hier zentral ändern):
const SHELL_WIDTH = 'max-w-20xl';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className={`container max-w-15xl mx-auto px-4 py-6`}>
        {children}
      </main>
    </div>
  );
}
