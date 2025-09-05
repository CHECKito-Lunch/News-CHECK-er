'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminTabs from '../shared/AdminTabs';

type Tool = { id:number; title:string; icon:string|null; href:string; sort:number };

const input = 'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';
const card  = 'p-4 rounded-2xl shadow-sm bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800';
const btn   = 'px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700';
const primary = 'px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white';

export default function AdminToolsPage() {
  const [rows, setRows] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);

  const [editId, setEditId] = useState<number|null>(null);
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('');
  const [href, setHref] = useState('');
  const [sort, setSort] = useState<number>(0);

  const canSave = useMemo(() => title.trim() && href.trim(), [title, href]);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin/tools');
    const j = await r.json();
    setRows(j.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetForm() {
    setEditId(null); setTitle(''); setIcon(''); setHref(''); setSort(0);
  }

  async function save() {
    const body = { title: title.trim(), icon: icon || null, href: href.trim(), sort };
    const url = editId ? `/api/admin/tools/${editId}` : '/api/admin/tools';
    const method = editId ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      const j = await r.json().catch(()=>({}));
      alert(j.error || 'Fehler beim Speichern');
      return;
    }
    await load();
    if (!editId) resetForm();
  }

  function startEdit(t: Tool) {
    setEditId(t.id); setTitle(t.title); setIcon(t.icon ?? ''); setHref(t.href); setSort(t.sort ?? 0);
    window.scrollTo({ top: 0, behavior:'smooth' });
  }

  async function del(id:number) {
    if (!confirm('Tool wirklich löschen?')) return;
    const r = await fetch(`/api/admin/tools/${id}`, { method:'DELETE' });
    if (!r.ok) {
      const j = await r.json().catch(()=>({}));
      alert(j.error || 'Löschen fehlgeschlagen');
      return;
    }
    await load();
    if (editId===id) resetForm();
  }

  async function move(id:number, dir:-1|1) {
    const idx = rows.findIndex(r => r.id===id);
    const swap = rows[idx+dir];
    if (!swap) return;
    const a = rows[idx], b = swap;
    await fetch(`/api/admin/tools/${a.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sort: b.sort }) });
    await fetch(`/api/admin/tools/${b.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sort: a.sort }) });
    await load();
  }

  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-5">
      <h1 className="text-2xl font-bold">Tools verwalten</h1>
       <AdminTabs />

      <div className={card + ' space-y-3'}>
        <h2 className="text-lg font-semibold">{editId ? `Bearbeiten (ID ${editId})` : 'Neues Tool anlegen'}</h2>
        <div className="grid md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="form-label">Titel</label>
            <input className={input} value={title} onChange={e=>setTitle(e.target.value)} placeholder="z. B. Dashboard" />
          </div>
          <div>
            <label className="form-label">Icon (Emoji/Code)</label>
            <input className={input} value={icon} onChange={e=>setIcon(e.target.value)} placeholder="z. B. 📊" />
          </div>
          <div className="md:col-span-2">
            <label className="form-label">Link</label>
            <input className={input} value={href} onChange={e=>setHref(e.target.value)} placeholder="/tools/dashboard oder https://…" />
          </div>
          <div>
            <label className="form-label">Sort</label>
            <input className={input} type="number" value={sort} onChange={e=>setSort(Number(e.target.value))} />
          </div>
          <div className="flex gap-2">
            <button disabled={!canSave} onClick={save} className={primary} type="button">Speichern</button>
            <button onClick={resetForm} className={btn} type="button">Neu</button>
          </div>
        </div>
      </div>

      <div className={card}>
        {loading ? (
          <div className="text-sm text-gray-500">lädt…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-left">
                <tr>
                  <th className="px-3 py-2">Titel</th>
                  <th className="px-3 py-2">Icon</th>
                  <th className="px-3 py-2">Link</th>
                  <th className="px-3 py-2">Sort</th>
                  <th className="px-3 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t, i) => (
                  <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2 font-medium">{t.title}</td>
                    <td className="px-3 py-2">{t.icon ?? '—'}</td>
                    <td className="px-3 py-2 truncate max-w-[40ch]">{t.href}</td>
                    <td className="px-3 py-2">{t.sort}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-2">
                        <button className={btn} onClick={()=>move(t.id,-1)} title="hoch">↑</button>
                        <button className={btn} onClick={()=>move(t.id,+1)} title="runter">↓</button>
                        <button className={btn} onClick={()=>startEdit(t)}>Bearbeiten</button>
                        <button className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white" onClick={()=>del(t.id)}>Löschen</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length===0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Keine Tools.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
