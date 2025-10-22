/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/fetchWithSupabase';
import QAWidget from './QAWidget';
import TeamRosterList from '@/app/components/TeamRosterList';

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

type ThreadListItem = {
  thread_id: string|number;
  feedback_id: string|number;
  subject: string;
  last_author: string;
  last_body: string;
  last_at: string; // ISO
  unread_total: number; // for current viewer
  last_by_owner?: boolean; // whether last msg is by owner
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

// Ø aus 4 Feldern
const avgScore = (f: FeedbackItem) => {
  const vals = [f.bewertung, f.beraterfreundlichkeit, f.beraterqualifikation, f.angebotsattraktivitaet]
    .filter((x): x is number => Number.isFinite(x as number) && (x as number) >= 1 && (x as number) <= 5);
  if (vals.length === 0) return null;
  return vals.reduce((s, n) => s + n, 0) / vals.length;
};

const fmtAvg = (n: number | null) => Number.isFinite(n as any) ? (n as number).toFixed(2) : '–';
const noteColor = (v: number | null | undefined) =>
  !Number.isFinite(v as any) ? 'text-gray-500'
  : (v as number) >= 4.75 ? 'text-emerald-600'
  : (v as number) >= 4.5  ? 'text-green-600'
  : (v as number) >= 4.0  ? 'text-amber-600'
  : 'text-red-600';

const fmtMonthYearDE = (y: number, m1to12: number) => {
  const d = new Date(Date.UTC(y, m1to12 - 1, 1));
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(d);
};

/* --------------- Marks ------------------ */
type MarkValue = -1 | 0 | 1 | 2;
type MarkMap = Record<string, MarkValue>;

type CommentRow = {
  id: number|string;
  body: string;
  created_at: string;
  author: string;
};

function FirstTeamRosterCard(){
  const [teamId, setTeamId] = useState<number|null>(null);
  useEffect(() => { (async () => {
    const r = await authedFetch('/api/teamhub/my-teams', { cache:'no-store' });
    const j = await r.json().catch(()=>null);
    const first = Array.isArray(j?.items) && j.items[0]?.team_id ? Number(j.items[0].team_id) : null;
    setTeamId(Number.isFinite(first) ? first : null);
  })(); }, []);
  if (!teamId) return null;
  return <TeamRosterList teamId={teamId} />;
}

/* --------------- Page ------------------ */
export default function TeamHubPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [userId, setUserId]   = useState<string>('');
  const [from, setFrom]       = useState<string>('');
  const [to, setTo]           = useState<string>('');
  const [items, setItems]     = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Unread-Map (für „Neu vom Mitarbeiter“-Marker)
  const [unreadMap, setUnreadMap] = useState<Record<string, { last_by_owner:boolean; unread_total:number; last_comment_at:string }>>({});

  // ---- Filter-States ----
  const [fDateFrom, setFDateFrom] = useState<string>('');
  const [fDateTo, setFDateTo]     = useState<string>('');
  const [fKanal, setFKanal]       = useState<string>('');
  const [fTemplate, setFTemplate] = useState<string>('');
  const [fScoreMin, setFScoreMin] = useState<string>('');
  const [fRekla, setFRekla]       = useState<'any'|'rekla'|'none'>('any');
  const [fStatus, setFStatus]     = useState<'any'|'offen'|'geklärt'>('any');
  const [fComment, setFComment]   = useState<string>('');
  const [fLabelId, setFLabelId]   = useState<number|''>('');
  const [marks, setMarks] = useState<MarkMap>({});
  const [showOnlyMarked, setShowOnlyMarked] = useState(false);

  const [sort, setSort] = useState<'newest'|'score_desc'>('newest');

  // Labels global
  const [allLabelsGlobal, setAllLabelsGlobal] = useState<Array<{id:number; name:string; color?:string}>>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [labelsError, setLabelsError] = useState<string|null>(null);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Kanal-Konfiguration
  const [channelConfig, setChannelConfig] = useState<Record<string, {label:string; target:number}>>({});
  const [openChannelModal, setOpenChannelModal] = useState(false);
  const [channelsForModal, setChannelsForModal] = useState<string[]>([]);

  // 🔔 Sichtbarkeit des Thread-Hubs steuern (nur zeigen, wenn nötig)
  const [showThreadHub, setShowThreadHub] = useState(false);

  // Marks laden
  useEffect(() => {
    (async () => {
      if (!userId) { setMarks({}); return; }
      const r = await authedFetch(`/api/teamhub/marks?owner_id=${encodeURIComponent(userId)}`, { cache: 'no-store' });
      const j = await r.json().catch(()=>null);
      const map: MarkMap = {};
      for (const row of (j?.items||[])) map[String(row.feedback_id)] = (row.mark ?? 0) as MarkValue;
      setMarks(map);
    })();
  }, [userId]);

  async function setMark(feedbackId: number|string, next: MarkValue) {
    const k = String(feedbackId);
    const prev = marks[k] ?? 0;
    const normalized: MarkValue = (prev === next) ? 0 : next;
    setMarks(m => ({ ...m, [k]: normalized }));
    const r = await authedFetch('/api/teamhub/marks', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ feedback_id: feedbackId, mark: normalized, owner_id: userId }),
    });
    if (!r.ok) setMarks(m => ({ ...m, [k]: prev })); // rollback
  }

  // Labels
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLabelsLoading(true);
      setLabelsError(null);
      try {
        const r = await authedFetch('/api/teamhub/labels', { cache: 'no-store', signal: ac.signal as any });
        const j = await r.json().catch(() => null);
        setAllLabelsGlobal(Array.isArray(j?.items) ? j.items : []);
      } catch (err:any) {
        console.error('labels fetch failed', err);
        setLabelsError('Konnte Labels nicht laden.');
        setAllLabelsGlobal([]);
      } finally {
        setLabelsLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  // Members
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

  // Unread-Map
  useEffect(()=>{(async()=>{
    if (!userId) { setUnreadMap({}); return; }
    const r = await authedFetch(`/api/teamhub/unread-map?owner_id=${encodeURIComponent(userId)}`, { cache:'no-store' });
    const j = await r.json().catch(()=>null);
    if (j?.ok) setUnreadMap(j.map || {});
  })()}, [userId]);

  const curName = useMemo(() => members.find(m => m.user_id === userId)?.name ?? '—', [members, userId]);

  // ungelesene Mitarbeiter-Kommentare zählen
  const unreadOwnerCount = useMemo(()=>{
    let n = 0;
    for (const k in unreadMap) {
      const v = unreadMap[k];
      if (v?.last_by_owner && (v?.unread_total ?? 0) > 0) n++;
    }
    return n;
  }, [unreadMap]);

  // Wenn es neue Kommentare gibt → ThreadHub automatisch anzeigen
  useEffect(() => {
    setShowThreadHub(prev => (unreadOwnerCount > 0 ? true : prev));
  }, [unreadOwnerCount]);

  // Dropdown-Werte
  const allChannels = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.feedbacktyp) s.add(it.feedbacktyp);
    return [...s].sort();
  }, [items]);

  // Kanal-Konfig
  useEffect(() => {
    (async () => {
      if (!userId) {
        setChannelConfig({});
        setChannelsForModal([]);
        return;
      }
      const r = await authedFetch(
        `/api/teamhub/channel-config?owner_id=${encodeURIComponent(userId)}`,
        { cache: 'no-store' }
      );
      const j = await r.json().catch(() => null);
      const fromApi: Record<string, {label:string; target:number}> = (j?.ok && j.config) ? j.config : {};

      const union = new Set<string>([...allChannels, ...Object.keys(fromApi)]);
      const unionArr = [...union].sort();
      setChannelsForModal(unionArr);

      const merged: Record<string, {label:string; target:number}> = {};
      for (const ch of unionArr) {
        const cur = fromApi[ch];
        merged[ch] = {
          label: (cur?.label ?? ch),
          target: Number.isFinite(cur?.target as number) ? (cur!.target as number) : 4.5,
        };
      }
      setChannelConfig(merged);
    })();
  }, [userId, allChannels.join(',')]);

  const labelFilterOptions = useMemo<[number,string][]>(()=>
    allLabelsGlobal.map(l => [l.id, l.name] as [number,string]).sort((a,b)=>a[1].localeCompare(b[1]))
  , [allLabelsGlobal]);

  // ---- FILTERN ----
  const filtered = useMemo(()=>{
    return items.filter(f=>{
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
      if (fKanal && f.feedbacktyp !== fKanal) return false;
      if (fTemplate && !(f.template_name||'').toLowerCase().includes(fTemplate.toLowerCase())) return false;
      if (fScoreMin) {
        const s = avgScore(f) ?? 0;
        if (s < Number(fScoreMin)) return false;
      }
      if (fRekla === 'rekla' && !isTrueish(f.rekla)) return false;
      if (fRekla === 'none' && isTrueish(f.rekla)) return false;
      const isGekl = isTrueish(f.geklaert);
      if (fStatus === 'offen' && isGekl) return false;
      if (fStatus === 'geklärt' && !isGekl) return false;
      if (showOnlyMarked && !(marks[String(f.id)] && marks[String(f.id)] !== 0)) return false;
      if (fComment && !(f.kommentar||'').toLowerCase().includes(fComment.toLowerCase())) return false;
      if (fLabelId !== '') {
        const ids = new Set((f.labels||[]).map(l=>l.id));
        if (!ids.has(Number(fLabelId))) return false;
      }
      return true;
    });
  }, [items, fDateFrom, fDateTo, fKanal, fTemplate, fScoreMin, fRekla, fStatus, fComment, fLabelId, showOnlyMarked, marks]);

  // ---- SORTIEREN ----
  const sortedItems = useMemo(()=>{
    const arr = [...filtered];
    if (sort==='score_desc') {
      return arr.sort((a,b)=> (avgScore(b)??0) - (avgScore(a)??0));
    }
    return arr.sort((a,b)=>{
      const ta = getTs(a) ? new Date(getTs(a) as string).getTime() : 0;
      const tb = getTs(b) ? new Date(getTs(b) as string).getTime() : 0;
      return tb - ta;
    });
  }, [filtered, sort]);

  // ---- MONATS-GRUPPEN ----
  type Group = { key: string; label: string; items: FeedbackItem[]; hasNewOwner:boolean };
  const groups: Group[] = useMemo(() => {
    const map = new Map<string, FeedbackItem[]>();
    for (const f of sortedItems) {
      const iso = getTs(f);
      if (!iso) continue;
      const d = new Date(iso);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
      const list = map.get(key) ?? [];
      list.push(f); map.set(key, list);
    }
    return [...map.entries()]
      .sort((a,b)=> a[0] < b[0] ? 1 : -1)
      .map(([k, list])=>{
        const [yStr,mStr] = k.split('-');
        const y = Number(yStr), m = Number(mStr);
        const hasNewOwner = list.some(f=>{
          const um = unreadMap[String(f.id)];
          return !!(um && um.last_by_owner && um.unread_total > 0);
        });
        return { key:k, label: fmtMonthYearDE(y, m), items: list, hasNewOwner };
      });
  }, [sortedItems, unreadMap]);

  // ---- KPI-Übersicht ----
  const kpis = useMemo(()=>{
    const arr = sortedItems;
    const n = arr.length;
    const scores = arr.map(avgScore).filter((x): x is number => Number.isFinite(x as any));
    const avg = scores.length ? (scores.reduce((s,n)=>s+n,0)/scores.length) : null;
    const neg = scores.filter(s=>s<=3.0).length;
    const negPct = scores.length ? Math.round(100*neg/scores.length) : 0;
    const rekla = arr.filter(f=>isTrueish(f.rekla)).length;
    const offen = arr.filter(f=>!isTrueish(f.geklaert)).length;
    const geloest = n - offen;
    return { n, avg, neg, rekla, offen, geloest, negPct };
  }, [sortedItems]);

  // Ø je Kanal
  const channelAvgs = useMemo(() => {
    const acc = new Map<string, { sum: number; count: number }>();
    for (const f of sortedItems) {
      const ch = f.feedbacktyp || '—';
      const s = avgScore(f);
      if (s == null) continue;
      const cur = acc.get(ch) || { sum: 0, count: 0 };
      cur.sum += s; cur.count += 1;
      acc.set(ch, cur);
    }
    return [...acc.entries()]
      .map(([channel, { sum, count }]) => ({ channel, avg: sum / count, count }))
      .sort((a, b) => b.avg - a.avg || a.channel.localeCompare(b.channel));
  }, [sortedItems]);

  // Gruppen öffnen/schließen
  const setAllGroups = (open:boolean) => {
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.key] = open;
    setOpenGroups(next);
  };
  useEffect(()=>{
    const initial: Record<string, boolean> = {};
    for (const g of groups) initial[g.key] = false;
    setOpenGroups(prev => Object.keys(prev).length ? prev : initial);
  }, [groups.map(g=>g.key).join(',')]);

  // Header-Styles
  const field =
    "h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 " +
    "bg-white dark:bg-white/10 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
  const btn =
    "h-9 inline-flex items-center justify-center px-3 rounded-lg border text-sm font-medium " +
    "bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 " +
    "border-gray-200 dark:border-gray-700 whitespace-nowrap";

  // Scroll zu Feedback
  function scrollToFeedback(feedbackId:number|string){
    const item = items.find(i => String(i.id) === String(feedbackId));
    if (!item) return;
    const iso = getTs(item);
    if (!iso) return;
    const d = new Date(iso);
    const gKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
    setOpenGroups(prev => ({ ...prev, [gKey]: true }));
    requestAnimationFrame(()=>{
      const el = document.getElementById(`feedback-${feedbackId}`);
      if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
      if (el) {
        el.classList.add('ring-2','ring-rose-400','ring-offset-2');
        setTimeout(()=> el.classList.remove('ring-2','ring-rose-400','ring-offset-2'), 1200);
      }
    });
  }

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 py-6">
      {/* Header */}
      <header className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {/* Links */}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">Teamhub</h1>
              <Link href="/" className="text-sm text-blue-600 hover:underline">Zurück</Link>
            </div>
            <div className="mt-2">
              <select
                value={userId}
                onChange={e => setUserId(e.target.value)}
                className={`${field} pr-8 appearance-none`}
                aria-label="Mitarbeiter"
              >
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className={`${field} appearance-none`}
                aria-label="Zeitraum von"
              />
              <span className="text-gray-400 select-none">–</span>
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className={`${field} appearance-none`}
                aria-label="Zeitraum bis"
              />
            </div>
          </div>

          {/* Rechts */}
          <div className="flex items-start md:justify-end gap-2">
            <button
              onClick={() => setOpenChannelModal(true)}
              className={btn}
              title="Kanäle & Ziele bearbeiten"
              type="button"
            >
              Kanäle & Ziele
            </button>
            <div className="[&>button]:h-9 [&>button]:px-3 [&>button]:rounded-lg [&>button]:text-sm [&>button]:border [&>button]:border-gray-200 dark:[&>button]:border-gray-700">
              <LabelManagerButton />
            </div>
          </div>
        </div>
      </header>

      {/* Hinweis zu neuen Mitarbeiter-Kommentaren */}
      {unreadOwnerCount > 0 && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-900 text-sm px-3 py-2">
          {unreadOwnerCount} neue Kommentar{unreadOwnerCount>1?'e':''} vom Mitarbeiter (ungelesen).
        </div>
      )}

      <div className="text-sm text-gray-600 dark:text-gray-300 mb-4 flex items-center gap-3">
        <span>Mitarbeiter: <b>{curName}</b></span>
        {/* Fallback-Link: nur anzeigen, wenn es keine neuen gibt */}
        {unreadOwnerCount === 0 && (
          <button
            onClick={()=>setShowThreadHub(true)}
            className="text-xs px-2 py-1 rounded-lg border hover:bg-gray-50"
            title="Kommentar-Threads anzeigen"
          >
            Kommentar-Threads anzeigen
          </button>
        )}
        {labelsLoading && <span className="ml-2 text-xs text-gray-500">Labels laden…</span>}
        {labelsError && <span className="ml-2 text-xs text-red-600">{labelsError}</span>}
      </div>

      {/* Hauptlayout */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Linke Hauptspalte */}
        <div className="lg:col-span-2 space-y-4">
          {/* KPI */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 md:p-4 lg:sticky lg:top-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Kpi title="Ø-Score" value={fmtAvg(kpis.avg)} tone={kpis.avg!=null?noteColor(kpis.avg):'text-gray-500'} />
              <Kpi title="Feedbacks" value={String(kpis.n)} />
              <Kpi title="Negativ ≤3,0" value={`${kpis.neg} (${kpis.negPct}%)`} />
              <Kpi title="Rekla" value={String(kpis.rekla)} />
              <Kpi title="offen" value={String(kpis.offen)} />
              <Kpi title="geklärt" value={String(kpis.geloest)} />
            </div>
          </div>

          {/* Ø je Kanal */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 md:p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">Ø je Kanal</div>
              <div className="text-xs text-gray-500">Ziele pro Kanal konfigurierbar</div>
            </div>

            {channelAvgs.length === 0 ? (
              <div className="text-sm text-gray-500">Keine Scores im aktuellen Filter.</div>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {channelAvgs.map(({ channel, avg, count }) => {
                  const cfg = channelConfig[channel] ?? { label: channel, target: 4.5 };
                  const delta = avg - cfg.target;
                  const deltaTxt = `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`;
                  return (
                    <li key={channel} className="rounded-xl border border-gray-200 dark:border-gray-800 p-2 flex items-center gap-2">
                      <MiniRadial value={avg} target={cfg.target} size={56} stroke={6} label={`Ø ${fmtAvg(avg)}`} sublabel={deltaTxt} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" title={cfg.label}>{cfg.label}</div>
                        <div className="text-[11px] text-gray-500">Ziel {cfg.target.toFixed(2)} · ({count})</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* INBOX-LAYOUT */}
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            {/* Filter-Toggle */}
            <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <button
                onClick={()=>setShowFilters(v=>!v)}
                className="text-xs px-2 py-1.5 rounded-lg border"
                aria-expanded={showFilters}
                aria-controls="filters"
              >
                {showFilters ? 'Filter verbergen' : 'Filter anzeigen'}
              </button>
              <div className="ml-auto text-xs text-gray-500">
                {loading ? 'Lade…' : `${sortedItems.length} Treffer`}
              </div>
            </div>

            {/* Filterleiste */}
            {showFilters && (
              <div id="filters" className="p-3 flex flex-wrap md:flex-nowrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 text-sm">
                <div className="flex items-center gap-2">
                  <input type="date" value={fDateFrom} onChange={e=>setFDateFrom(e.target.value)}
                         className="w-40 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10" aria-label="Von"/>
                  <span className="text-gray-400">–</span>
                  <input type="date" value={fDateTo} onChange={e=>setFDateTo(e.target.value)}
                         className="w-40 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10" aria-label="Bis"/>
                </div>

                <select value={fKanal} onChange={e=>setFKanal(e.target.value)}
                        className="w-48 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10" aria-label="Kanal">
                  <option value="">Alle Kanäle</option>
                  {Object.keys(channelConfig).sort().map(c => {
                    const cfg = channelConfig[c] ?? { label: c, target: 4.5 };
                    return <option key={c} value={c}>{cfg.label}</option>;
                  })}
                </select>
                <select value={fStatus} onChange={e=>setFStatus(e.target.value as any)}
                        className="w-36 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10" aria-label="Status">
                  <option value="any">Status: Alle</option>
                  <option value="offen">offen</option>
                  <option value="geklärt">geklärt</option>
                </select>

                <select value={String(fLabelId)} onChange={e=>setFLabelId(e.target.value===''?'':Number(e.target.value))}
                        className="w-56 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10" aria-label="Label">
                  <option value="">Alle Labels</option>
                  {labelFilterOptions.map(([id,name])=> (<option key={id} value={id}>{name}</option>))}
                </select>

                <div className="flex items-center gap-2 ml-auto">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={showOnlyMarked} onChange={e=>setShowOnlyMarked(e.target.checked)} />
                    nur Markierte
                  </label>
                  <SortSwitcher sort={sort} setSort={setSort} />
                  <button onClick={()=>{
                      setFDateFrom(''); setFDateTo(''); setFKanal('');
                      setFTemplate(''); setFScoreMin(''); setFRekla('any');
                      setFStatus('any'); setFComment(''); setFLabelId(''); setShowOnlyMarked(false);
                    }} className="px-2 py-1.5 rounded-lg border text-xs">
                    Filter zurücksetzen
                  </button>
                  <button onClick={()=>setAllGroups(true)} className="px-2 py-1.5 rounded-lg border text-xs">Alle öffnen</button>
                  <button onClick={()=>setAllGroups(false)} className="px-2 py-1.5 rounded-lg border text-xs">Alle schließen</button>
                </div>
              </div>
            )}

            {/* Ergebnisliste */}
            {loading ? (
              <div className="p-6 text-sm text-gray-500">Lade…</div>
            ) : groups.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">Keine Treffer</div>
            ) : (
              <div>
                {groups.map(g => {
                  const open = !!openGroups[g.key];
                  return (
                    <div key={g.key} className="border-b last:border-b-0 border-gray-100 dark:border-gray-800">
                      <button
                        onClick={()=>setOpenGroups(p=>({ ...p, [g.key]: !p[g.key] }))}
                        className="w-full px-3 py-2 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur text-sm font-semibold border-b border-gray-100 dark:border-gray-800 capitalize flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          {g.hasNewOwner && !open && <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500" title="Neue Mitarbeiter-Kommentare" />}
                          <span>{g.label}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{g.items.length} Feedbacks</span>
                          <span className="text-gray-400">{open ? '▾' : '▸'}</span>
                        </div>
                      </button>

                      {open && (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                          {g.items.map(f=>{
                            const s  = avgScore(f);
                            const bo = boLinkFor(f);
                            const um = unreadMap[String(f.id)];
                            const hasNewFromOwner = !!(um && um.last_by_owner && um.unread_total > 0);
                            const myMark = marks[String(f.id)] ?? 0;
                            const chCfg = channelConfig[f.feedbacktyp] ?? { label: f.feedbacktyp, target: 4.5 };

                            return (
                              <li id={`feedback-${f.id}`} key={String(f.id)} className="p-3 md:p-4 hover:bg-gray-50/60 dark:hover:bg-white/5 transition-colors">
                                <div className="flex items-start gap-3">
                                  <div className="pt-2">
                                    {hasNewFromOwner && <span title="Neuer Kommentar vom Mitarbeiter" className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500" />}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                        <span className="font-medium truncate max-w-[40ch]">{f.template_name ?? chCfg.label}</span>
                                        <Chip subtle>{chCfg.label}</Chip>
                                        {isTrueish(f.rekla) && (<Chip tone="amber">Rekla</Chip>)}
                                        <Chip tone={isTrueish(f.geklaert) ? 'emerald' : 'slate'}>
                                          {isTrueish(f.geklaert) ? 'geklärt' : 'offen'}
                                        </Chip>
                                      </div>

                                      <div className="shrink-0 flex items-center gap-2">
                                        <div className="inline-flex items-center gap-1 mr-1">
                                          <MarkBtn active={myMark===-1} title="Daumen runter" onClick={()=>setMark(f.id, -1)}>👎</MarkBtn>
                                          <MarkBtn active={myMark===1}  title="Merken (Stern)" onClick={()=>setMark(f.id, 1)}>⭐</MarkBtn>
                                          <MarkBtn active={myMark===2}  title="Daumen hoch"   onClick={()=>setMark(f.id, 2)}>👍</MarkBtn>
                                        </div>

                                        {bo && (
                                          <a href={bo} target="_blank" rel="noreferrer"
                                             className="inline-flex items-center gap-1 text:[11px] px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                                             title="Im Backoffice suchen">🔎 BO</a>
                                        )}
                                        <span className="text-[11px] px-2 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                                          {fmtDateTimeBerlin(getTs(f))}
                                        </span>
                                        <span className={`ml-2 text-xs px-2 py-1 rounded-full border ${noteColor(s)}`}>
                                          Ø {fmtAvg(s)}
                                        </span>
                                      </div>
                                    </div>

                                    {f.kommentar && (
                                      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{f.kommentar}</p>
                                    )}

                                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                                      <LabelChips feedbackId={f.id} labels={f.labels ?? []} allLabels={allLabelsGlobal} />
                                      <FeedbackComments feedbackId={f.id} />
                                    </div>

                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* QA */}
          <QAWidget ownerId={userId} from={from} to={to} />
        </div>

        {/* Rechte Spalte: Dienstplan → Threads (Threads nur bei Bedarf laden/anzeigen) */}
        <aside className="space-y-4 sticky top-4">
          <FirstTeamRosterCard />
          {(unreadOwnerCount > 0 || showThreadHub) && (
            <CommentThreadHub
              ownerId={userId}
              onJumpToFeedback={scrollToFeedback}
              enabled={true}
              initialOnlyUnread={unreadOwnerCount > 0}
            />
          )}
        </aside>
      </section>

      {/* Modal: Kanal-Einstellungen */}
      {openChannelModal && (
        <ChannelSettingsModal
          channels={channelsForModal}
          cfg={channelConfig}
          onClose={()=>setOpenChannelModal(false)}
          onSave={async (next) => {
            const upserts = Object.entries(next).map(([channel, v]) => ({
              channel, label: v.label, target: v.target
            }));
            const r = await authedFetch('/api/teamhub/channel-config', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ owner_id: userId, upserts })
            });
            if (r.ok) {
              setChannelConfig(next);
              setOpenChannelModal(false);
            } else {
              const msg = await r.text();
              alert('Speichern fehlgeschlagen: ' + msg);
            }
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Kommentar-Thread Hub ---------------- */
function CommentThreadHub({
  ownerId,
  onJumpToFeedback,
  enabled = true,                 // ⟵ lädt nur wenn true
  initialOnlyUnread = true,       // ⟵ startet mit „nur Ungelesene“
}: {
  ownerId: string;
  onJumpToFeedback: (feedbackId: number | string) => void;
  enabled?: boolean;
  initialOnlyUnread?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ThreadListItem[]>([]);
  const [onlyUnread, setOnlyUnread] = useState<boolean>(initialOnlyUnread);
  const [q, setQ] = useState('');

  function normalize(rows: any[]): ThreadListItem[] {
    return (rows || []).map((r: any, i: number) => ({
      thread_id: r.feedback_id ?? i,
      feedback_id: r.feedback_id ?? i,
      subject: [r.member_name, r.channel].filter(Boolean).join(' · ') || '—',
      last_author: r.member_name || '—',
      last_body: r.last_comment_snippet || '',
      last_at: r.last_comment_at || new Date(0).toISOString(),
      unread_total: Number(r.unread ?? 0),
      last_by_owner: undefined,
    }));
  }

  useEffect(() => {
    if (!enabled || !ownerId) { setItems([]); return; }  // 🚫 kein Laden wenn ausgeblendet
    (async () => {
      setLoading(true);
      try {
        const r = await authedFetch(
          `/api/teamhub/threads?owner_id=${encodeURIComponent(ownerId)}&mode=threads&limit=50&only_unread=${onlyUnread ? 'true' : 'false'}`,
          { cache: 'no-store' }
        );
        const j = await r.json().catch(() => null);
        const arr = Array.isArray(j?.items) ? normalize(j.items) : [];
        arr.sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());
        setItems(arr);
      } finally {
        setLoading(false);
      }
    })();
  }, [ownerId, onlyUnread, enabled]);

  const filtered = useMemo(() => {
    let arr = items;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      arr = arr.filter(
        (t) =>
          (t.subject || '').toLowerCase().includes(s) ||
          (t.last_body || '').toLowerCase().includes(s) ||
          (t.last_author || '').toLowerCase().includes(s)
      );
    }
    return arr;
  }, [items, q]);

  if (!enabled) return null;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <div className="font-semibold text-sm">Kommentar-Threads</div>
        <span className="ml-auto text-xs text-gray-500">
          {loading ? 'lädt…' : `${filtered.length}/${items.length}`}
        </span>
      </div>

      <div className="p-3 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suchen…"
          className="flex-1 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
        />
        <label className="text-xs inline-flex items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
          />
          nur Ungelesene
        </label>
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[520px] overflow-auto">
        {filtered.length === 0 && !loading && (
          <li className="p-3 text-sm text-gray-500">Keine Threads</li>
        )}
        {filtered.map((t) => (
          <li key={String(t.thread_id)} className="p-3 hover:bg-gray-50 dark:hover:bg-white/5 transition">
            <button className="w-full text-left" onClick={() => onJumpToFeedback(t.feedback_id)}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.subject}</div>
                  <div className="text-[12px] text-gray-500 truncate">
                    <span className="font-medium">{t.last_author}</span>
                    <span> · {fmtDateTimeBerlin(t.last_at)}</span>
                  </div>
                </div>
                {t.unread_total > 0 && (
                  <span className="shrink-0 inline-flex items-center justify-center text-[11px] min-w-6 h-6 px-2 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                    {t.unread_total}
                  </span>
                )}
              </div>
              {t.last_body && (
                <p className="mt-1 text-[13px] text-gray-700 dark:text-gray-300 line-clamp-2 whitespace-pre-wrap">
                  {t.last_body}
                </p>
              )}
            </button>
          </li>
        ))}
        {loading && <li className="p-3 text-sm text-gray-500">lädt…</li>}
      </ul>
    </div>
  );
}

/* ---------------- Label-Chips ---------------- */
function LabelChips({
  feedbackId,
  labels,
  allLabels,
}: {
  feedbackId: number|string;
  labels: Array<{id:number; name:string; color?:string}>;
  allLabels: Array<{id:number; name:string; color?:string}>;
}) {
  const [attached, setAttached] = useState<number[]>(labels.map(l=>l.id));
  const detailsRef = useRef<HTMLDetailsElement|null>(null);

  useEffect(()=>{ setAttached(labels.map(l=>l.id)); }, [labels.map(l=>l.id).join(',')]);

  async function add(labelId:number){
    const r = await authedFetch(`/api/feedback/${feedbackId}/labels`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ label_id: labelId })
    });
    if (r.ok) {
      setAttached(prev => [...new Set([...prev, labelId])]);
      if (detailsRef.current) detailsRef.current.open = false;
    }
  }
  async function remove(labelId:number){
    const r = await authedFetch(`/api/feedback/${feedbackId}/labels/${labelId}`, { method:'DELETE' });
    if (r.ok) setAttached(prev => prev.filter(id=>id!==labelId));
  }

  const attachedSet = new Set(attached);

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      {allLabels.filter(l=>attachedSet.has(l.id)).map(l=>(
        <button key={l.id} onClick={()=>remove(l.id)}
          className="text-[11px] px-2 py-1 rounded-full border"
          style={{ borderColor: l.color||'#ddd', background: '#fff' }}>
          {l.name} ×
        </button>
      ))}
      <details ref={detailsRef} className="relative">
        <summary className="text-[11px] px-2 py-1 rounded-full bg-gray-100 cursor-pointer select-none">Label hinzufügen</summary>
        <div className="absolute z-10 mt-2 p-2 rounded-lg border bg-white shadow">
          <ul className="min-w-[180px] max-h-60 overflow-auto">
            {allLabels.filter(l=>!attachedSet.has(l.id)).map(l=>(
              <li key={l.id}>
                <button onClick={()=>add(l.id)} className="w-full text-left px-2 py-1 hover:bg-gray-50">
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: l.color||'#999' }} />
                  {l.name}
                </button>
              </li>
            ))}
            {allLabels.length===0 && <li className="px-2 py-1 text-sm text-gray-500">Keine Labels</li>}
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

/* ---------------- Kanal-Settings (Modal) ---------------- */
function ChannelSettingsModal({
  channels,
  cfg,
  onClose,
  onSave,
}: {
  channels: string[];
  cfg: Record<string, { label: string; target: number }>;
  onClose: () => void;
  onSave: (next: Record<string, { label: string; target: number }>) => void;
}) {
  const [local, setLocal] = useState<Record<string, { label: string; target: number }>>({});
  const [saving, setSaving] = useState(false);

  // cfg → local kopieren, wenn sich cfg ändert
  useEffect(() => {
    setLocal(cfg || {});
  }, [JSON.stringify(cfg)]); // bewusst JSON, damit deep-compare „gut genug“ ist

  const setLabel = (ch: string, label: string) =>
    setLocal((prev) => ({
      ...prev,
      [ch]: { ...(prev[ch] || { label: ch, target: 4.5 }), label },
    }));

  const setTarget = (ch: string, raw: string) => {
    // Komma zulassen; clamp 1.00..5.00; leer => ignorieren
    const v = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(v)) return;
    const safe = Math.max(0, Math.min(5, v));
    setLocal((prev) => ({
      ...prev,
      [ch]: { ...(prev[ch] || { label: ch, target: 4.5 }), target: Number(safe.toFixed(2)) },
    }));
  };

  const hasChanges = useMemo(() => JSON.stringify(local) !== JSON.stringify(cfg), [local, cfg]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(local);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Kanäle & Ziele</div>
          <button onClick={onClose} className="text-sm opacity-70 hover:opacity-100">Schließen</button>
        </div>

        {channels.length === 0 ? (
          <div className="text-sm text-gray-500">Keine Kanäle gefunden.</div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
            {channels.map((ch) => {
              const row = local[ch] ?? { label: ch, target: 4.5 };
              return (
                <div key={ch} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    <div className="text-[11px] text-gray-500">Technischer Name</div>
                    <div className="text-xs font-mono">{ch}</div>
                  </div>

                  <label className="col-span-5 text-sm">
                    <span className="block text-[11px] text-gray-500 mb-1">Anzeigename (DE)</span>
                    <input
                      value={row.label}
                      onChange={(e) => setLabel(ch, e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
                      placeholder="z.B. E-Mail Service"
                    />
                  </label>

                  <label className="col-span-3 text-sm">
                    <span className="block text-[11px] text-gray-500 mb-1">Ziel (1.00–5.00)</span>
                    <input
                      value={String(row.target)}
                      onChange={(e) => setTarget(ch, e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
                      inputMode="decimal"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg border">Abbrechen</button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-60"
          >
            {saving ? 'Speichere…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ---------------- Kleine UI-Helfer ---------------- */
function SortSwitcher({ sort, setSort }:{ sort:'newest'|'score_desc'; setSort:(v:'newest'|'score_desc')=>void; }) {
  return (
    <select value={sort} onChange={e=>setSort(e.target.value as any)}
            className="px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10" aria-label="Sortierung">
      <option value="newest">Neueste zuerst</option>
      <option value="score_desc">Höchster Ø zuerst</option>
    </select>
  );
}

function Chip({ children, tone, subtle }:{
  children: React.ReactNode;
  tone?: 'slate'|'amber'|'emerald';
  subtle?: boolean;
}) {
  const map: Record<string,string> = {
    slate:   subtle ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' : 'bg-slate-50 text-slate-700 border border-slate-200',
    amber:   subtle ? 'border border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                    : 'bg-amber-50 text-amber-700 border border-amber-200',
    emerald: subtle ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  };
  const cls = tone ? map[tone] : (subtle ? map.slate : 'bg-gray-100 text-gray-700 border border-gray-200');
  return <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${cls}`}>{children}</span>;
}

function Kpi({ title, value, tone }:{ title:string; value:string; tone?:string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
      <div className="text-[11px] text-gray-500">{title}</div>
      <div className={`text-lg font-semibold ${tone||''}`}>{value}</div>
    </div>
  );
}

function MiniRadial({ value, target, size = 56, stroke = 6, label, sublabel }:{
  value: number; target: number; size?: number; stroke?: number; label?: string; sublabel?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, value / target));
  const dash = p * c;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block">
        <circle cx={size/2} cy={size/2} r={r} stroke="currentColor" className="text-gray-200 dark:text-gray-800" strokeWidth={stroke} fill="none"/>
        <g transform={`rotate(-90 ${size/2} ${size/2})`}>
          <circle cx={size/2} cy={size/2} r={r} stroke="currentColor" className="text-emerald-500"
                  strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${dash} ${c}`} />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <div className={`text-[11px] font-semibold ${noteColor(value)}`}>{label}</div>
        {sublabel && <div className="text-[10px] text-gray-500">{sublabel}</div>}
      </div>
    </div>
  );
}

function MarkBtn({ active, onClick, title, children }:{
  active:boolean; onClick:()=>void; title:string; children:React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-[13px]
                  ${active ? 'bg-amber-50 text-amber-700 border-amber-300'
                           : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
    >
      {children}
    </button>
  );
}

/* ---------------- Kommentare (inline) ---------------- */
function FeedbackComments({ feedbackId }: { feedbackId: number|string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CommentRow[]>([]);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await authedFetch(`/api/feedback/${feedbackId}/comments?limit=200`, { cache:'no-store' });
      const j = await r.json().catch(()=>null);
      const arr: CommentRow[] = Array.isArray(j?.items) ? j.items.map((x:any)=>({ id: x.id, body: x.body, created_at: x.created_at, author: x.author })) : [];
      setItems(arr.reverse());
    } finally { setLoading(false); }
  }
  useEffect(()=>{ if (open) load(); }, [open]);

  async function submit() {
    const text = body.trim();
    if (!text) return;
    setPosting(true);
    try {
      const temp: CommentRow = { id: `tmp-${Date.now()}`, author: 'Ich', body: text, created_at: new Date().toISOString() };
      setItems(prev => [...prev, temp]);
      setBody('');
      const r = await authedFetch(`/api/feedback/${feedbackId}/comments`, {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ body: text })
      });
      if (!r.ok) {
        setItems(prev => prev.filter(c => c.id !== temp.id));
        setBody(text);
      } else {
        load();
      }
    } finally { setPosting(false); }
  }

  return (
    <div className="w-full">
      <button onClick={()=>setOpen(o=>!o)} className="text-[12px] px-2 py-1 rounded-full border hover:bg-gray-50" title="Kommentare anzeigen / beantworten">
        {open ? 'Kommentare ausblenden' : 'Kommentare anzeigen'}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-800 w-full">
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-end gap-2">
              <textarea value={body} onChange={e=>setBody(e.target.value)} rows={2}
                        placeholder="Antwort schreiben…" className="flex-1 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 text-sm"/>
              <button onClick={submit} disabled={posting||!body.trim()} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60">
                Senden
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-auto divide-y divide-gray-100 dark:divide-gray-800">
            {loading && <div className="p-3 text-sm text-gray-500">lädt…</div>}
            {!loading && items.length===0 && <div className="p-3 text-sm text-gray-500">Keine Kommentare</div>}
            {items.map(c=>(
              <div key={String(c.id)} className="p-2 text-[13px]">
                <div className="text-[11px] text-gray-500 mb-1">
                  <span className="font-medium">{c.author||'—'}</span>
                  <span> · {fmtDateTimeBerlin(c.created_at)}</span>
                </div>
                <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{c.body}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
