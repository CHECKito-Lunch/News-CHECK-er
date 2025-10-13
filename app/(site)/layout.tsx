// app/(site)/layout.tsx
'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';

// gleiche Breite wie im Admin (bei Bedarf hier zentral ändern):
const SHELL_WIDTH = 'max-w-30xl';

function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      setVisible(window.scrollY > 200);
    };
    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      onClick={scrollToTop}
      className={`
        fixed bottom-6 right-6 z-50 flex items-center justify-center 
        rounded-full p-3 shadow-lg backdrop-blur-sm transition-all duration-300 
        bg-blue-600/90 hover:bg-blue-700 text-white hover:scale-110
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}
      `}
      aria-label="Nach oben scrollen"
    >
      <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
    </button>
  );
}

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen relative">
      <SiteHeader />

      <main className={`container max-w-15xl mx-auto px-4 py-6`}>
        {children}
      </main>

      {/* Global Sticky "UP" Button */}
      <ScrollToTopButton />
    </div>
  );
}
