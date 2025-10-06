// app/components/ScrollToTopButton.tsx
'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import clsx from 'clsx';

export default function ScrollToTopButton({
  className,
  threshold = 200,
}: {
  className?: string;
  threshold?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <button
      onClick={scrollToTop}
      aria-label="Nach oben scrollen"
      className={clsx(
        `fixed bottom-6 right-6 z-50 flex items-center justify-center
         rounded-full p-3 shadow-lg backdrop-blur-sm transition-all duration-300
         bg-blue-600/90 hover:bg-blue-700 text-white hover:scale-110
         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
         dark:focus:ring-offset-gray-900
         `,
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none',
        className
      )}
    >
      <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
    </button>
  );
}
