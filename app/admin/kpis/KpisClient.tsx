'use client';

// app/admin/kpis/KpisClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminTabs from '../shared/AdminTabs';

type Trend = 'up'|'down'|'flat'|null;
type KPI = {
  id: number;
  key: string;
  label: string;
  value: string;
  unit: string | null;
  trend: Trend;
  color: string | null;
  sort: number;
  updated_at?: string | null;
};

const input = 'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';
const card  = 'p-4 rounded-2xl shadow-sm bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800';
const btn   = 'px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700';
const primary = 'px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white';

export default function KPIsAdminPage() {
  const [rows, setRows] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(false);

  // form (create/update)
  const [editId, setEditId] = useState<number|null>(null);
  const [keyV, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [trend, setTrend] = useState<Trend>(null);
  const [color, setColor] = useState('');
  const [sort, setSort] = useState<number>(0);
  const canSave = useMemo(() => keyV.trim() && label.trim() && value.trim(), [keyV, label, value]);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin/kpis');
    const j = await r.json();
    setRows(j.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetForm() {
    setEditId(null); setKey(''); setLabel(''); setValue(''); setUnit(''); setTrend(null); setColor(''); setSort(0);
  }

  async function save() {
    const body = { key: keyV.trim(), label: label.trim(), value: value.trim(), unit: unit || null, trend, color: color || null, sort };
    const url = editId ? `/api/admin/kpis/${editId}` : '/api/admin/kpis';
    const method = editId ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      const j = await r.json().catch(()=>({}));
      alert(j.error || 'Fehler beim Speichern');
      return;
    }
    await load();
    if (!editId) resetForm();
  }

  function startEdit(k: KPI) {
    setEditId(k.id);
    setKey(k.key); setLabel(k.label); setValue(k.value);
    setUnit(k.unit ?? ''); setTrend(k.trend ?? null); setColor(k.color ?? ''); setSort(k.sort ?? 0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function del(id: number) {
    if (!confirm('KPI wirklich löschen?')) return;
    const r = await fetch(`/api/admin/kpis/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      const j = await r.json().catch(()=>({}));
      alert(j.error || 'Löschen fehlgeschlagen');
      return;
    }
    await load();
    if (editId === id) resetForm();
  }

  async function move(id: number, dir: -1|1) {
    const idx = rows.findIndex(r => r.id === id);
    const swap = rows[idx + dir];
    if (!swap) return;
    const a = rows[idx], b = swap;
    // simple swap
    await fetch(`/api/admin/kpis/${a.id}`, { method: 'PATCH', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sort: b.sort }) });
    await fetch(`/api/admin/kpis/${b.id}`, { method: 'PATCH', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ sort: a.sort }) });
    await load();
  }

  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">KPIs</h1>
      <AdminTabs />
      <div className={card + ' space-y-3'}>
        <h2 className="text-lg font-semibold">{editId ? `Bearbeiten (ID ${editId})` : 'Neue KPI anlegen'}</h2>
        <div className="grid md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="form-label">Key</label>
            <input value={keyV} onChange={e=>setKey(e.target.value)} className={input} placeholder="z.B. leads_total" />
          </div>
          <div className="md:col-span-2">
            <label className="form-label">Label</label>
            <input value={label} onChange={e=>setLabel(e.target.value)} className={input} placeholder="Bezeichnung" />
          </div>
          <div>
            <label className="form-label">Wert</label>
            <input value={value} onChange={e=>setValue(e.target.value)} className={input} placeholder="z.B. 1.234" />
          </div>
          <div>
            <label className="form-label">Einheit</label>
            <input value={unit} onChange={e=>setUnit(e.target.value)} className={input} placeholder="z.B. € / % / Stk." />
          </div>
          <div>
            <label className="form-label">Trend</label>
            <select value={trend ?? ''} onChange={e=>setTrend((e.target.value || null) as Trend)} className={input}>
              <option value="">–</option>
              <option value="up">up</option>
              <option value="down">down</option>
              <option value="flat">flat</option>
            </select>
          </div>
          <div>
            <label className="form-label">Farbe (optional)</label>
            <input value={color} onChange={e=>setColor(e.target.value)} className={input} placeholder="#10b981" />
          </div>
          <div>
            <label className="form-label">Sortierung</label>
            <input type="number" value={sort} onChange={e=>setSort(Number(e.target.value))} className={input} />
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
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Wert</th>
                  <th className="px-3 py-2">Einheit</th>
                  <th className="px-3 py-2">Trend</th>
                  <th className="px-3 py-2">Farbe</th>
                  <th className="px-3 py-2">Sort</th>
                  <th className="px-3 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((k, i) => (
                  <tr key={k.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2">{k.key}</td>
                    <td className="px-3 py-2">{k.label}</td>
                    <td className="px-3 py-2">{k.value}</td>
                    <td className="px-3 py-2">{k.unit ?? '—'}</td>
                    <td className="px-3 py-2">{k.trend ?? '—'}</td>
                    <td className="px-3 py-2">{k.color ?? '—'}</td>
                    <td className="px-3 py-2">{k.sort}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-2">
                        <button onClick={()=>move(k.id,-1)} className={btn} disabled={i===0}>↑</button>
                        <button onClick={()=>move(k.id, 1)} className={btn} disabled={i===rows.length-1}>↓</button>
                        <button onClick={()=>startEdit(k)} className={btn}>Bearbeiten</button>
                        <button onClick={()=>del(k.id)} className="px-3 py-2 rounded-lg bg-red-600 text-white">Löschen</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length===0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">Keine KPIs.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
