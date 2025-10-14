'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { authedFetch } from '@/lib/fetchWithSupabase';

type Group = {
  id: number;
  name: string;
  description?: string | null;
  is_private?: boolean;
  isMember?: boolean;
};
type PostPreview = { id:number; title:string; created_at?:string; hero_image_url?:string|null };

type UnreadRes = {
  ok: boolean;
  unread: number;
  breakdown?: { posts?: number; invites?: number };
  preview?: Array<{ id:number; title:string; created_at:string; hero_image_url?:string|null; group:{id:number; name:string} }>;
};

type PreviewItem = { group: Group; posts: PostPreview[] };

const inputClass =
  'rounded-xl px-3 py-2 w-full bg-white text-gray-900 placeholder-gray-500 border border-gray-300 ' +
  'shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';

const btnBase =
  'px-3 py-2 rounded-xl text-sm font-medium transition border bg-white text-gray-700 hover:bg-gray-50 border-gray-200 ' +
  'dark:bg-white/10 dark:text-white dark:hover:bg-white/20 dark:border-gray-700';

export default function GroupsHub() {
  const [items, setItems] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [loadingPreviews, setLoadingPreviews] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [marking, setMarking] = useState(false);

  // helpers
  async function fetchUnread() {
    try {
      const r = await authedFetch('/api/unread');
      const j: UnreadRes = await r.json().catch(() => ({ ok:false, unread:0 }));
      setUnreadCount(Math.max(0, Number(j?.unread || 0)));
    } catch {
      setUnreadCount(0);
    }
  }
  async function fetchPreviews() {
    setLoadingPreviews(true);
    try {
      const r = await authedFetch('/api/groups/previews?groups=6&perGroup=2');
      const j = await r.json().catch(() => ({ ok:false, items: [] }));
      const arr: PreviewItem[] = Array.isArray(j?.items) ? j.items : [];
      setPreviewItems(arr);
    } finally {
      setLoadingPreviews(false);
    }
  }

  // 0) Unread-Badge
  useEffect(() => { fetchUnread(); }, []);
  // 1) Alle Gruppen
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [g, m] = await Promise.all([
          authedFetch('/api/groups').then(r => r.json()).catch(() => ({ data: [] })),
          authedFetch('/api/groups/memberships').then(r => r.json()).catch(() => ([])),
        ]);
        const memberIds: number[] = Array.isArray(m) ? m : Array.isArray(m?.groupIds) ? m.groupIds : [];
        const groups: Group[] = Array.isArray(g?.data) ? g.data : [];
        const filtered = groups
          .filter(gr => (gr.is_private ? memberIds.includes(gr.id) : true))
          .map(gr => ({ ...gr, isMember: memberIds.includes(gr.id) }));
        setItems(filtered);
      } finally { setLoading(false); }
    })();
  }, []);
  // 2) Previews (ein Call)
  useEffect(() => { fetchPreviews(); }, []);

  // Als gelesen markieren
  async function markAllSeen() {
    try {
      setMarking(true);
      await authedFetch('/api/unread/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      // danach neu laden
      await fetchUnread();
      await fetchPreviews();
    } finally {
      setMarking(false);
    }
  }

  // Suche (clientseitig)
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(g =>
      `${g.name} ${g.description ?? ''}`.toLowerCase().includes(s)
    );
  }, [items, q]);

  const previewEntries = previewItems.filter(p => p.group.isMember ?? true);
  const previewTotal = previewEntries.reduce((n, it) => n + (it.posts?.length || 0), 0);

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 py-6">
      {/* Header + Suche + Als-gelesen */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          Gruppen
          {unreadCount > 0 && (
            <span
              title={`${unreadCount} neue Elemente`}
              className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 text-xs rounded-full bg-red-600 text-white"
            >
              {unreadCount}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label htmlFor="q" className="text-sm text-gray-500 dark:text-gray-400">Suche:</label>
          <input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Gruppenname oder Beschreibung…"
            className={inputClass + ' sm:w-[360px]'}
          />
          {q && <button onClick={() => setQ('')} className={btnBase}>Löschen</button>}
          <button
            onClick={markAllSeen}
            disabled={marking}
            className="px-3 py-2 rounded-xl text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700 disabled:opacity-60"
            title="Alle neuen Elemente als gelesen markieren"
          >
            {marking ? 'Markiere…' : 'Als gelesen markieren'}
          </button>
        </div>
      </div>

      {/* Vorschau-Sektion */}
      {previewEntries.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Neu in deinen Gruppen</h2>
            <div className="flex items-center gap-3">
              {loadingPreviews && <span className="text-sm text-gray-500">lädt…</span>}
              {previewTotal > 0 && (
                <span className="text-xs text-gray-500">{previewTotal} neue Beiträge</span>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {previewEntries.map(({ group: g, posts: list }) => {
              const cover = (list.find(p => p.hero_image_url)?.hero_image_url) || '';
              return (
                <article key={g.id}
                  className="group rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* Cover */}
                  <div className="relative h-28 bg-gradient-to-r from-indigo-100 to-blue-100 dark:from-gray-800 dark:to-gray-800">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : <div className="absolute inset-0 opacity-40" /> }
                    <div className="absolute top-3 left-3 inline-flex items-center gap-2 px-2 py-1 text-xs rounded-full
                                    bg-white/90 dark:bg-black/40 border border-gray-200 dark:border-white/10 backdrop-blur">
                      {g.is_private ? 'Privat' : 'Öffentlich'}
                      {g.isMember && <span className="text-emerald-700 dark:text-emerald-300">• Mitglied</span>}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold truncate flex-1 min-w-0">{g.name}</h3>
                      <Link
                        href={`/groups/${g.id}`}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Öffnen
                      </Link>
                    </div>
                    {g.description && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{g.description}</p>
                    )}

                    <ul className="mt-3 space-y-1.5">
                      {list.map(p => (
                        <li key={p.id} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          <span className="text-sm truncate">{p.title}</span>
                          {p.created_at && (
                            <time dateTime={p.created_at} className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                              {new Date(p.created_at).toLocaleDateString('de-DE')}
                            </time>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Kachel-Grid aller Gruppen */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Alle Gruppen</h2>
          {!loading && <span className="text-sm text-gray-500">{visible.length} Einträge</span>}
        </div>

        {loading ? (
          <SkeletonGrid />
        ) : visible.length === 0 ? (
          <div className="p-8 rounded-2xl text-center border border-dashed border-gray-300 dark:border-gray-700">
            Keine Gruppen gefunden.
          </div>
        ) : (
          <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map(g => (
              <li key={g.id}
                  className="group rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate max-w-[14rem] sm:max-w-[16rem]">{g.name}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                        {g.is_private ? 'Privat' : 'Öffentlich'}
                      </span>
                      {g.isMember && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-emerald-300 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">
                          Mitglied
                        </span>
                      )}
                    </div>
                    {g.description && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{g.description}</p>
                    )}
                  </div>
                  <Link
                    href={`/groups/${g.id}`}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {g.isMember ? 'Öffnen' : 'Beitreten'}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="animate-pulse space-y-3">
            <div className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800" />
            <div className="h-5 w-2/3 bg-gray-100 dark:bg-gray-800 rounded" />
            <div className="h-4 w-5/6 bg-gray-100 dark:bg-gray-800 rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
}
