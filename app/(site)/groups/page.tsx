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
type Pair = [number, PostPreview[]];

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
  const [previews, setPreviews] = useState<Record<number, PostPreview[]>>({});
  const [loadingPreviews, setLoadingPreviews] = useState(false);

  // 1) Gruppen & Mitgliedschaften laden
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
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 2) Vorschau-Posts für einige Gruppen holen (mitgliedschafts-Gruppen zuerst)
  useEffect(() => {
  if (!items.length) return;
  (async () => {
    setLoadingPreviews(true);
    try {
      const order = [...items].sort((a, b) => Number(b.isMember) - Number(a.isMember));
      const pick = order.slice(0, 6);

      const results: Pair[] = await Promise.all(
        pick.map(async g => {
          try {
            const r = await authedFetch(`/api/groups/${g.id}/posts?page=1&pageSize=3`);
            if (!r.ok) return [g.id, [] as PostPreview[]] as Pair;
            const j = await r.json();
            const list: PostPreview[] = (Array.isArray(j.items) ? j.items : j.data || []).map((p: any) => ({
              id: p.id, title: p.title, created_at: p.created_at, hero_image_url: p.hero_image_url,
            }));
            return [g.id, list] as Pair;
          } catch {
            return [g.id, [] as PostPreview[]] as Pair;
          }
        })
      );

      const map: Record<number, PostPreview[]> = {};
      results.forEach(([gid, list]) => { map[gid] = list; });
      setPreviews(map);
    } finally {
      setLoadingPreviews(false);
    }
  })();
}, [items]);

  // Suche (clientseitig)
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(g =>
      `${g.name} ${g.description ?? ''}`.toLowerCase().includes(s)
    );
  }, [items, q]);

  return (
    <div className="container max-w-6xl mx-auto py-8 space-y-6">
      {/* Header + Suche */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Gruppen</h1>
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
        </div>
      </div>

      {/* Vorschau-Sektion */}
      {Object.keys(previews).length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Neu in deinen Gruppen</h2>
            {loadingPreviews && <span className="text-sm text-gray-500">lädt…</span>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(previews).map(([gid, list]) => {
              const g = items.find(x => x.id === Number(gid));
              if (!g) return null;
              const cover = list.find(p => p.hero_image_url)?.hero_image_url || '';
              return (
                <article key={gid}
                  className="group rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  {/* Cover */}
                  <div className="relative h-28 bg-gradient-to-r from-indigo-100 to-blue-100 dark:from-gray-800 dark:to-gray-800">
                    {cover ? (
                      <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 opacity-40" />
                    )}
                    <div className="absolute top-3 left-3 inline-flex items-center gap-2 px-2 py-1 text-xs rounded-full
                                    bg-white/90 dark:bg-black/40 border border-gray-200 dark:border-white/10 backdrop-blur">
                      {g.is_private ? 'Privat' : 'Öffentlich'}
                      {g.isMember && <span className="text-emerald-700 dark:text-emerald-300">• Mitglied</span>}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold truncate">{g.name}</h3>
                      <Link
                        href={`/groups/${g.id}`}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {g.isMember ? 'Öffnen' : 'Beitreten'}
                      </Link>
                    </div>
                    {g.description && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{g.description}</p>
                    )}

                    {/* kleine Post-Liste */}
                    <ul className="mt-3 space-y-1.5">
                      {(list.length ? list : []).map(p => (
                        <li key={p.id} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          <span className="text-sm truncate">{p.title}</span>
                          {p.created_at && (
                            <time
                              dateTime={p.created_at}
                              className="ml-auto text-xs text-gray-500 dark:text-gray-400"
                            >
                              {new Date(p.created_at).toLocaleDateString('de-DE')}
                            </time>
                          )}
                        </li>
                      ))}
                      {list.length === 0 && (
                        <li className="text-sm text-gray-500">Noch keine Beiträge.</li>
                      )}
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
                      <span className="font-semibold truncate">{g.name}</span>
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

                {/* Wenn es schon Vorschau gibt: zeige die jüngsten 2 Titel als Mini-Liste */}
                {previews[g.id]?.length ? (
                  <ul className="mt-3 space-y-1.5">
                    {previews[g.id].slice(0,2).map(p => (
                      <li key={p.id} className="flex items-center gap-2 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        <span className="truncate">{p.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ===== Skeletons ===== */
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
