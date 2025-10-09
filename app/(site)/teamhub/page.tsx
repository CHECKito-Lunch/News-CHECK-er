/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/fetchWithSupabase';

/* ---------------- Types ---------------- */
type Member = { user_id: string; name: string };
type FeedbackItem = {
  id: number|string;
  ts?: string|null;
  feedback_ts?: string|null;
  feedbacktyp: string;
  bewertung?: number|null;
  beraterfreundlichkeit?: number|null;
  beraterqualifikation?: number|null;
  angebotsattraktivitaet?: number|null;
  kommentar?: string|null;
  internal_note?: string|null;
  internal_checked?: boolean|null;
  template_name?: string|null;
  rekla?: any;
  geklaert?: any;
  booking_number_hash?: string|null;
  booking_number?: string|null;
  labels?: Array<{id:number; name:string; color?:string}>;
};

type RecentComment = {
  id: number;
  feedback_id: number;
  author: string;
  body: string;
  created_at: string;
};

/* ---------------- Helpers ---------------- */
const FE_TZ = 'Europe/Berlin';
const BO_BASE = 'https://backoffice.reisen.check24.de/booking/search/';
const isTrueish = (v: unknown) => {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'ja' || s === 'true' || s === '1' || s === 'y' || s === 'yes';
};
const getTs = (f: FeedbackItem) => (f.feedback_ts ?? f.ts ?? null);
const fmtDateTimeBerlin = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: FE_TZ, day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
  }).format(d);
};
const boLinkFor = (f: FeedbackItem): string | null => {
  const hash = f.booking_number_hash ?? undefined;
  const raw  = f.booking_number ?? undefined;
  if (hash && /^[0-9a-f]{64}$/i.test(hash)) return `/api/bo/${hash}`;
  if (raw) return `${BO_BASE}?booking_number=${encodeURIComponent(String(raw).replace(/\D+/g,''))}`;
  return null;
};
const avgScore = (f: FeedbackItem) => {
  const parts = [f.beraterfreundlichkeit, f.beraterqualifikation, f.angebotsattraktivitaet]
    .filter((x): x is number => Number.isFinite(x as number) && (x as number) >= 1);
  if (parts.length >= 2) return parts.reduce((s, n) => s + n, 0) / parts.length;
  if (Number.isFinite(f.bewertung as number) && (f.bewertung as number) >= 1) return f.bewertung as number;
  return null;
};
const fmtAvg = (n: number | null) => Number.isFinite(n as any) ? (n as number).toFixed(2) : '–';
const noteColor = (v: number | null | undefined) =>
  !Number.isFinite(v as any) ? 'text-gray-500'
  : (v as number) >= 4.75 ? 'text-emerald-600'
  : (v as number) >= 4.5  ? 'text-green-600'
  : (v as number) >= 4.0  ? 'text-amber-600'
  : 'text-red-600';

/* --------------- Page ------------------ */
export default function TeamHubPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [userId, setUserId]   = useState<string>('');
  const [from, setFrom]       = useState<string>('');
  const [to, setTo]           = useState<string>('');
  const [items, setItems]     = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Ansicht
  const [view, setView] = useState<'table'|'list'>('table');

  // Kommentar-Karte
  const [recent, setRecent] = useState<RecentComment[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  // Unread-Map (für „Neu vom Mitarbeiter“-Marker)
  const [unreadMap, setUnreadMap] = useState<Record<string, { last_by_owner:boolean; unread_total:number; last_comment_at:string }>>({});

  // ---- Tabellen-Filter pro Spalte ----
  const [fDateFrom, setFDateFrom] = useState<string>('');
  const [fDateTo, setFDateTo]     = useState<string>('');
  const [fKanal, setFKanal]       = useState<string>(''); // exact match (Dropdown)
  const [fTemplate, setFTemplate] = useState<string>(''); // contains
  const [fScoreMin, setFScoreMin] = useState<string>(''); // number
  const [fRekla, setFRekla]       = useState<'any'|'rekla'|'none'>('any');
  const [fStatus, setFStatus]     = useState<'any'|'offen'|'geklärt'>('any');
  const [fComment, setFComment]   = useState<string>(''); // contains
  const [fLabelId, setFLabelId]   = useState<number|''>(''); // by label id

  // Listen-Gruppierung (falls du die Liste weiterhin nutzen willst)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [groupMode, setGroupMode] = useState<'month'|'rating_then_month'>('month');

  useEffect(() => {
    (async () => {
      const r = await authedFetch('/api/teamhub/members', { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      const arr: Member[] = Array.isArray(j?.members) ? j.members : [];
      setMembers(arr);
      if (arr.length && !userId) setUserId(arr[0].user_id);
    })();
  }, []);

  async function load() {
    if (!userId) { setItems([]); return; }
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('user_id', userId);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const r  = await authedFetch(`/api/teamhub/feedback?${qs.toString()}`, { cache: 'no-store' });
      const j  = await r.json().catch(() => null);
      const rows: FeedbackItem[] = Array.isArray(j?.items) ? j.items : [];
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [userId]);
  useEffect(() => { if (userId) load(); }, [from, to]);

  // Kommentar-Karte laden
  useEffect(() => {
    if (!userId) { setRecent([]); return; }
    (async () => {
      setRecentLoading(true);
      try {
        const r = await authedFetch(`/api/teamhub/threads?mode=recent_owner_comments&owner_id=${encodeURIComponent(userId)}&limit=20`, { cache: 'no-store' });
        const j = await r.json().catch(()=>null);
        setRecent(Array.isArray(j?.items) ? j.items : []);
      } finally { setRecentLoading(false); }
    })();
  }, [userId]);

  // Unread-Map laden
  useEffect(()=>{(async()=>{
    if (!userId) { setUnreadMap({}); return; }
    const r = await authedFetch(`/api/teamhub/unread-map?owner_id=${encodeURIComponent(userId)}`, { cache:'no-store' });
    const j = await r.json().catch(()=>null);
    if (j?.ok) setUnreadMap(j.map || {});
  })()}, [userId]);

  const curName = useMemo(() => members.find(m => m.user_id === userId)?.name ?? '—', [members, userId]);

  // Werte für Dropdowns aus Daten ableiten
  const allChannels = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.feedbacktyp) s.add(it.feedbacktyp);
    return [...s].sort();
  }, [items]);
  const allLabels = useMemo(()=>{
    const s = new Map<number,string>();
    for (const it of items) (it.labels||[]).forEach(l=>s.set(l.id, l.name));
    return [...s.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  }, [items]);

  // ---- Tabellenfilter anwenden ----
  const filteredItems = useMemo(()=>{
    return items.filter(f=>{
      // Datum
      const tIso = getTs(f);
      if (!tIso) return false;
      const t = new Date(tIso).getTime();
      if (fDateFrom) {
        const df = new Date(fDateFrom + 'T00:00:00Z').getTime();
        if (t < df) return false;
      }
      if (fDateTo) {
        const dt = new Date(fDateTo + 'T23:59:59Z').getTime();
        if (t > dt) return false;
      }
      // Kanal
      if (fKanal && f.feedbacktyp !== fKanal) return false;
      // Template
      if (fTemplate && !(f.template_name||'').toLowerCase().includes(fTemplate.toLowerCase())) return false;
      // Score min
      if (fScoreMin) {
        const s = avgScore(f) ?? 0;
        if (s < Number(fScoreMin)) return false;
      }
      // Rekla
      if (fRekla === 'rekla' && !isTrueish(f.rekla)) return false;
      if (fRekla === 'none' && isTrueish(f.rekla)) return false;
      // Status
      const isGekl = isTrueish(f.geklaert);
      if (fStatus === 'offen' && isGekl) return false;
      if (fStatus === 'geklärt' && !isGekl) return false;
      // Kommentar
      if (fComment && !(f.kommentar||'').toLowerCase().includes(fComment.toLowerCase())) return false;
      // Label
      if (fLabelId !== '') {
        const ids = new Set((f.labels||[]).map(l=>l.id));
        if (!ids.has(Number(fLabelId))) return false;
      }
      return true;
    }).sort((a,b)=>{
      const ta = getTs(a) ? new Date(getTs(a) as string).getTime() : 0;
      const tb = getTs(b) ? new Date(getTs(b) as string).getTime() : 0;
      return tb - ta;
    });
  }, [items, fDateFrom, fDateTo, fKanal, fTemplate, fScoreMin, fRekla, fStatus, fComment, fLabelId]);

  // ---- Gruppen für Listenansicht (optional beibehalten) ----
  type Group = { key: string; label: string; items: FeedbackItem[] };
  const groups: Group[] = useMemo(() => {
    const arr = filteredItems; // gleiche Filter wie Tabelle
    if (groupMode === 'month') {
      const map = new Map<string, FeedbackItem[]>();
      for (const f of arr) {
        const iso = getTs(f)!;
        const d = new Date(iso);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
        const list = map.get(key) ?? [];
        list.push(f); map.set(key, list);
      }
      return [...map.entries()].sort((a,b)=> a[0]<b[0] ? 1 : -1).map(([k, list])=>{
        const [y,m] = k.split('-');
        const sorted = [...list].sort((a,b)=>{
          const ta = new Date(getTs(a)!).getTime();
          const tb = new Date(getTs(b)!).getTime();
          return tb - ta;
        });
        return { key:k, label:`${m}/${y}`, items:sorted };
      });
    } else {
      const bucketFor = (s:number|null)=>{
        const v = Number(s ?? 0);
        if (v >= 4.95) return '5.00–4.95';
        if (v >= 4.75) return '4.95–4.75';
        if (v >= 4.50) return '4.75–4.50';
        if (v >= 4.00) return '4.50–4.00';
        return '< 4.00';
      };
      const buckets = new Map<string, FeedbackItem[]>();
      for (const f of arr) {
        const b = bucketFor(avgScore(f));
        const list = buckets.get(b) ?? [];
        list.push(f); buckets.set(b, list);
      }
      const order = ['5.00–4.95','4.95–4.75','4.75–4.50','4.50–4.00','< 4.00'];
      const out: Group[] = [];
      for (const b of order) {
        const perMonth = new Map<string, FeedbackItem[]>();
        for (const f of buckets.get(b) || []) {
          const d = new Date(getTs(f)!);
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
          const list = perMonth.get(key) ?? [];
          list.push(f); perMonth.set(key, list);
        }
        [...perMonth.entries()].sort((a,b)=>a[0]<b[0]?1:-1).forEach(([k, list])=>{
          const [y,m] = k.split('-');
          const sorted = [...list].sort((a,b)=>{
            const ta = new Date(getTs(a)!).getTime();
            const tb = new Date(getTs(b)!).getTime();
            return tb - ta;
          });
          out.push({ key:`${b}:${k}`, label:`${b} · ${m}/${y}`, items:sorted });
        });
      }
      return out;
    }
  }, [filteredItems, groupMode]);

  const toggleGroup = (k:string) => setOpenGroups(p=>({ ...p, [k]: !p[k] }));

  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Teamhub</h1>
          <Link href="/" className="text-sm text-blue-600 hover:underline">Zurück</Link>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Mitarbeiter */}
          <select
            value={userId}
            onChange={e => setUserId(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
          >
            {members.map(m => (
              <option key={m.user_id} value={m.user_id}>{m.name}</option>
            ))}
          </select>

          {/* Zeitraum */}
          <div className="flex items-center gap-2">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm" />
            <span className="text-gray-400">–</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm" />
          </div>

          {/* Ansicht */}
          <select
            value={view}
            onChange={e=>setView(e.target.value as any)}
            className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
          >
            <option value="table">Tabelle</option>
            <option value="list">Liste</option>
          </select>

          {/* Label-Manager */}
          <LabelManagerButton />
        </div>
      </header>

      <div className="text-sm text-gray-600 dark:text-gray-300">
        Mitarbeiter: <b>{curName}</b>
      </div>

      {/* Kommentar-Karte */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Neueste Kommentare</div>
          <div className="text-xs text-gray-500">{recentLoading ? 'lädt…' : `${recent.length} Einträge`}</div>
        </div>
        {recent.length === 0 ? (
          <div className="text-sm text-gray-500">Keine Team-Kommentare vorhanden.</div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {recent.map(rc => (
              <li key={rc.id} className="py-2">
                <div className="text-[12px] text-gray-500 mb-1">
                  <span className="font-medium">{rc.author}</span>
                  <span> · {new Date(rc.created_at).toLocaleString('de-DE')}</span>
                  <Link href={`/feedback/${rc.feedback_id}`} className="ml-2 text-blue-600 hover:underline">öffnen</Link>
                </div>
                <p className="text-sm whitespace-pre-wrap">{rc.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {loading && <div className="text-sm text-gray-500">Lade…</div>}

      {/* TABELLENANSICHT */}
      {!loading && view === 'table' && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/60">
              <tr className="text-gray-600 dark:text-gray-300">
                <th className="px-3 py-2 text-left">Neu</th>
                <th className="px-3 py-2 text-left">Datum</th>
                <th className="px-3 py-2 text-left">Kanal</th>
                <th className="px-3 py-2 text-left">Template</th>
                <th className="px-3 py-2 text-right">Ø</th>
                <th className="px-3 py-2 text-left">Rekla</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Kommentar</th>
                <th className="px-3 py-2 text-left">Labels</th>
                <th className="px-3 py-2 text-left">BO</th>
              </tr>
              {/* Filterzeile */}
              <tr className="bg-white/70 dark:bg-gray-900/30">
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">
                  <div className="flex gap-1">
                    <input type="date" value={fDateFrom} onChange={e=>setFDateFrom(e.target.value)}
                      className="w-[9.5rem] px-2 py-1 rounded border text-xs" />
                    <input type="date" value={fDateTo} onChange={e=>setFDateTo(e.target.value)}
                      className="w-[9.5rem] px-2 py-1 rounded border text-xs" />
                  </div>
                </th>
                <th className="px-3 py-2">
                  <select value={fKanal} onChange={e=>setFKanal(e.target.value)}
                    className="w-[10rem] px-2 py-1 rounded border text-xs">
                    <option value="">Alle</option>
                    {allChannels.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </th>
                <th className="px-3 py-2">
                  <input value={fTemplate} onChange={e=>setFTemplate(e.target.value)}
                    placeholder="suchen…" className="w-[12rem] px-2 py-1 rounded border text-xs" />
                </th>
                <th className="px-3 py-2">
                  <input value={fScoreMin} onChange={e=>setFScoreMin(e.target.value)}
                    placeholder="min" inputMode="decimal"
                    className="w-[4.5rem] px-2 py-1 rounded border text-xs text-right" />
                </th>
                <th className="px-3 py-2">
                  <select value={fRekla} onChange={e=>setFRekla(e.target.value as any)}
                    className="w-[7.5rem] px-2 py-1 rounded border text-xs">
                    <option value="any">Alle</option>
                    <option value="rekla">Rekla</option>
                    <option value="none">Keine</option>
                  </select>
                </th>
                <th className="px-3 py-2">
                  <select value={fStatus} onChange={e=>setFStatus(e.target.value as any)}
                    className="w-[8rem] px-2 py-1 rounded border text-xs">
                    <option value="any">Alle</option>
                    <option value="offen">offen</option>
                    <option value="geklärt">geklärt</option>
                  </select>
                </th>
                <th className="px-3 py-2">
                  <input value={fComment} onChange={e=>setFComment(e.target.value)}
                    placeholder="suchen…" className="w-[14rem] px-2 py-1 rounded border text-xs" />
                </th>
                <th className="px-3 py-2">
                  <select value={String(fLabelId)} onChange={e=>setFLabelId(e.target.value===''?'':Number(e.target.value))}
                    className="w-[12rem] px-2 py-1 rounded border text-xs">
                    <option value="">Alle</option>
                    {allLabels.map(([id,name])=>(
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </th>
                <th className="px-3 py-2">
                  <button
                    onClick={()=>{
                      setFDateFrom(''); setFDateTo(''); setFKanal('');
                      setFTemplate(''); setFScoreMin(''); setFRekla('any');
                      setFStatus('any'); setFComment(''); setFLabelId('');
                    }}
                    className="px-2 py-1 rounded border text-xs"
                  >
                    Filter zurücksetzen
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(f=>{
                const s = avgScore(f);
                const bo = boLinkFor(f);
                const um = unreadMap[String(f.id)];
                const hasNewFromOwner = !!(um && um.last_by_owner && um.unread_total > 0);
                return (
                  <tr key={String(f.id)} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2">
                      {hasNewFromOwner && <span title="Neuer Kommentar vom Mitarbeiter"
                        className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500" />}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDateTimeBerlin(getTs(f))}</td>
                    <td className="px-3 py-2">
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
                        {f.feedbacktyp}
                      </span>
                    </td>
                    <td className="px-3 py-2">{f.template_name ?? '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${noteColor(s)}`}>{fmtAvg(s)}</td>
                    <td className="px-3 py-2">{isTrueish(f.rekla) ? 'Rekla' : '—'}</td>
                    <td className="px-3 py-2">{isTrueish(f.geklaert) ? 'geklärt' : 'offen'}</td>
                    <td className="px-3 py-2 max-w-[360px] truncate">{f.kommentar ?? '—'}</td>
                    <td className="px-3 py-2">
                      <LabelChips feedbackId={f.id} labels={f.labels ?? []} />
                    </td>
                    <td className="px-3 py-2">
                      {bo && (
                        <a
                          href={bo}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                          title="Im Backoffice suchen"
                        >
                          🔎 BO
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length===0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-sm text-gray-500">Keine Treffer</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* LISTENANSICHT (optional) */}
      {!loading && view === 'list' && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2 text-sm">
            <label>Gruppierung:</label>
            <select
              value={groupMode}
              onChange={e=>setGroupMode(e.target.value as any)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
            >
              <option value="month">Nach Monaten</option>
              <option value="rating_then_month">Nach Bewertung → Monate</option>
            </select>
          </div>
          {groups.length===0 ? (
            <div className="p-4 text-sm text-gray-500">Keine Feedbacks im Zeitraum/Filter.</div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {groups.map(g=>{
                const open = !!openGroups[g.key];
                return (
                  <li key={g.key}>
                    <button onClick={()=>toggleGroup(g.key)}
                      className="w-full px-3 py-3 flex items-center justify-between bg-white/70 dark:bg-white/5">
                      <div className="flex items-center gap-3">
                        <span className="text-base font-semibold">{g.label}</span>
                        <span className="text-xs text-gray-500">{g.items.length} Feedbacks</span>
                      </div>
                      <span className="text-gray-400">{open ? '▾' : '▸'}</span>
                    </button>
                    {open && (
                      <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                        {g.items.map(f=>{
                          const s = avgScore(f);
                          const bo = boLinkFor(f);
                          const um = unreadMap[String(f.id)];
                          const hasNewFromOwner = !!(um && um.last_by_owner && um.unread_total > 0);
                          return (
                            <li key={String(f.id)} className="p-3 flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                    {hasNewFromOwner && (
                                      <span title="Neuer Kommentar vom Mitarbeiter"
                                        className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500" />
                                    )}
                                    <span className="font-medium">{f.template_name ?? f.feedbacktyp}</span>
                                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                      {f.feedbacktyp}
                                    </span>
                                    {isTrueish(f.rekla) && (
                                      <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-300">
                                        Rekla
                                      </span>
                                    )}
                                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${isTrueish(f.geklaert)
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                                      {isTrueish(f.geklaert) ? 'geklärt' : 'offen'}
                                    </span>
                                  </div>
                                  <div className="shrink-0 flex items-center gap-2">
                                    {bo && (
                                      <a
                                        href={bo}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                                        title="Im Backoffice suchen"
                                      >
                                        🔎 Im BO suchen
                                      </a>
                                    )}
                                    <span className="text-[11px] px-2 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                                      {fmtDateTimeBerlin(getTs(f))}
                                    </span>
                                  </div>
                                </div>

                                {f.kommentar && (
                                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{f.kommentar}</p>
                                )}

                                {/* Labels */}
                                <LabelChips feedbackId={f.id} labels={f.labels ?? []} />

                                {/* Kommentare */}
                                <FeedbackComments feedbackId={f.id} />
                              </div>

                              {/* rechte Spalte: Ø */}
                              <div className="shrink-0 text-right pl-2">
                                <div className="text-xs text-gray-500">Ø</div>
                                <div className={`text-lg font-semibold ${noteColor(s)}`}>
                                  {fmtAvg(s)}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Small helpers/components ---------------- */
function FeedbackComments({ feedbackId }: { feedbackId: number|string }) {
  const [items, setItems] = useState<Array<{id:number; body:string; author:string; created_at:string}>>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    const r = await authedFetch(`/api/feedback/${feedbackId}/comments`, { cache: 'no-store' });
    const j = await r.json().catch(()=>null);
    setItems(Array.isArray(j?.items) ? j.items : []);
  }
  async function send() {
    if (!draft.trim()) return;
    setLoading(true);
    try {
      const r = await authedFetch(`/api/feedback/${feedbackId}/comments`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ body: draft.trim() }),
      });
      if (r.ok) { setDraft(''); await load(); }
    } finally { setLoading(false); }
  }
  useEffect(()=>{ load(); }, [feedbackId]);

  return (
    <div className="mt-3">
      <div className="text-xs font-medium mb-1">Kommentare</div>
      <ul className="space-y-1 text-sm">
        {items.map(it=>(
          <li key={it.id}>
            <span className="font-medium">{it.author}</span>
            <span className="text-gray-500"> · {new Date(it.created_at).toLocaleString('de-DE')}</span>
            <p className="whitespace-pre-wrap">{it.body}</p>
          </li>
        ))}
        {items.length===0 && <li className="text-xs text-gray-500">Noch keine Kommentare.</li>}
      </ul>
      <div className="mt-2 flex gap-2">
        <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Kommentieren…"
               className="flex-1 px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10" />
        <button onClick={send} disabled={loading||!draft.trim()} className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-60">
          Senden
        </button>
      </div>
    </div>
  );
}

function LabelChips({ feedbackId, labels }: {
  feedbackId: number|string;
  labels: Array<{id:number; name:string; color?:string}>;
}) {
  const [all, setAll] = useState<Array<{id:number; name:string; color?:string}>>([]);
  const [attached, setAttached] = useState<number[]>(labels.map(l=>l.id));

  useEffect(()=>{(async()=>{
    const r = await authedFetch(`/api/teamhub/labels`, { cache: 'no-store' });
    const j = await r.json().catch(()=>null);
    setAll(Array.isArray(j?.items) ? j.items : []);
  })();},[]);

  async function add(labelId:number){
    const r = await authedFetch(`/api/feedback/${feedbackId}/labels`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ label_id: labelId })
    });
    if (r.ok) setAttached(prev => [...new Set([...prev, labelId])]);
  }
  async function remove(labelId:number){
    const r = await authedFetch(`/api/feedback/${feedbackId}/labels/${labelId}`, { method:'DELETE' });
    if (r.ok) setAttached(prev => prev.filter(id=>id!==labelId));
  }

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      {all.filter(l=>attached.includes(l.id)).map(l=>(
        <button key={l.id} onClick={()=>remove(l.id)}
          className="text-[11px] px-2 py-1 rounded-full border"
          style={{ borderColor: l.color||'#ddd', background: '#fff' }}>
          {l.name} ×
        </button>
      ))}
      <details className="relative">
        <summary className="text-[11px] px-2 py-1 rounded-full bg-gray-100 cursor-pointer">Label hinzufügen</summary>
        <div className="absolute z-10 mt-2 p-2 rounded-lg border bg-white shadow">
          <ul className="min-w-[180px]">
            {all.filter(l=>!attached.includes(l.id)).map(l=>(
              <li key={l.id}>
                <button onClick={()=>add(l.id)} className="w-full text-left px-2 py-1 hover:bg-gray-50">
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: l.color||'#999' }} />
                  {l.name}
                </button>
              </li>
            ))}
            {all.length===0 && <li className="px-2 py-1 text-sm text-gray-500">Keine Labels</li>}
          </ul>
        </div>
      </details>
    </div>
  );
}

/* ---------------- Label-Manager (Modal) ---------------- */
function LabelManagerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={()=>setOpen(true)}
        className="px-2 py-1.5 rounded-lg border bg-white dark:bg-white/10 text-sm">
        Labels verwalten
      </button>
      {open && <LabelManager onClose={()=>setOpen(false)} />}
    </>
  );
}

function LabelManager({ onClose }:{ onClose: ()=>void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#22c55e');
  const [teamId, setTeamId] = useState<string>('');
  const [teamName, setTeamName] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Team automatisch setzen (Teamleiter-Teams). Auswahl ausgeblendet.
  useEffect(()=>{(async()=>{
    const r = await authedFetch('/api/teamhub/my-teams', { cache:'no-store' });
    const j = await r.json().catch(()=>null);
    const arr: Array<{team_id:string; name:string}> = Array.isArray(j?.items) ? j.items : [];
    if (arr.length >= 1) {
      setTeamId(arr[0].team_id);
      setTeamName(arr[0].name);
    } else {
      setTeamId('');
      setTeamName('');
    }
  })();},[]);

  async function save(){
    if (!name.trim() || !teamId) return;
    setSaving(true);
    try {
      const r = await authedFetch('/api/teamhub/labels', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name: name.trim(), color, team_id: teamId })
      });
      if (r.ok) onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Labels verwalten</div>
          <button onClick={onClose} className="text-sm opacity-70 hover:opacity-100">Schließen</button>
        </div>
        <div className="space-y-2">
          <div className="text-xs text-gray-500">
            Team: <span className="inline-flex items-center gap-2 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{teamName || '—'}</span>
          </div>
          <label className="block text-sm">
            <span className="block mb-1">Name</span>
            <input value={name} onChange={e=>setName(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="block mb-1">Farbe</span>
            <input type="color" value={color} onChange={e=>setColor(e.target.value)}
              className="h-9 w-12 p-0 border rounded" />
          </label>
        </div>
        <div className="pt-2 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg border">Abbrechen</button>
          <button onClick={save} disabled={saving||!name.trim()||!teamId}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-60">Speichern</button>
        </div>
        {!teamId && (
          <div className="text-xs text-red-600">Kein Team gefunden, für das du Teamleiter bist.</div>
        )}
      </div>
    </div>
  );
}
