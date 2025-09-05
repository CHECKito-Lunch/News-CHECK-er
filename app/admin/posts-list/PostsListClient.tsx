// app/admin/posts-list/PostsListClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminTabs from '../shared/AdminTabs';
import { useAdminAuth } from '../shared/auth';
import { inputClass, cardClass } from '../shared/ui';
import { statusDE } from '../shared/helpers';
import type { Option, PostRow, Revision } from '../shared/types';

export default function PostsListClient() {
  const { loading, sessionOK, isAdmin, authMsg, setAuthMsg, userEmail, setUserEmail, userPassword, setUserPassword, doLogin } = useAdminAuth();
  const router = useRouter();

  const [meta, setMeta] = useState<{ categories: Option[]; badges: Option[]; vendors: Option[] }>({ categories: [], badges: [], vendors: [] });
  const [rows, setRows] = useState<PostRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loadingPosts, setLoadingPosts] = useState(false);
  const pageSize = 20;

  const [historyOpenFor, setHistoryOpenFor] = useState<number | null>(null);
  const [historyItems, setHistoryItems] = useState<Revision[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => { fetch('/api/meta', { credentials:'same-origin' }).then(r=>r.json()).then(setMeta).catch(()=>setMeta({categories:[],badges:[],vendors:[]})); }, []);
  useEffect(() => { if (sessionOK && isAdmin) load(1, q); }, [sessionOK, isAdmin]);

  async function load(p = page, search = q) {
    setLoadingPosts(true);
    const params = new URLSearchParams({ page:String(p), pageSize:String(pageSize) });
    if (search) params.set('q', search);
    try {
      const res = await fetch(`/api/admin/posts?${params.toString()}`, { credentials:'same-origin' });
      const json = await res.json().catch(()=>({}));
      setRows(json.data ?? []); setTotal(json.total ?? 0); setPage(p);
    } finally { setLoadingPosts(false); }
  }

  function scheduledFor(iso?: string | null) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.getTime() > Date.now() ? d.toLocaleString() : '—';
  }

  async function openHistory(id: number) {
    setHistoryOpenFor(id); setHistoryLoading(true); setHistoryError('');
    try {
      const res = await fetch(`/api/admin/posts/${id}/history`, { credentials:'same-origin' });
      const j = await res.json();
      setHistoryItems(j.data ?? []);
    } catch { setHistoryError('Konnte Historie nicht laden.'); }
    finally { setHistoryLoading(false); }
  }

  async function deletePost(id: number) {
    if (!confirm('Wirklich löschen?')) return;
    const res = await fetch(`/api/admin/posts/${id}`, { method:'DELETE', credentials:'same-origin' });
    if (!res.ok) { const j = await res.json().catch(()=>({})); alert(j.error || 'Löschen fehlgeschlagen'); return; }
    await load(page, q);
  }

  // ---------- RENDER ----------
  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Admin · Beiträge</h1>
      <AdminTabs />

      {!loading && !sessionOK && (
        <div className={cardClass + ' space-y-3'}>
          <h2 className="text-lg font-semibold">Login</h2>
          <form onSubmit={doLogin} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="email" required placeholder="E-Mail" value={userEmail} onChange={(e)=>setUserEmail(e.target.value)} className={inputClass} />
            <input type="password" required placeholder="Passwort" value={userPassword} onChange={(e)=>setUserPassword(e.target.value)} className={inputClass} />
            <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">Anmelden</button>
          </form>
          {authMsg && <p className="text-sm text-gray-600 dark:text-gray-300">{authMsg}</p>}
        </div>
      )}

      {sessionOK && !isAdmin && (
        <div className={cardClass + ' space-y-2'}>
          <h2 className="text-lg font-semibold">Kein Zugriff</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">Du bist angemeldet, aber kein Admin/Moderator.</p>
        </div>
      )}

      {sessionOK && isAdmin && (
        <div className={cardClass + ' space-y-3'}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Vorhandene Beiträge</h2>
            <div className="flex gap-2">
              <input value={q} onChange={(e)=>setQ(e.target.value)} onKeyDown={(e)=>{ if (e.key==='Enter') { setPage(1); load(1, q); } }} placeholder="Suche Titel/Slug…" className={inputClass + ' w-56'} />
              <button type="button" onClick={()=>{ setPage(1); load(1, q); }} className="px-3 py-2 rounded-lg bg-blue-600 text-white">Suchen</button>
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
                      <th className="px-3 py-2">Geplant für</th>
                      <th className="px-3 py-2">Veranstalter</th>
                      <th className="px-3 py-2">Autor</th>
                      <th className="px-3 py-2">Letzte Änderung</th>
                      <th className="px-3 py-2">Historie</th>
                      <th className="px-3 py-2 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(p => (
                      <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2 font-medium truncate max-w-[28ch]">{p.title}</td>
                        <td className="px-3 py-2 text-gray-500 truncate max-w-[22ch]">{p.slug}</td>
                        <td className="px-3 py-2">{statusDE(p.status)}</td>
                        <td className="px-3 py-2 text-gray-500">{scheduledFor(p.effective_from)}</td>
                        <td className="px-3 py-2">{meta.vendors.find(v => v.id === p.vendor_id)?.name ?? '—'}</td>
                        <td className="px-3 py-2">{p.author_name ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500">
                          {p.updated_at ? new Date(p.updated_at).toLocaleString() : p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={()=>openHistory(p.id)} className="px-2 py-1 rounded border dark:border-gray-700" title="Änderungshistorie" aria-label="Änderungshistorie anzeigen">🕓</button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-2">
                            <button type="button" onClick={()=>router.push(`/admin/news?id=${p.id}`)} className="px-2 py-1 rounded border dark:border-gray-700">Bearbeiten</button>
                            <button type="button" onClick={()=>deletePost(p.id)} className="px-2 py-1 rounded bg-red-600 text-white">Löschen</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {rows.length===0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">Keine Einträge.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-3">
                <div className="text-xs text-gray-500">{total} Einträge</div>
                <div className="flex items-center gap-2">
                  <button disabled={page<=1} onClick={()=>{ const n = page-1; setPage(n); load(n, q); }} className="px-3 py-1.5 rounded border disabled:opacity-50">Zurück</button>
                  <span className="text-sm">Seite {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
                  <button disabled={page >= Math.max(1, Math.ceil(total / pageSize))} onClick={()=>{ const n = page+1; setPage(n); load(n, q); }} className="px-3 py-1.5 rounded border disabled:opacity-50">Weiter</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Historie-Popover */}
      {historyOpenFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={()=>setHistoryOpenFor(null)} />
          <div className="relative z-10 w-[min(680px,95vw)] max-h-[80vh] overflow-auto rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Änderungshistorie</h3>
              <button onClick={()=>setHistoryOpenFor(null)} className="px-2 py-1 rounded border dark:border-gray-700">Schließen</button>
            </div>

            {historyLoading && <div className="text-sm text-gray-500">lädt…</div>}
            {historyError && <div className="text-sm text-red-600">{historyError}</div>}

            {!historyLoading && !historyError && (
              <div className="space-y-3">
                {historyItems.length === 0 && <div className="text-sm text-gray-500">Keine Einträge.</div>}
                {historyItems.map(h => (
                  <div key={h.id} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="font-medium">{h.editor_name ?? 'Unbekannt'} · {h.action === 'create' ? 'Erstellt' : h.action === 'update' ? 'Geändert' : 'Gelöscht'}</div>
                      <div className="text-gray-500">{new Date(h.changed_at).toLocaleString()}</div>
                    </div>

                    {h.changes?.fields?.length ? (
                      <div className="mt-2 text-sm">
                        <div className="font-medium mb-1">Felder:</div>
                        <ul className="list-disc pl-5 space-y-1">
                          {h.changes.fields.map((f,i)=>(
                            <li key={i}>
                              <span className="font-mono">{String(f.key)}</span>{' '}
                              <span className="text-gray-500">„{String(f.from ?? '—')}” → „{String(f.to ?? '—')}”</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {(h.changes?.categories?.added?.length || h.changes?.categories?.removed?.length) ? (
                      <div className="mt-2 text-sm">
                        <div className="font-medium mb-1">Kategorien:</div>
                        <div className="text-gray-600">+ {h.changes.categories?.added?.join(', ') || '—'} · − {h.changes.categories?.removed?.join(', ') || '—'}</div>
                      </div>
                    ) : null}

                    {(h.changes?.badges?.added?.length || h.changes?.badges?.removed?.length) ? (
                      <div className="mt-2 text-sm">
                        <div className="font-medium mb-1">Badges:</div>
                        <div className="text-gray-600">+ {h.changes.badges?.added?.join(', ') || '—'} · − {h.changes?.badges?.removed?.join(', ') || '—'}</div>
                      </div>
                    ) : null}

                    {(h.changes?.sources?.added?.length || h.changes?.sources?.removed?.length) ? (
                      <div className="mt-2 text-sm">
                        <div className="font-medium mb-1">Quellen:</div>
                        <div className="text-gray-600">+ {(h.changes.sources?.added || []).join(', ') || '—'} · − {(h.changes?.sources?.removed || []).join(', ') || '—'}</div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
