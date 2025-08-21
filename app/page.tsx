// app/page.tsx
'use client';

import './globals.css';
import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ThemeToggle from './components/ThemeToggle';

// Typen
type Badge = { id: number; name: string; color: string; kind: string };
type Category = { id: number; name: string; color: string };
type Vendor = { id: number; name: string };
type Item = {
  id: number;
  slug: string | null;
  title: string;
  summary: string | null;
  content: string | null;
  priority: number | null;
  pinned_until: string | null;
  effective_from: string | null;
  vendor: Vendor | null;
  post_categories: { category: Category }[];
  post_badges: { badge: Badge }[];
};
type Meta = {
  categories: Category[];
  badges: Badge[];
  vendors: Vendor[];
};

type FilterSectionProps = {
  title: string;
  options: { id: number; name: string }[];
  selected: number[];
  onToggle: (id: number) => void;
  getColor?: (id: number) => string | undefined;
};

// kleine Hilfs-Styles wie im Admin
const inputClass =
  'rounded-xl px-3 py-2 w-full bg-white text-gray-900 placeholder-gray-500 border border-gray-300 ' +
  'shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';

const btnBase =
  'px-3 py-2 rounded-xl text-sm font-medium transition border ' +
  'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 ' +
  'dark:bg-white/10 dark:text-white dark:hover:bg-white/20 dark:border-gray-700';

const btnPrimary =
  'px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium shadow disabled:opacity-50';

export default function Page() {
  const [q, setQ] = useState<string>('');
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedCats, setSelectedCats] = useState<number[]>([]);
  const [selectedBadges, setSelectedBadges] = useState<number[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<number[]>([]);
  const [meta, setMeta] = useState<Meta>({ categories: [], badges: [], vendors: [] });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const pageSize = 20;

  // Meta laden
  useEffect(() => {
    fetch('/api/meta').then(r => r.json()).then(setMeta);
  }, []);

  // Daten laden
  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    selectedCats.forEach(c => params.append('category', String(c)));
    selectedBadges.forEach(b => params.append('badge', String(b)));
    selectedVendors.forEach(v => params.append('vendor', String(v)));
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    const res = await fetch(`/api/news?${params.toString()}`);
    const json: { data: Item[]; total: number } = await res.json();
    setItems(json.data || []);
    setTotal(json.total || 0);
    setLoading(false);
  }, [q, page, selectedCats, selectedBadges, selectedVendors]);

  useEffect(() => { load(); }, [load]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  function toggleCard(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const hasActiveFilters =
    q.trim().length > 0 ||
    selectedCats.length > 0 ||
    selectedBadges.length > 0 ||
    selectedVendors.length > 0;

  function clearAll() {
    setQ('');
    setSelectedCats([]);
    setSelectedBadges([]);
    setSelectedVendors([]);
    setPage(1);
  }

  // Tastatur: '/' fokussiert Suche
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === '/') {
        e.preventDefault();
        const el = document.getElementById('search-input') as HTMLInputElement | null;
        el?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="container max-w-5xl mx-auto py-8 space-y-6">
      {/* Kopf */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">NewsCHECKer</h1>
          <span className="hidden md:inline text-sm text-gray-500 dark:text-gray-400">/ zum Suchen</span>
        </div>
        <div className="flex gap-2 items-center">
          <div className="w-72 max-w-full">
            <input
              id="search-input"
              value={q}
              onChange={e => { setPage(1); setQ(e.target.value); }}
              placeholder="Suche nach Titel, Inhalt, Anbieter…"
              className={inputClass}
            />
          </div>
          <Link href="/admin" className={btnPrimary}>Admin</Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Aktive Filter + Clear */}
      {hasActiveFilters && (
        <ActiveFilters
          q={q}
          setQ={setQ}
          cats={selectedCats}
          badges={selectedBadges}
          vendors={selectedVendors}
          meta={meta}
          onRemove={(type, id) => {
            setPage(1);
            if (type === 'category') setSelectedCats(s => s.filter(x => x !== id));
            if (type === 'badge') setSelectedBadges(s => s.filter(x => x !== id));
            if (type === 'vendor') setSelectedVendors(s => s.filter(x => x !== id));
          }}
          onClearAll={clearAll}
        />
      )}

      {/* Filter */}
      <div className="space-y-3">
        <FilterSection
          title="Veranstalter"
          options={meta.vendors}
          selected={selectedVendors}
          onToggle={id => {
            setPage(1);
            setSelectedVendors(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
          }}
        />

        <FilterSection
          title="Kategorien"
          options={meta.categories}
          selected={selectedCats}
          onToggle={id => {
            setPage(1);
            setSelectedCats(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
          }}
          getColor={(id) => meta.categories.find(c => c.id === id)?.color}
        />

        <FilterSection
          title="Badges"
          options={meta.badges}
          selected={selectedBadges}
          onToggle={id => {
            setPage(1);
            setSelectedBadges(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
          }}
          getColor={(id) => meta.badges.find(b => b.id === id)?.color}
        />
      </div>

      {/* Ladezustand */}
      {loading && <SkeletonList />}

      {/* Leerer Zustand */}
      {!loading && items.length === 0 && (
        <EmptyState onClear={hasActiveFilters ? clearAll : undefined} />
      )}

      {/* Liste */}
      {!loading && items.length > 0 && (
        <>
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>{total} {total === 1 ? 'Treffer' : 'Treffer'}</span>
            {hasActiveFilters && <button onClick={clearAll} className={btnBase}>Alle Filter löschen</button>}
          </div>

          <ul className="grid gap-4">
            {items.map(it => {
              const isOpen = expanded.has(it.id);
              return (
                <li
                  key={it.id}
                  className="p-5 rounded-2xl shadow-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
                >
                  {/* Kopf */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {it.slug ? (
                        <Link
                          href={`/news/${it.slug}`}
                          className="text-xl font-semibold text-blue-700 dark:text-blue-400 hover:underline line-clamp-2"
                        >
                          {it.title}
                        </Link>
                      ) : (
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                          {it.title}
                        </h2>
                      )}
                      {it.vendor && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {it.vendor.name}
                        </div>
                      )}
                      {it.summary && (
                        <p className="text-gray-700 dark:text-gray-300 mt-2">
                          {it.summary}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => toggleCard(it.id)}
                      aria-expanded={isOpen}
                      aria-controls={`post-content-${it.id}`}
                      className={btnBase}
                    >
                      {isOpen ? 'Inhalt ausblenden' : 'Inhalt anzeigen'}
                    </button>
                  </div>

                  {/* Aufklapp-Inhalt */}
                  {isOpen && it.content && (
                    <div
                      id={`post-content-${it.id}`}
                      role="region"
                      aria-label="Beitragsinhalt"
                      className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
                    >
                      <div className="prose dark:prose-invert max-w-none prose-p:my-3 prose-li:my-1">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {it.content}
                        </ReactMarkdown>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-4">
                        {it.post_categories?.map(pc => (
                          <span
                            key={pc.category.id}
                            className="px-2 py-0.5 rounded-full text-xs border
                                       border-gray-200 dark:border-gray-700
                                       bg-white dark:bg-transparent
                                       text-gray-700 dark:text-gray-200
                                       inline-flex items-center gap-2"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: pc.category.color }}
                              aria-hidden
                            />
                            {pc.category.name}
                          </span>
                        ))}
                        {it.post_badges?.map(pb => (
                          <span
                            key={pb.badge.id}
                            className="px-2 py-0.5 rounded-full text-xs border
                                       border-gray-200 dark:border-gray-700
                                       bg-white dark:bg-transparent
                                       text-gray-700 dark:text-gray-200
                                       inline-flex items-center gap-2"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: pb.badge.color }}
                              aria-hidden
                            />
                            {pb.badge.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="text-sm text-gray-600 dark:text-gray-400">{total} Einträge</div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className={btnBase + ' disabled:opacity-50'}
              >
                Zurück
              </button>
              <span className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                Seite {page} / {pages}
              </span>
              <button
                disabled={page >= pages}
                onClick={() => setPage(p => p + 1)}
                className={btnBase + ' disabled:opacity-50'}
              >
                Weiter
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------- Unterkomponenten ------- */

function FilterSection({ title, options, selected, onToggle, getColor }: FilterSectionProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm text-gray-500 dark:text-gray-400 mr-1">{title}:</span>
      {options.map(opt => {
        const isActive = selected.includes(opt.id);
        const color = getColor?.(opt.id) ?? '#94a3b8';
        return (
          <button
            key={opt.id}
            onClick={() => onToggle(opt.id)}
            className={`px-3 py-1 rounded-full text-sm font-medium border transition inline-flex items-center gap-2
              ${isActive
                ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-700'}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
            <span className="truncate">{opt.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function ActiveFilters({
  q,
  setQ,
  cats,
  badges,
  vendors,
  meta,
  onRemove,
  onClearAll,
}: {
  q: string;
  setQ: (v: string) => void;
  cats: number[];
  badges: number[];
  vendors: number[];
  meta: Meta;
  onRemove: (type: 'category' | 'badge' | 'vendor', id: number) => void;
  onClearAll: () => void;
}) {
  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (q.trim())
    chips.push({
      key: `q:${q}`,
      label: `Suche: “${q}”`,
      onRemove: () => setQ(''),
    });

  cats.forEach(id => {
    const c = meta.categories.find(x => x.id === id);
    if (c) chips.push({ key: `c:${id}`, label: c.name, onRemove: () => onRemove('category', id) });
  });
  badges.forEach(id => {
    const b = meta.badges.find(x => x.id === id);
    if (b) chips.push({ key: `b:${id}`, label: b.name, onRemove: () => onRemove('badge', id) });
  });
  vendors.forEach(id => {
    const v = meta.vendors.find(x => x.id === id);
    if (v) chips.push({ key: `v:${id}`, label: v.name, onRemove: () => onRemove('vendor', id) });
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map(chip => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm
                     bg-white text-gray-700 border-gray-200
                     dark:bg-white/10 dark:text-white dark:border-gray-700"
        >
          {chip.label}
          <button
            onClick={chip.onRemove}
            className="h-5 w-5 inline-flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/20"
            aria-label="Filter entfernen"
            title="Filter entfernen"
          >
            ✕
          </button>
        </span>
      ))}
      <button onClick={onClearAll} className={btnBase}>Alle löschen</button>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="grid gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-2/3 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-800 rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ onClear }: { onClear?: () => void }) {
  return (
    <div className="p-8 rounded-2xl text-center border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
      <p className="text-gray-700 dark:text-gray-300">Keine Ergebnisse für die aktuelle Auswahl.</p>
      {onClear && (
        <button onClick={onClear} className={btnBase + ' mt-4'}>
          Filter zurücksetzen
        </button>
      )}
    </div>
  );
}
