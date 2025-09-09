'use client';

import { useEffect, useState } from 'react';

export default function EventGallery({
  heroUrl,
  images,
  title,
}: { heroUrl: string | null; images: string[]; title: string }) {
  const urls = [heroUrl, ...images].filter(Boolean) as string[];
  const [idx, setIdx] = useState<number | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (idx === null) return;
      if (e.key === 'Escape') setIdx(null);
      if (e.key === 'ArrowRight') setIdx((i) => (i === null ? null : (i + 1) % urls.length));
      if (e.key === 'ArrowLeft') setIdx((i) => (i === null ? null : (i - 1 + urls.length) % urls.length));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, urls.length]);

  if (urls.length === 0) return null;

  return (
    <div className="space-y-3">
      {heroUrl && (
        <button
          type="button"
          onClick={() => setIdx(0)}
          className="block w-full"
          title="Bild öffnen"
        >
          <img
            src={heroUrl}
            alt={title}
            className="w-full h-64 sm:h-72 md:h-80 object-cover rounded-2xl border border-gray-200 dark:border-gray-800"
          />
        </button>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {images.map((u, i) => {
            const realIndex = (heroUrl ? 1 : 0) + i;
            return (
              <li key={u + i}>
                <button
                  type="button"
                  onClick={() => setIdx(realIndex)}
                  className="block w-full"
                  title="Bild öffnen"
                >
                  <img
                    src={u}
                    alt=""
                    className="h-24 w-full object-cover rounded-lg border border-gray-200 dark:border-gray-800"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Lightbox */}
      {idx !== null && urls[idx] && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIdx(null)}
        >
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={urls[idx]}
              alt=""
              className="w-full max-h-[85vh] object-contain rounded-xl border border-white/10"
            />
            <button
              className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-white/90 text-gray-900 text-sm"
              onClick={() => setIdx(null)}
            >
              Schließen
            </button>
            {urls.length > 1 && (
              <>
                <button
                  className="absolute top-1/2 -translate-y-1/2 left-2 px-3 py-2 rounded-full bg-white/90 text-gray-900"
                  onClick={() => setIdx((i) => (i === null ? null : (i - 1 + urls.length) % urls.length))}
                >
                  ←
                </button>
                <button
                  className="absolute top-1/2 -translate-y-1/2 right-2 px-3 py-2 rounded-full bg-white/90 text-gray-900"
                  onClick={() => setIdx((i) => (i === null ? null : (i + 1) % urls.length))}
                >
                  →
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
