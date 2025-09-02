// app/news/page.tsx
'use client';

import { Suspense, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSearchParams } from 'next/navigation';
import DOMPurify from 'isomorphic-dompurify'; // <-- korrekt: Default-Import

// Typen
type Badge = { id: number; name: string; color: string; kind: string };
type Vendor = { id: number; name: string };
type Category = {
  id: number;
  name: string;
  color: string;
  vendorFilter?: boolean;
  badgesFilter?: boolean;
  searchFilter?: boolean;
};

// Quellen des Beitrags
type PostSource = { url: string; label: string | null; sort_order?: number };

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
  sources?: PostSource[];
  author_name?: string | null;
};

type FilterDefaults = { all_vendor: boolean; all_badges: boolean; all_search: boolean };
type Meta = { categories: Category[]; badges: Badge[]; vendors: Vendor[]; filterDefaults?: FilterDefaults };

type FilterSectionProps = {
  title: string;
  options: { id: number; name: string }[];
  selected: number[];
  onToggle: (id: number) => void;
  getColor?: (id: number) => string | undefined;
};

// kleine Hilfs-Styles
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

// Tab-Datentyp
type UiTab = { id: 'all' | number; label: string; color?: string };

// Welche Filter-Typen gibt es?
type AvailableFilters = { vendor: boolean; badges: boolean; search: boolean };

// --- Rich-Text Helfer ---
function isProbablyHTML(s: string) {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}
function sanitize(html: string) {
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] });
}

// Link-Label für Quellen schön kürzen
function prettySourceLabel(url: string, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback.trim();
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
}

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

  const [currentTab, setCurrentTab] = useState<'all' | number>('all');
  const pageSize = 20;

  useEffect(() => { fetch('/api/meta').then(r => r.json()).then(setMeta); }, []);

  const tabs: UiTab[] = useMemo(() => {
    const catTabs = [...meta.categories].sort((a, b) => a.name.localeCompare(b.name))
      .map<UiTab>(c => ({ id: c.id, label: c.name, color: c.color || undefined }));
    return [{ id: 'all', label: 'Alle' }, ...catTabs];
  }, [meta.categories]);

  useEffect(() => {
    if (tabs.length === 0) return;
    const general = tabs.find(t => t.id !== 'all' && t.label.toLowerCase() === 'allgemein');
    setCurrentTab(prev => (prev === 'all' && general ? (general.id as number) : prev));
  }, [tabs]);

  useEffect(() => {
    const nextCats = currentTab === 'all' ? [] : [currentTab];
    const changed = nextCats.length !== selectedCats.length || nextCats.some((id, i) => id !== selectedCats[i]);
    if (changed) { setSelectedCats(nextCats); setPage(1); }
  }, [currentTab]); // bewusst ohne selectedCats

  const activeFilters = useMemo<AvailableFilters>(() => {
    const base: AvailableFilters = {
      vendor: meta.filterDefaults?.all_vendor ?? true,
      badges: meta.filterDefaults?.all_badges ?? true,
      search: meta.filterDefaults?.all_search ?? true,
    };
    if (currentTab === 'all') return base;
    const cat = meta.categories.find(c => c.id === currentTab);
    if (!cat) return base;
    return {
      vendor: cat.vendorFilter ?? base.vendor,
      badges: cat.badgesFilter ?? base.badges,
      search: cat.searchFilter ?? base.search,
    };
  }, [currentTab, meta.categories, meta.filterDefaults]);

  useEffect(() => {
    let changed = false;
    if (!activeFilters.vendor && selectedVendors.length) { setSelectedVendors([]); changed = true; }
    if (!activeFilters.badges && selectedBadges.length) { setSelectedBadges([]); changed = true; }
    if (!activeFilters.search && q) { setQ(''); changed = true; }
    if (changed) setPage(1);
  }, [currentTab, activeFilters.vendor, activeFilters.badges, activeFilters.search]); // eslint-disable-line

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (activeFilters.search && q) params.set('q', q);
    selectedCats.forEach(c => params.append('category', String(c)));
    if (activeFilters.badges) selectedBadges.forEach(b => params.append('badge', String(b)));
    if (activeFilters.vendor) selectedVendors.forEach(v => params.append('vendor', String(v)));
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    const res = await fetch(`/api/news?${params.toString()}`);
    const json: { data: Item[]; total: number } = await res.json();
    setItems(json.data || []);
    setTotal(json.total || 0);
    setLoading(false);
  }, [q, page, selectedCats, selectedBadges, selectedVendors, activeFilters.search, activeFilters.badges, activeFilters.vendor]);

  useEffect(() => { load(); }, [load]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  function toggleCard(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const hasActiveFilters =
    (activeFilters.search && q.trim().length > 0) ||
    (activeFilters.badges && selectedBadges.length > 0) ||
    (activeFilters.vendor && selectedVendors.length > 0);

  function clearAll() {
    if (activeFilters.search) setQ('');
    if (activeFilters.badges) setSelectedBadges([]);
    if (activeFilters.vendor) setSelectedVendors([]);
    setPage(1);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === '/') {
        e.preventDefault();
        (document.getElementById('search-input') as HTMLInputElement | null)?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- useSearchParams wurde in Child ausgelagert ---

  return (
    <Suspense fallback={<div className="container max-w-5xl mx-auto py-8">Lade…</div>}>
      {/* Child liest ?open=... und klappt den passenden Post auf */}
      <Suspense fallback={null}>
        <OpenFromSearchParam items={items} setExpanded={setExpanded} />
      </Suspense>

      <div className="container max-w-5xl mx-auto py-8 space-y-6">
        {/* Tabs */}
        <Tabs tabs={tabs} current={currentTab} onChange={(t) => { setCurrentTab(t); setPage(1); }} />

        {/* aktive Filter */}
        {hasActiveFilters && (
          <ActiveFiltersNoCats
            q={q}
            setQ={setQ}
            badges={selectedBadges}
            vendors={selectedVendors}
            meta={meta}
            onRemove={(type, id) => {
              setPage(1);
              if (type === 'badge') setSelectedBadges(s => s.filter(x => x !== id));
              if (type === 'vendor') setSelectedVendors(s => s.filter(x => x !== id));
            }}
            onClearAll={clearAll}
          />
        )}

        {/* Filter */}
        <div className="space-y-3">
          {activeFilters.search && (
            <SearchBox
              q={q}
              onChange={(val) => { setPage(1); setQ(val); }}
              onClear={() => { setPage(1); setQ(''); }}
            />
          )}
          {activeFilters.vendor && (
            <VendorFilter
              vendors={meta.vendors}
              selected={selectedVendors}
              onChange={(ids) => { setPage(1); setSelectedVendors(ids); }}
            />
          )}
          {activeFilters.badges && (
            <FilterSection
              title="Badges"
              options={meta.badges}
              selected={selectedBadges}
              onToggle={id => { setPage(1); setSelectedBadges(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]); }}
              getColor={(id) => meta.badges.find(b => b.id === id)?.color}
            />
          )}
        </div>

        {/* Ladezustand */}
        {loading && <SkeletonList />}

        {/* Leerzustand */}
        {!loading && items.length === 0 && <EmptyState onClear={hasActiveFilters ? clearAll : undefined} />}

        {/* Liste */}
        {!loading && items.length > 0 && (
          <>
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>{total} Treffer</span>
              {hasActiveFilters && <button onClick={clearAll} className={btnBase}>Alle Filter löschen</button>}
            </div>

            <ul className="grid gap-4">
              {items.map(it => {
                const isOpen = expanded.has(it.id);
                return (
                  <li id={`post-${it.id}`} key={it.id} className="p-5 rounded-2xl shadow-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                    {/* Kopf */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {it.slug ? (
                          <Link href={`/news/${it.slug}`} className="text-xl font-semibold text-blue-700 dark:text-blue-400 hover:underline line-clamp-2">
                            {it.title}
                          </Link>
                        ) : (
                          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                            {it.title}
                          </h2>
                        )}

                        {/* Veranstalter & Autor */}
                        {(it.vendor?.name || it.author_name) && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap items-center gap-x-2">
                            {it.vendor?.name && <span>{it.vendor.name}</span>}
                            {it.vendor?.name && it.author_name && <span aria-hidden>•</span>}
                            {it.author_name && <span>von {it.author_name}</span>}
                          </div>
                        )}

                        {it.summary && <p className="text-gray-700 dark:text-gray-300 mt-2">{it.summary}</p>}
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
                      <div id={`post-content-${it.id}`} role="region" aria-label="Beitragsinhalt" className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">

                        {/* RICH TEXT: HTML ODER MARKDOWN */}
                        <div className="prose dark:prose-invert max-w-none prose-p:my-3 prose-li:my-1">
                          {isProbablyHTML(it.content) ? (
                            <div
                              dangerouslySetInnerHTML={{ __html: sanitize(it.content) }}
                              className="[&_a]:underline [&_a]:break-words [&_a]:text-blue-700 dark:[&_a]:text-blue-400 [&_img]:max-w-full [&_img]:h-auto"
                            />
                          ) : (
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a: (props) => (
                                  <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-700 dark:text-blue-400 underline" />
                                ),
                                img: (props) => <img {...props} loading="lazy" className="max-w-full h-auto" />,
                              }}
                            >
                              {it.content}
                            </ReactMarkdown>
                          )}
                        </div>

                        {/* Chips */}
                        <div className="flex flex-wrap gap-2 mt-4">
                          {it.post_categories?.map(pc => (
                            <span key={pc.category.id} className="px-2 py-0.5 rounded-full text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-transparent text-gray-700 dark:text-gray-200 inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pc.category.color }} aria-hidden />
                              {pc.category.name}
                            </span>
                          ))}
                          {it.post_badges?.map(pb => (
                            <span key={pb.badge.id} className="px-2 py-0.5 rounded-full text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-transparent text-gray-700 dark:text-gray-200 inline-flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pb.badge.color }} aria-hidden />
                              {pb.badge.name}
                            </span>
                          ))}
                        </div>

                        {/* Quellen */}
                        {it.sources && it.sources.length > 0 && (
                          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Quellen</h4>
                            <ol className="list-decimal pl-5 space-y-1">
                              {it.sources
                                .slice()
                                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                .map((s, i) => (
                                  <li key={`${s.url}-${i}`} className="break-words">
                                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 dark:text-blue-400 underline break-words">
                                      {prettySourceLabel(s.url, s.label)}
                                    </a>
                                  </li>
                                ))}
                            </ol>
                          </div>
                        )}
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
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className={btnBase + ' disabled:opacity-50'}>Zurück</button>
                <span className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Seite {page} / {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className={btnBase + ' disabled:opacity-50'}>Weiter</button>
              </div>
            </div>
          </>
        )}
      </div>
    </Suspense>
  );
}

/* ------- Unterkomponenten ------- */

function OpenFromSearchParam({
  items,
  setExpanded,
}: {
  items: Item[];
  setExpanded: React.Dispatch<React.SetStateAction<Set<number>>>;
}) {
  const sp = useSearchParams();
  const openParam = sp?.get('open');
  const itemsKey = useMemo(() => items.map(i => i.id).join(','), [items]);

  useEffect(() => {
    const idToOpen = openParam ? Number(openParam) : NaN;
    if (!idToOpen || Number.isNaN(idToOpen)) return;
    setExpanded(prev => {
      const next = new Set(prev);
      next.add(idToOpen);
      return next;
    });
    const t = setTimeout(() => {
      document.getElementById(`post-${idToOpen}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
    return () => clearTimeout(t);
  }, [openParam, itemsKey, setExpanded]);

  return null;
}

function Tabs({ tabs, current, onChange }: { tabs: UiTab[]; current: 'all' | number; onChange: (t: 'all' | number) => void; }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-800">
      {tabs.map(t => {
        const active = current === t.id;
        return (
          <button
            key={`${t.id}-${t.label}`}
            onClick={() => onChange(t.id)}
            type="button"
            className={`px-3 py-2 rounded-t-lg text-sm font-medium
              ${active
                ? 'bg-white text-gray-900 border border-b-0 border-gray-200 dark:bg-gray-900 dark:text-white dark:border-gray-700'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/40 dark:hover:text-white'}`}
            aria-pressed={active}
            title={t.label}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

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

function SearchBox({ q, onChange, onClear }: { q: string; onChange: (v: string) => void; onClear: () => void; }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="search-input" className="text-sm text-gray-500 dark:text-gray-400">Suche:</label>
      <input id="search-input" value={q} onChange={(e) => onChange(e.target.value)} placeholder="Titel, Inhalt, …" className={inputClass} style={{ maxWidth: 420 }} />
      {q ? <button type="button" onClick={onClear} className={btnBase}>Löschen</button> : null}
    </div>
  );
}

function ActiveFiltersNoCats({
  q, setQ, badges, vendors, meta, onRemove, onClearAll,
}: { q: string; setQ: (v: string) => void; badges: number[]; vendors: number[]; meta: Meta; onRemove: (type: 'badge' | 'vendor', id: number) => void; onClearAll: () => void; }) {
  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (q.trim()) chips.push({ key: `q:${q}`, label: `Suche: “${q}”`, onRemove: () => setQ('') });
  badges.forEach(id => { const b = meta.badges.find(x => x.id === id); if (b) chips.push({ key: `b:${id}`, label: b.name, onRemove: () => onRemove('badge', id) }); });
  vendors.forEach(id => { const v = meta.vendors.find(x => x.id === id); if (v) chips.push({ key: `v:${id}`, label: v.name, onRemove: () => onRemove('vendor', id) }); });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map(chip => (
        <span key={chip.key} className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm bg-white text-gray-700 border-gray-200 dark:bg-white/10 dark:text-white dark:border-gray-700">
          {chip.label}
          <button onClick={chip.onRemove} className="h-5 w-5 inline-flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/20" aria-label="Filter entfernen" title="Filter entfernen">✕</button>
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
      {onClear && <button onClick={onClear} className={btnBase + ' mt-4'}>Filter zurücksetzen</button>}
    </div>
  );
}

/* ========= Vendor-Filter ========= */

function VendorFilter({
  vendors, selected, onChange,
}: { vendors: { id: number; name: string }[]; selected: number[]; onChange: (ids: number[]) => void; }) {
  type Group = { id: number; name: string; members: number[] };
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingGroups(true);
      try {
        let res = await fetch('/api/vendor-groups?withMembers=1');
        if (!res.ok) res = await fetch('/api/admin/vendor-groups?withMembers=1');
        const json = await res.json().catch(() => null);
        if (!cancelled) setGroups(json?.data ?? []);
      } catch {
        if (!cancelled) setGroups(null);
      } finally {
        if (!cancelled) setLoadingGroups(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      if (containerRef.current && e.target instanceof Node && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const vendorMap = useMemo(() => {
    const m = new Map<number, { id: number; name: string }>();
    vendors.forEach(v => m.set(v.id, v));
    return m;
  }, [vendors]);

  const sections = useMemo(() => {
    if (!groups || groups.length === 0) return [{ id: -1, name: 'Alle Veranstalter', vendorIds: vendors.map(v => v.id) }];
    const inGroup = new Set<number>();
    const secs = groups.map(g => {
      const ids = (g.members ?? []).filter(id => vendorMap.has(id));
      ids.forEach(id => inGroup.add(id));
      return { id: g.id, name: g.name, vendorIds: ids };
    });
    const rest = vendors.map(v => v.id).filter(id => !inGroup.has(id));
    if (rest.length) secs.push({ id: 0, name: 'Ohne Gruppe', vendorIds: rest });
    return secs.filter(s => s.vendorIds.length > 0).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [groups, vendors, vendorMap]);

  const searchResults = useMemo(() => {
    const qry = q.trim().toLowerCase();
    if (!qry) return null;
    return vendors.filter(v => v.name.toLowerCase().includes(qry)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [q, vendors]);

  const isChecked = useCallback((id: number) => selected.includes(id), [selected]);
  function toggle(id: number) { onChange(isChecked(id) ? selected.filter(x => x !== id) : [...selected, id]); }
  function selectAll(ids: number[]) { onChange(Array.from(new Set([...selected, ...ids]))); }
  function clearAll(ids?: number[]) { if (!ids) return onChange([]); onChange(selected.filter(x => !ids.includes(x))); }

  return (
    <div className="relative" ref={containerRef}>
      <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Veranstalter:</span>
      <button type="button" className={btnBase} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog">
        Auswählen {selected.length > 0 ? `(${selected.length})` : ''}
      </button>

      {open && (
        <div role="dialog" aria-label="Veranstalter filtern" className="absolute z-50 mt-2 w-[28rem] max-w-[95vw] rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 shadow-lg p-3">
          {/* Suche */}
          <div className="mb-3">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Veranstalter suchen…" className={inputClass} />
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-2 text-sm">
            {searchResults ? (
              <>
                <span className="text-gray-500">{searchResults.length} Treffer</span>
                <div className="flex gap-3 whitespace-nowrap">
                  <button type="button" className="underline" onClick={() => selectAll(searchResults.map(v => v.id))}>Alle sichtbaren wählen</button>
                  <button type="button" className="underline" onClick={() => clearAll(searchResults.map(v => v.id))}>Auswahl (sichtbare) löschen</button>
                </div>
              </>
            ) : (
              <>
                <span className="text-gray-500">{loadingGroups ? 'Gruppen laden…' : 'Gruppierte Ansicht'}</span>
                <div className="flex gap-3 whitespace-nowrap">
                  <button type="button" className="underline" onClick={() => selectAll(vendors.map(v => v.id))}>Alle wählen</button>
                  <button type="button" className="underline" onClick={() => clearAll()}>Auswahl löschen</button>
                </div>
              </>
            )}
          </div>

          {/* Inhalt */}
          <div className="max-h-80 overflow-auto pr-1">
            {searchResults ? (
              <ul>
                {searchResults.map(v => (
                  <li key={v.id} className="grid grid-cols-[1.25rem_1fr] gap-2 items-center py-1 px-1">
                    <input id={`vendor-s-${v.id}`} type="checkbox" className="h-4 w-4 shrink-0 justify-self-start" checked={isChecked(v.id)} onChange={() => toggle(v.id)} />
                    <label htmlFor={`vendor-s-${v.id}`} className="text-sm leading-5">{v.name}</label>
                  </li>
                ))}
                {searchResults.length === 0 && <li className="text-sm text-gray-500 px-1 py-2">Kein Treffer.</li>}
              </ul>
            ) : (
              <div className="space-y-2">
                {sections.map(sec => {
                  const items = sec.vendorIds.map(id => vendorMap.get(id)!).sort((a, b) => a.name.localeCompare(b.name, 'de'));
                  const allSelected = items.every(it => selected.includes(it.id));
                  return (
                    <details key={sec.id} className="rounded-lg border border-gray-200 dark:border-gray-700" open>
                      <summary className="flex items-center justify-between px-3 py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <div className="font-medium">{sec.name} <span className="text-gray-500">({items.length})</span></div>
                        <div className="flex items-center gap-3">
                          <button type="button" className="text-xs underline whitespace-nowrap" onClick={(e) => { e.preventDefault(); selectAll(items.map(i => i.id)); }}>Alle in Gruppe</button>
                          <button type="button" className="text-xs underline whitespace-nowrap" onClick={(e) => { e.preventDefault(); clearAll(items.map(i => i.id)); }}>Gruppe leeren</button>
                          <input type="checkbox" readOnly checked={allSelected} aria-label="Alle in Gruppe ausgewählt" className="h-4 w-4 shrink-0" />
                        </div>
                      </summary>
                      <ul className="px-3 pb-2">
                        {items.map(v => (
                          <li key={v.id} className="grid grid-cols-[1.25rem_1fr] gap-2 items-center py-1">
                            <input id={`vendor-${sec.id}-${v.id}`} type="checkbox" className="h-4 w-4 shrink-0 justify-self-start" checked={isChecked(v.id)} onChange={() => toggle(v.id)} />
                            <label htmlFor={`vendor-${sec.id}-${v.id}`} className="text-sm leading-5">{v.name}</label>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-3 flex justify-end">
            <button type="button" className={btnBase} onClick={() => setOpen(false)}>Schließen</button>
          </div>
        </div>
      )}
    </div>
  );
}
