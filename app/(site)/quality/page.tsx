/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authedFetch } from '@/lib/fetchWithSupabase';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

// API: /api/me/qa – siehe unten

type Item = {
  id: number|string;
  ts?: string | null;
  incident_type?: string | null;
  category?: string | null;
  severity?: string | null;
  description?: string | null;
};

export default function QualityPage(){
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try{
      const qs = new URLSearchParams(); if (from) qs.set('from', from); if (to) qs.set('to', to);
      const r = await authedFetch(`/api/me/qa${qs.toString()?`?${qs.toString()}`:''}`);
      const j = await r.json();
      setItems(Array.isArray(j?.items)? j.items : []);
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const byMonth = useMemo(()=>{
    const FE_TZ = 'Europe/Berlin';
    const ymKey = (iso?:string|null)=>{
      if (!iso) return null; const d = new Date(iso); if (isNaN(d.getTime())) return null;
      const z = new Date(d.toLocaleString('en-US', { timeZone: FE_TZ }));
      return `${z.getFullYear()}-${String(z.getMonth()+1).padStart(2,'0')}`;
    };
    const m = new Map<string, number>();
    items.forEach(i=>{ const k = ymKey(i.ts); if (!k) return; m.set(k,(m.get(k)||0)+1); });
    const arr = [...m.entries()].sort((a,b)=> a[0]<b[0]? -1:1);
    return arr.map(([k,v])=>({ month:k, count:v }));
  },[items]);

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meine QA-Vorfälle</h1>
      </header>

      <section className="p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="px-2 py-1.5 border rounded" />
          <span className="text-gray-400">–</span>
          <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="px-2 py-1.5 border rounded" />
        </div>

        {loading && <div className="text-sm text-gray-500">Lade…</div>}

        {!loading && (
          <>
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-900 mb-4">
              <div className="text-sm font-medium mb-2">Monatsverlauf (Anzahl Vorfälle)</div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={byMonth}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v:any)=>[v,'Vorfälle']} />
                    <Line type="monotone" dataKey="count" dot={false} strokeWidth={2.2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <ul className="divide-y divide-gray-200 dark:divide-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              {(items||[]).map(it=> (
                <li key={String(it.id)} className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{it.category || it.incident_type || '—'}</div>
                      <div className="text-xs text-gray-500 line-clamp-1">{it.description || '—'}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-gray-500">{new Date(it.ts||'').toLocaleString('de-DE')}</div>
                    </div>
                  </div>
                </li>
              ))}
              {(items||[]).length===0 && <li className="p-3 text-sm text-gray-500">Keine Einträge im Zeitraum.</li>}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}