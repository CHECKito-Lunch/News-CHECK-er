/* eslint-disable react-hooks/exhaustive-deps */
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

/** Dienstzeit vorhanden? -> anwesend */
const isPresent = (it: Item) => it.start_min != null && it.end_min != null;
const presenceBadgeClass = (present: boolean) =>
  present
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
const presenceLabel = (present: boolean) => (present ? 'Anwesend' : 'Abwesend');

/** YYYY-MM-DD für eine gegebene TZ (hier: Europe/Berlin) */
const ymdInTz = (d: Date, tz = 'Europe/Berlin') =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Sichere Anzeige eines YYYY-MM-DD mit Berlin-TZ (mittags-UTC, um DST-Ränder zu vermeiden) */
const fmtDay = (iso: string) => {
  const safe = new Date(iso + 'T12:00:00Z');
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit' }).format(safe);
};

export default function TeamRosterList({ teamId }: { teamId: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({}); // day ISO -> open?

  // "Heute" & Zeitraum (in Europe/Berlin, nicht UTC!)
  const now = useMemo(()=> new Date(), []);
  const todayISO = useMemo(() => ymdInTz(now, 'Europe/Berlin'), [now]);
  const from = todayISO;
  const to = useMemo(()=>{
    const d = new Date(now);
    d.setDate(d.getDate()+7);
    return ymdInTz(d, 'Europe/Berlin');
  },[now]);

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

  // Gruppierung nach Tag (YYYY-MM-DD)
  const byDay = useMemo(()=>{
    const m = new Map<string, Item[]>();
    for (const it of items) {
      const arr = m.get(it.day) ?? [];
      arr.push(it);
      m.set(it.day, arr);
    }
    // sortiere innerhalb eines Tages nach Name
    for (const [, arr] of m) arr.sort((a,b)=> (a.user_name||'').localeCompare(b.user_name||''));
    // sortiere Tage aufsteigend
    return Array.from(m.entries()).sort((a,b)=> a[0]<b[0]? -1:1);
  }, [items]);

  // Aufteilen in: HEUTE, REST DER WOCHE (morgen..to), ARCHIV (alles andere)
  const { todayEntry, upcomingEntries, archiveEntries } = useMemo(()=>{
    const t = todayISO;
    const res = {
      todayEntry: undefined as undefined | [string, Item[]],
      upcomingEntries: [] as Array<[string, Item[]]>,
      archiveEntries: [] as Array<[string, Item[]]>,
    };
    for (const entry of byDay) {
      const day = entry[0];
      if (day === t) {
        res.todayEntry = entry;
      } else if (day > t && day <= to) {
        res.upcomingEntries.push(entry);
      } else {
        res.archiveEntries.push(entry);
      }
    }
    res.upcomingEntries.sort((a,b)=> a[0] < b[0] ? -1 : 1);
    res.archiveEntries.sort((a,b)=> a[0] < b[0] ? -1 : 1);
    return res;
  }, [byDay, todayISO, to]);

  // init: Heute offen, Rest zu (nur einmalig)
  useEffect(()=>{
    const allDays = [
      ...(todayEntry ? [todayEntry[0]] : []),
      ...upcomingEntries.map(([d])=>d),
      ...archiveEntries.map(([d])=>d),
    ];
    if (!allDays.length) { setOpenDays({}); return; }
    setOpenDays(prev=>{
      if (Object.keys(prev).length) return prev;
      const init: Record<string, boolean> = {};
      for (const d of allDays) init[d] = (d === todayISO); // Heute offen
      return init;
    });
  }, [
    todayEntry?.[0] ?? '',
    upcomingEntries.map(([d])=>d).join('|'),
    archiveEntries.map(([d])=>d).join('|'),
    todayISO
  ]);

  // kleine Badge
  const Badge = ({ children, className='' }:{children:React.ReactNode; className?:string}) =>
    <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border ${className}`} >{children}</span>;

  // Renderer für eine Tagesgruppe
  const renderDayBlock = (entry: [string, Item[]]) => {
    const [day, arr] = entry;
    const present = arr.filter(a=>isPresent(a));
    const absent  = arr.filter(a=>!isPresent(a));
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
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">
              {day === todayISO ? `Heute · ${fmtDay(day)}` : fmtDay(day)}
            </span>
            <div className="hidden sm:flex items-center gap-2">
              <Badge className={presenceBadgeClass(true)}>Anwesend {present.length}</Badge>
              <Badge className={presenceBadgeClass(false)}>Abwesend {absent.length}</Badge>
            </div>
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <span className="sm:hidden">
              {(present.length+absent.length)} Einträge
            </span>
            <span className="text-gray-400">{open ? '▾' : '▸'}</span>
          </div>
        </button>

        {/* Inhalt */}
        {open && (
          <div className="p-3">
            <ul className="space-y-1">
              {arr.map(it=>{
                const present = isPresent(it);
                return (
                  <li key={it.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{it.user_name || '—'}</div>
                      <div className="text-[12px] text-gray-500">
                        {present
                          ? <span>{minToHHMM(it.start_min)} – {minToHHMM(it.end_min)}{it.minutes_worked!=null ? ` (${Math.round(it.minutes_worked/60*10)/10}h)` : ''}</span>
                          : <span>{it.note || '—'}</span>
                        }
                      </div>
                    </div>
                    <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${presenceBadgeClass(present)}`}>
                      {presenceLabel(present)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // Zähler für Header
  const totalCount =
    (todayEntry ? todayEntry[1].length : 0) +
    upcomingEntries.reduce((s, [,arr])=> s+arr.length, 0) +
    archiveEntries.reduce((s, [,arr])=> s+arr.length, 0);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <div className="font-semibold text-sm">Dienstplan (heute & nächste 7 Tage)</div>
        <span className="ml-auto text-xs text-gray-500">{loading ? 'lädt…' : totalCount}</span>
        {!loading && (todayEntry || upcomingEntries.length || archiveEntries.length) && (
          <>
            <button
              className="text-xs px-2 py-1 rounded border"
              onClick={()=>{
                const allDays = [
                  ...(todayEntry ? [todayEntry[0]] : []),
                  ...upcomingEntries.map(([d])=>d),
                  ...archiveEntries.map(([d])=>d),
                ];
                setOpenDays(Object.fromEntries(allDays.map(d=>[d,true])));
              }}
            >Alle öffnen</button>
            <button
              className="text-xs px-2 py-1 rounded border"
              onClick={()=>{
                const allDays = [
                  ...(todayEntry ? [todayEntry[0]] : []),
                  ...upcomingEntries.map(([d])=>d),
                  ...archiveEntries.map(([d])=>d),
                ];
                setOpenDays(Object.fromEntries(allDays.map(d=>[d,false])));
              }}
            >Alle schließen</button>
          </>
        )}
      </div>

      {loading && <div className="p-4 text-sm text-gray-500">Lade…</div>}

      {!loading && !todayEntry && upcomingEntries.length===0 && archiveEntries.length===0 && (
        <div className="p-4 text-sm text-gray-500">Keine Einträge.</div>
      )}

      {/* HEUTE + REST DER WOCHE */}
      {!loading && (todayEntry || upcomingEntries.length>0) && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {todayEntry && renderDayBlock(todayEntry)}
          {upcomingEntries.map(entry => renderDayBlock(entry))}
        </div>
      )}

      {/* ARCHIV */}
      {!loading && archiveEntries.length>0 && (
        <div className="mt-3 border-t border-gray-200 dark:border-gray-800">
          <div className="px-3 pt-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Archiv</div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {archiveEntries.map(entry => renderDayBlock(entry))}
          </div>
        </div>
      )}
    </div>
  );
}
