'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '../components/ThemeToggle';

type Vendor = { id: number; name: string };
type Badge  = { id: number; name: string; color: string; kind: string };
type Category = { id: number; name: string; color: string };

type Item = {
  id: number;
  slug: string | null;
  title: string;
  summary: string | null;
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

export default function NewsIndexPage() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedCats, setSelectedCats] = useState<number[]>([]);
  const [selectedBadges, setSelectedBadges] = useState<number[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<number[]>([]);
  const [meta, setMeta] = useState<Meta>({ categories: [], badges: [], vendors: [] });

  const pageSize = 20;

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then((data: Meta) => setMeta(data));
  }, []);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    selectedCats.forEach((c) => params.append('category', String(c)));
    selectedBadges.forEach((b) => params.append('badge', String(b)));
    selectedVendors.forEach((v) => params.append('vendor', String(v)));
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    const res = await fetch(`/api/news?${params.toString()}`);
    const json = await res.json();
    setItems(json.data || []);
    setTotal(json.total || 0);
    setLoading(false);
  }

    
useEffect(() => {
  load();
}, [q, page, selectedCats.join(','), selectedBadges.join(','), selectedVendors.join(',')]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  return (
    <div className="container py-6 space-y-4">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold">Reise-News</h1>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Suche nach Titel, Inhalt, Anbieter…"
            className="border rounded-xl px-3 py-2 w-72 max-w-full bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <Link href="/admin" className="px-3 py-2 rounded-xl bg-blue-600 text-white">
            Admin
          </Link>
        </div>
      </header>

      {/* Filter: Veranstalter */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-gray-500 mr-1">Veranstalter:</span>
        {meta.vendors.map((v: Vendor) => (
          <button
            key={v.id}
            onClick={() => {
              setPage(1);
              setSelectedVendors((sel) =>
                sel.includes(v.id) ? sel.filter((x) => x !== v.id) : [...sel, v.id]
              );
            }}
            className={`px-3 py-1 rounded-full text-sm border ${
              selectedVendors.includes(v.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'
            }`}
          >
            {v.name}
          </button>
        ))}
      </div>

      {/* Filter: Kategorien */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-gray-500 mr-1">Kategorien:</span>
        {meta.categories.map((c: Category) => (
          <button
            key={c.id}
            onClick={() => {
              setPage(1);
              setSelectedCats((sel) =>
                sel.includes(c.id) ? sel.filter((x) => x !== c.id) : [...sel, c.id]
              );
            }}
            className={`px-3 py-1 rounded-full text-sm border ${
              selectedCats.includes(c.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'
            }`}
            style={{ boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Filter: Badges */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-gray-500 mr-1">Badges:</span>
        {meta.badges.map((b: Badge) => (
          <button
            key={b.id}
            onClick={() => {
              setPage(1);
              setSelectedBadges((sel) =>
                sel.includes(b.id) ? sel.filter((x) => x !== b.id) : [...sel, b.id]
              );
            }}
            className={`px-3 py-1 rounded-full text-sm border ${
              selectedBadges.includes(b.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      {loading && <div>Lädt…</div>}

      <ul className="grid gap-3">
        {items.map((it) => (
          <li key={it.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                {it.slug ? (
                  <Link
                    href={`/news/${it.slug}`}
                    className="text-xl font-semibold mb-1 hover:underline"
                  >
                    {it.title}
                  </Link>
                ) : (
                  <h2 className="text-xl font-semibold mb-1">{it.title}</h2>
                )}
                {it.vendor && <div className="text-sm text-gray-500">{it.vendor.name}</div>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {it.post_badges?.map((pb) => (
                  <span
                    key={pb.badge.id}
                    className="px-2 py-0.5 rounded-full text-xs border"
                    style={{ background: pb.badge.color }}
                  >
                    {pb.badge.name}
                  </span>
                ))}
              </div>
            </div>
            {it.summary && <p className="text-gray-700 mt-2">{it.summary}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              {it.post_categories?.map((pc) => (
                <span
                  key={pc.category.id}
                  className="px-2 py-0.5 rounded-full text-xs border"
                  style={{ background: pc.category.color }}
                >
                  {pc.category.name}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between pt-2">
        <div className="text-sm text-gray-500">{total} Einträge</div>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg border bg-white disabled:opacity-50"
          >
            Zurück
          </button>
          <span className="px-2 py-1">
            Seite {page} / {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border bg-white disabled:opacity-50"
          >
            Weiter
          </button>
        </div>
      </div>
    </div>
  );
}