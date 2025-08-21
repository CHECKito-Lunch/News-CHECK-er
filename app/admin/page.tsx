'use client';

import { useEffect, useMemo, useState } from 'react';
import TaxonomyEditor from './TaxonomyEditor';
import VendorGroups from './VendorGroups';
import ThemeToggle from '../components/ThemeToggle';
import RichTextEditor from '../components/RichTextEditor';
import LogoutButton from '../components/LogoutButton';

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

type Option = { id: number; name: string; color?: string; kind?: string };

type PostRow = {
  id: number;
  title: string;
  slug: string | null;
  summary: string | null;
  content: string | null;
  status: 'draft' | 'scheduled' | 'published';
  priority: number | null;
  pinned_until: string | null;
  effective_from: string | null;
  vendor_id: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  categories: { id: number; name: string; color: string | null }[];
  badges: { id: number; name: string; color: string | null; kind: string | null }[];
};

function Tabs({
  current,
  onChange,
}: {
  current: 'post' | 'vendors' | 'categories' | 'badges' | 'vendor-groups';
  onChange: (v: 'post' | 'vendors' | 'categories' | 'badges' | 'vendor-groups') => void;
}) {
  const tabs = [
    { k: 'post', label: 'Beitrag anlegen' },
    { k: 'vendors', label: 'Veranstalter' },
    { k: 'categories', label: 'Kategorien' },
    { k: 'badges', label: 'Badges' },
    { k: 'vendor-groups', label: 'Veranstalter-Gruppen' },
  ] as const;

  return (
    <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
      {tabs.map((t) => {
        const active = current === t.k;
        return (
          <button
            key={t.k}
            onClick={() => onChange(t.k)}
            className={`px-3 py-2 rounded-t-lg text-sm font-medium
              ${active
                ? 'bg-white text-gray-900 border border-b-0 border-gray-200 dark:bg-gray-900 dark:text-white dark:border-gray-700'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'}`}
            type="button"
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AdminPage() {
  const [meta, setMeta] = useState<{ categories: Option[]; badges: Option[]; vendors: Option[] }>({
    categories: [],
    badges: [],
    vendors: [],
  });

  // Formularzustand (Neu/Update)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'published'>('published');
  const [priority, setPriority] = useState<number>(0);
  const [pinnedUntil, setPinnedUntil] = useState<string>('');
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [badgeIds, setBadgeIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string>('');
  const [tab, setTab] = useState<'post' | 'vendors' | 'categories' | 'badges' | 'vendor-groups'>('post');

  // Liste vorhandener Beiträge
  const [postRows, setPostRows] = useState<PostRow[]>([]);
  const [postsTotal, setPostsTotal] = useState(0);
  const [postsPage, setPostsPage] = useState(1);
  const [postsQ, setPostsQ] = useState('');
  const [loadingPosts, setLoadingPosts] = useState(false);
  const pageSize = 20;

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then(setMeta);
  }, []);

  useEffect(() => {
    setSlug(slugify(title));
  }, [title]);

  const canSave = useMemo(() => title.trim().length > 0, [title]);

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setSlug('');
    setSummary('');
    setContent('');
    setVendorId(null);
    setStatus('published');
    setPriority(0);
    setPinnedUntil('');
    setEffectiveFrom('');
    setCategoryIds([]);
    setBadgeIds([]);
    setResult('');
  }

  async function save() {
    setSaving(true);
    setResult('');
    const payload = {
      post: {
        title,
        summary,
        content,
        slug,
        vendor_id: vendorId ?? null,
        status,
        priority,
        pinned_until: pinnedUntil ? new Date(pinnedUntil).toISOString() : null,
        effective_from: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
      },
      categoryIds,
      badgeIds,
    };

    const url = editingId ? `/api/admin/posts/${editingId}` : '/api/news/admin';
    const method = editingId ? 'PATCH' : 'POST';

    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const json = await res.json();
    if (!res.ok) {
      setResult(`Fehler: ${json.error || 'unbekannt'}`);
    } else {
      setResult(editingId ? 'Aktualisiert.' : `Gespeichert. ID: ${json.id}${json.slug ? `, /news/${json.slug}` : ''}`);
      await loadPosts();
      if (!editingId) resetForm();
    }
    setSaving(false);
  }

  async function loadPosts(p = postsPage, q = postsQ) {
    setLoadingPosts(true);
    const params = new URLSearchParams();
    params.set('page', String(p));
    params.set('pageSize', String(pageSize));
    if (q) params.set('q', q);
    const res = await fetch(`/api/admin/posts?${params.toString()}`);
    const json = await res.json();
    setPostRows(json.data ?? []);
    setPostsTotal(json.total ?? 0);
    setLoadingPosts(false);
  }

  useEffect(() => {
    if (tab === 'post') loadPosts(1, postsQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function pagesCount(total: number, size: number) {
    return Math.max(1, Math.ceil(total / size));
  }

  async function startEdit(id: number) {
    const res = await fetch(`/api/admin/posts/${id}`);
    const json = await res.json();
    const p: PostRow = json.data;

    setEditingId(p.id);
    setTitle(p.title ?? '');
    setSlug(p.slug ?? '');
    setSummary(p.summary ?? '');
    setContent(p.content ?? '');
    setVendorId(p.vendor_id);
    setStatus(p.status);
    setPriority(p.priority ?? 0);
    setPinnedUntil(p.pinned_until ? p.pinned_until.slice(0, 16) : '');
    setEffectiveFrom(p.effective_from ? p.effective_from.slice(0, 16) : '');
    setCategoryIds(p.categories?.map((c) => c.id) ?? []);
    setBadgeIds(p.badges?.map((b) => b.id) ?? []);
    setResult(''); // alte Meldung leeren
  }

  async function deletePost(id: number) {
    if (!confirm('Wirklich löschen?')) return;
    const res = await fetch(`/api/admin/posts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadPosts();
      if (editingId === id) resetForm();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(`Löschen fehlgeschlagen: ${j.error ?? 'unbekannt'}`);
    }
  }

  const inputClass =
    'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
    'dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';

  const cardClass =
    'card p-4 rounded-2xl shadow-sm bg-white border border-gray-200 ' +
    'dark:bg-gray-900 dark:border-gray-800';

  return (
    <div className="container max-w-5xl mx-auto py-6 space-y-5">
      {/* Header */}
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin</h1>
  <div className="flex items-center gap-2">
    <ThemeToggle />
    <LogoutButton />
  </div>
</div>

      <Tabs current={tab} onChange={setTab} />

      {tab === 'post' && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Linke Karte */}
            <div className={cardClass + ' space-y-3'}>
              <div>
                <label className="form-label">Titel</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="form-label">URL-ID (nicht anpassen)</label>
                <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} className={inputClass} />
              </div>
              <div>
                <label className="form-label">Veranstalter</label>
                <select
                  value={vendorId ?? ''}
                  onChange={(e) => setVendorId(e.target.value ? Number(e.target.value) : null)}
                  className={inputClass}
                >
                  <option value="">– optional –</option>
                  {meta.vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className={inputClass}
                >
                  <option value="draft">draft</option>
                  <option value="scheduled">scheduled</option>
                  <option value="published">published</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Priorität</label>
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="form-label">anpinnen bis ...</label>
                  <input
                    type="datetime-local"
                    value={pinnedUntil}
                    onChange={(e) => setPinnedUntil(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="col-span-2">
                  <label className="form-label">gültig ab ...</label>
                  <input
                    type="datetime-local"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Rechte Karte */}
            <div className={cardClass + ' space-y-3'}>
              <div>
                <label className="form-label">Kurzbeschreibung</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className={inputClass + ' min-h-[80px]'}
                  placeholder="Kurz und knackig…"
                />
              </div>
              <div>
                <label className="form-label">Inhalt</label>
                <RichTextEditor value={content} onChange={setContent} />
              </div>
            </div>
          </div>

          {/* Kategorien & Badges */}
          <div className={cardClass}>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Kategorien</div>
                <div className="flex flex-wrap gap-2">
                  {meta.categories.map((c) => {
                    const active = categoryIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() =>
                          setCategoryIds((sel) => (sel.includes(c.id) ? sel.filter((x) => x !== c.id) : [...sel, c.id]))
                        }
                        type="button"
                        className={`px-3 py-1 rounded-full text-sm font-medium border transition inline-flex items-center gap-2
                          ${active
                            ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-700'}`}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: c.color ?? '#94a3b8' }}
                          aria-hidden
                        />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Badges</div>
                <div className="flex flex-wrap gap-2">
                  {meta.badges.map((b) => {
                    const active = badgeIds.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        onClick={() =>
                          setBadgeIds((sel) => (sel.includes(b.id) ? sel.filter((x) => x !== b.id) : [...sel, b.id]))
                        }
                        type="button"
                        className={`px-3 py-1 rounded-full text-sm font-medium border transition inline-flex items-center gap-2
                          ${active
                            ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-700'}`}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: b.color ?? '#94a3b8' }}
                          aria-hidden
                        />
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Save-Bar */}
          <div className="flex items-center gap-3">
            <button
              disabled={!canSave || saving}
              onClick={save}
              type="button"
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-xl border dark:border-gray-700"
              onClick={resetForm}
            >
              Neu
            </button>
            {result && <div className="text-sm text-gray-700 dark:text-gray-300">{result}</div>}
          </div>

          {/* === Beiträge verwalten === */}
          <div className={cardClass + ' space-y-3'}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Vorhandene Beiträge</h2>
              <div className="flex gap-2">
                <input
                  value={postsQ}
                  onChange={(e) => setPostsQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setPostsPage(1);
                      loadPosts(1, postsQ);
                    }
                  }}
                  placeholder="Suche Titel/Slug…"
                  className={inputClass + ' w-56'}
                />
                <button
                  type="button"
                  onClick={() => {
                    setPostsPage(1);
                    loadPosts(1, postsQ);
                  }}
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white"
                >
                  Suchen
                </button>
              </div>
            </div>

            {loadingPosts ? (
              <div className="text-sm text-gray-500">lädt…</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50 dark:bg-gray-800/60 text-left">
                      <tr>
                        <th className="px-3 py-2">Titel</th>
                        <th className="px-3 py-2">Slug</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Veranstalter</th>
                        <th className="px-3 py-2">Geändert</th>
                        <th className="px-3 py-2 text-right">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {postRows.map((p) => (
                        <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="px-3 py-2 font-medium truncate max-w-[28ch]">{p.title}</td>
                          <td className="px-3 py-2 text-gray-500 truncate max-w-[22ch]">{p.slug}</td>
                          <td className="px-3 py-2">{p.status}</td>
                          <td className="px-3 py-2">{meta.vendors.find((v) => v.id === p.vendor_id)?.name ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-500">
                            {p.updated_at ? new Date(p.updated_at).toLocaleString() : p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(p.id)}
                                className="px-2 py-1 rounded border dark:border-gray-700"
                              >
                                Bearbeiten
                              </button>
                              <button
                                type="button"
                                onClick={() => deletePost(p.id)}
                                className="px-2 py-1 rounded bg-red-600 text-white"
                              >
                                Löschen
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {postRows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                            Keine Einträge.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between pt-3">
                  <div className="text-xs text-gray-500">{postsTotal} Einträge</div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={postsPage <= 1}
                      onClick={() => {
                        const n = postsPage - 1;
                        setPostsPage(n);
                        loadPosts(n, postsQ);
                      }}
                      className="px-3 py-1.5 rounded border disabled:opacity-50"
                    >
                      Zurück
                    </button>
                    <span className="text-sm">
                      Seite {postsPage} / {pagesCount(postsTotal, pageSize)}
                    </span>
                    <button
                      disabled={postsPage >= pagesCount(postsTotal, pageSize)}
                      onClick={() => {
                        const n = postsPage + 1;
                        setPostsPage(n);
                        loadPosts(n, postsQ);
                      }}
                      className="px-3 py-1.5 rounded border disabled:opacity-50"
                    >
                      Weiter
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {tab === 'vendors' && (
        <div className={cardClass}>
          <TaxonomyEditor title="Veranstalter" endpoint="/api/admin/vendors" columns={['name']} allowGroups />
        </div>
      )}

      {tab === 'categories' && (
        <div className={cardClass}>
          <TaxonomyEditor title="Kategorien" endpoint="/api/admin/categories" columns={['name', 'color']} />
        </div>
      )}

      {tab === 'badges' && (
        <div className={cardClass}>
          <TaxonomyEditor title="Badges" endpoint="/api/admin/badges" columns={['name', 'color', 'kind']} />
        </div>
      )}

      {tab === 'vendor-groups' && (
        <div className={cardClass}>
          <VendorGroups />
        </div>
      )}
    </div>
  );
}
