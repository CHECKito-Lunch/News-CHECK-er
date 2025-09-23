'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type GalleryImage = {
  url: string;
  caption?: string | null;
  sort_order?: number | null;
};

export default function LightboxGallery({ images }: { images: GalleryImage[] }) {
  const sorted = useMemo(
    () =>
      (images ?? [])
        .slice()
        .sort(
          (a, b) =>
            (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
            (b.sort_order ?? Number.MAX_SAFE_INTEGER)
        ),
    [images]
  );

  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  const show = useCallback((i: number) => {
    setIdx(i);
    setOpen(true);
  }, []);

  const prev = useCallback(() => setIdx((i) => (i - 1 + sorted.length) % sorted.length), [sorted.length]);
  const next = useCallback(() => setIdx((i) => (i + 1) % sorted.length), [sorted.length]);

  // ESC / Pfeiltasten
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, prev, next]);

  return (
    <>
      {/* Thumbnails */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {sorted.map((im, i) => (
          <button
            key={`${im.url}-${i}`}
            onClick={() => show(i)}
            className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Bild vergrößern"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.url} alt={im.caption ?? ''} className="w-full h-40 object-cover" />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {open && sorted[idx] && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              className="absolute -top-3 -right-3 bg-white/90 hover:bg-white text-gray-800 rounded-full w-9 h-9 shadow flex items-center justify-center"
              aria-label="Schließen"
              title="Schließen (Esc)"
            >
              ✕
            </button>

            {/* Prev / Next */}
            {sorted.length > 1 && (
              <>
                <button
                  onClick={prev}
                  className="absolute left-0 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full w-10 h-10 shadow flex items-center justify-center"
                  aria-label="Vorheriges Bild"
                  title="Vorheriges (←)"
                >
                  ‹
                </button>
                <button
                  onClick={next}
                  className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full w-10 h-10 shadow flex items-center justify-center"
                  aria-label="Nächstes Bild"
                  title="Nächstes (→)"
                >
                  ›
                </button>
              </>
            )}

            {/* Image */}
            <div className="bg-black rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sorted[idx].url}
                alt={sorted[idx].caption ?? ''}
                className="w-full max-h-[80vh] object-contain bg-black"
              />
            </div>

            {/* Caption + Counter */}
            <div className="mt-2 flex items-center justify-between text-sm text-gray-200">
              <div className="truncate">{sorted[idx].caption}</div>
              {sorted.length > 1 && (
                <div className="opacity-80">{idx + 1} / {sorted.length}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
