// app/(site)/layout.tsx
import type { ReactNode } from 'react';
import SiteHeader from '../components/SiteHeader';

// gleiche Breite wie im Admin (bei Bedarf hier zentral ändern):
const SHELL_WIDTH = 'max-w-15xl';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* Header-Stil wie Admin */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/70 dark:bg-gray-900/70 backdrop-blur">
        <div className={`container ${SHELL_WIDTH} mx-auto py-3`}>
          {/* Deine bestehende Kopfzeile bleibt erhalten, nur in die gleiche Shell gesetzt */}
          <SiteHeader />
        </div>
      </header>

      {/* Main-Bereich ebenfalls in gleicher Breite */}
      <main className={`container ${SHELL_WIDTH} mx-auto px-4 py-6`}>
        {children}
      </main>
    </div>
  );
}
