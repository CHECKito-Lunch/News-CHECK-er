/* eslint-disable @typescript-eslint/no-unused-vars */
 
'use client';
import { useEffect, useMemo, useState } from 'react';

type Item = {
  id: string;
  user_id: string;
  user_name?: string|null;
  day: string;          // YYYY-MM-DD
  start_min: number|null;
  end_min: number|null;
  minutes_worked: number|null;
  label: string|null;
  kind: 'work'|'absent'|'holiday'|'free';
  note: string|null;
};

function minToHHMM(n:number|null|undefined){
  if (n==null || n<0) return '—';
  const h = Math.floor(n/60);
  const m = n%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

export default function TeamRosterList({ teamId }: { teamId: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(()=> new Date(), []);
  const from = useMemo(()=>{
    const d = new Date(today); d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  },[today]);
  const to = useMemo(()=>{
    const d = new Date(today); d.setDate(d.getDate()+7);
    d.setHours(0,0,0,0);
    return d.toISOString().slice(0,10);
  },[today]);

  useEffect(()=>{
    const run = async ()=>{
      setLoading(true);
      const qs = new URLSearchParams({ team_id:String(teamId), from, to });
      const r = await fetch(`/api/teamhub/roster?${qs.toString()}`, { cache:'no-store' });
      const j = await r.json().catch(()=>null);
      setItems(Array.isArray(j?.items) ? j.items : []);
      setLoading(false);
    };
    if (teamId) run();
  },[teamId, from, to]);

  // group by day
  const byDay = useMemo(()=>{
    const m = new Map<string, Item[]>();
    for (const it of items) {
      const arr = m.get(it.day) ?? [];
      arr.push(it);
      m.set(it.day, arr);
    }
    // sort each day by user_name
    for (const [k, arr] of m) arr.sort((a,b)=> (a.user_name||'').localeCompare(b.user_name||''));
    return Array.from(m.entries()).sort((a,b)=> a[0]<b[0]? -1:1);
  }, [items]);

  const fmtDay = (iso:string) => {
    const d = new Date(iso+'T00:00:00Z');
    return d.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit' });
  };

  const pill = (kind:Item['kind']) =>
    kind==='work' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
  : kind==='absent' ? 'border-amber-200 bg-amber-50 text-amber-700'
  : kind==='holiday' ? 'border-blue-200 bg-blue-50 text-blue-700'
  : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center">
        <div className="font-semibold text-sm">Dienstplan (nächste 7 Tage)</div>
        <span className="ml-auto text-xs text-gray-500">{loading ? 'lädt…' : items.length}</span>
      </div>

      {loading && <div className="p-4 text-sm text-gray-500">Lade…</div>}

      {!loading && byDay.length===0 && (
        <div className="p-4 text-sm text-gray-500">Keine Einträge im Zeitraum.</div>
      )}

      {!loading && byDay.length>0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {byDay.map(([day, arr])=>(
            <div key={day} className="p-3">
              <div className="text-xs font-semibold text-gray-600 mb-2">{fmtDay(day)}</div>
              <ul className="space-y-1">
                {arr.map(it=>(
                  <li key={it.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{it.user_name || '—'}</div>
                      <div className="text-[12px] text-gray-500">
                        {it.label ? <span className="mr-2">„{it.label}“</span> : null}
                        {it.kind==='work'
                          ? <span>{minToHHMM(it.start_min)} – {minToHHMM(it.end_min)}{it.minutes_worked!=null ? ` (${Math.round(it.minutes_worked/60*10)/10}h)` : ''}</span>
                          : <span>{it.note || (it.kind==='holiday'?'Feiertag':'Frei')}</span>
                        }
                      </div>
                    </div>
                    <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${pill(it.kind)}`}>
                      {it.kind==='work' ? 'Dienst' : it.kind==='absent' ? 'Abw.' : it.kind==='holiday' ? 'Feiertag' : 'Frei'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
