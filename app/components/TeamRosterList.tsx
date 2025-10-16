/* eslint-disable react-hooks/exhaustive-deps */
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
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({}); // day ISO -> open?

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

  // init: alle Tage zu (nur beim ersten Erhalt der Tage)
  useEffect(()=>{
    if (!byDay.length) { setOpenDays({}); return; }
    setOpenDays(prev=>{
      if (Object.keys(prev).length) return prev;
      const init: Record<string, boolean> = {};
      for (const [day] of byDay) init[day] = false;
      return init;
    });
  }, [byDay.map(([d])=>d).join('|')]);

  const fmtDay = (iso:string) => {
    const d = new Date(iso+'T00:00:00Z');
    return d.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit' });
  };

  const pill = (kind:Item['kind']) =>
    kind==='work' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
  : kind==='absent' ? 'border-amber-200 bg-amber-50 text-amber-700'
  : kind==='holiday' ? 'border-blue-200 bg-blue-50 text-blue-700'
  : 'border-slate-200 bg-slate-50 text-slate-600';

  // kleine Badge
  const Badge = ({ children, className='' }:{children:React.ReactNode; className?:string}) =>
    <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${className}`} >{children}</span>;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <div className="font-semibold text-sm">Dienstplan (nächste 7 Tage)</div>
        <span className="ml-auto text-xs text-gray-500">{loading ? 'lädt…' : items.length}</span>
        {!loading && byDay.length>0 && (
          <>
            <button
              className="text-xs px-2 py-1 rounded border"
              onClick={()=>setOpenDays(Object.fromEntries(byDay.map(([d])=>[d,true])))}
            >Alle öffnen</button>
            <button
              className="text-xs px-2 py-1 rounded border"
              onClick={()=>setOpenDays(Object.fromEntries(byDay.map(([d])=>[d,false])))}
            >Alle schließen</button>
          </>
        )}
      </div>

      {loading && <div className="p-4 text-sm text-gray-500">Lade…</div>}

      {!loading && byDay.length===0 && (
        <div className="p-4 text-sm text-gray-500">Keine Einträge im Zeitraum.</div>
      )}

      {!loading && byDay.length>0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {byDay.map(([day, arr])=>{
            // Tages-Stats
            const work = arr.filter(a=>a.kind==='work');
            const absent = arr.filter(a=>a.kind==='absent');
            const holiday = arr.filter(a=>a.kind==='holiday');
            const free = arr.filter(a=>a.kind==='free');
            const totalH = Math.round((work.reduce((s,x)=>s+(x.minutes_worked||0),0)/60)*10)/10;

            const open = !!openDays[day];

            return (
              <div key={day} className="p-0">
                {/* Kopfzeile (Toggle) */}
                <button
                  className="w-full px-3 py-2 flex items-center gap-2 justify-between bg-gray-50/70 dark:bg-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors"
                  onClick={()=>setOpenDays(p=>({ ...p, [day]: !open }))}
                  aria-expanded={open}
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{fmtDay(day)}</span>
                    <div className="hidden sm:flex items-center gap-2">
                      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Dienst {work.length}{totalH?` · ${totalH}h`:''}</Badge>
                      <Badge className="border-amber-200 bg-amber-50 text-amber-700">Abw. {absent.length}</Badge>
                      <Badge className="border-blue-200 bg-blue-50 text-blue-700">Feiertag {holiday.length}</Badge>
                      <Badge className="border-slate-200 bg-slate-50 text-slate-700">Frei {free.length}</Badge>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="sm:hidden">
                      {(work.length+absent.length+holiday.length+free.length)} Einträge
                    </span>
                    <span className="text-gray-400">{open ? '▾' : '▸'}</span>
                  </div>
                </button>

                {/* Inhalt */}
                {open && (
                  <div className="p-3">
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
                          <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${
                            it.kind==='work' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : it.kind==='absent' ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : it.kind==='holiday' ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}>
                            {it.kind==='work' ? 'Dienst' : it.kind==='absent' ? 'Abw.' : it.kind==='holiday' ? 'Feiertag' : 'Frei'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
