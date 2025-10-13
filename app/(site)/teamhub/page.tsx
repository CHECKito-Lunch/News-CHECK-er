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

// "Januar 2025" etc.
const fmtMonthYearDE = (y: number, m1to12: number) => {
  const d = new Date(Date.UTC(y, m1to12 - 1, 1));
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(d);
};

/* --------------- Page ------------------ */
export default function TeamHubPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [userId, setUserId]   = useState<string>('');
  const [from, setFrom]       = useState<string>('');
  const [to, setTo]           = useState<string>('');
  const [items, setItems]     = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Kommentar-Karte (Mitarbeiter-Kommentare)
  const [recent, setRecent] = useState<RecentComment[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

  // Unread-Map (für „Neu vom Mitarbeiter“-Marker)
  const [unreadMap, setUnreadMap] = useState<Record<string, { last_by_owner:boolean; unread_total:number; last_comment_at:string }>>({});

  // ---- Filter-States ----
  const [fDateFrom, setFDateFrom] = useState<string>('');
  const [fDateTo, setFDateTo]     = useState<string>('');
  const [fKanal, setFKanal]       = useState<string>('');
  const [fTemplate, setFTemplate] = useState<string>('');
  const [fComment, setFComment]   = useState<string>('');
  const [fRekla, setFRekla]       = useState<'any'|'rekla'|'none'>('any');
  const [fStatus, setFStatus]     = useState<'any'|'offen'|'geklärt'>('any');
  const [fLabelId, setFLabelId]   = useState<number|''>('');
  const [fBucket, setFBucket]     = useState<'all'|'neg'|'mid'|'high'|'perfect'>('all'); // Score-Buckets

  // Sortierung
  const [sort, setSort] = useState<'newest'|'score_desc'>('newest');

  // Labels global laden
  const [allLabelsGlobal, setAllLabelsGlobal] = useState<Array<{id:number; name:string; color?:string}>>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [labelsError, setLabelsError] = useState<string|null>(null);

  // Expand/Collapse Monatsgruppen
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({}); // default: alles zu

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

  // Neueste Mitarbeiter-Kommentare laden (Top-Karte)
  useEffect(() => {
    if (!userId) { setRecent([]); return; }
    (async () => {
      setRecentLoading(true);
      try {
        // Diese API liefert die letzten Kommentare DES Mitarbeiters (owner)
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

  // Dropdown-Werte
  const allChannels = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.feedbacktyp) s.add(it.feedbacktyp);
    return [...s].sort();
  }, [items]);

  // Labels für Filter-Dropdown
  const labelFilterOptions = useMemo<[number,string][]>(()=>{
    return allLabelsGlobal.map(l => [l.id, l.name] as [number,string]).sort((a,b)=>a[1].localeCompare(b[1]));
  }, [allLabelsGlobal]);

  // ---- FILTERN (ohne Sort) ----
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
      if (fComment && !(f.kommentar||'').toLowerCase().includes(fComment.toLowerCase())) return false;
      if (fRekla === 'rekla' && !isTrueish(f.rekla)) return false;
      if (fRekla === 'none' && isTrueish(f.rekla)) return false;
      const isGekl = isTrueish(f.geklaert);
      if (fStatus === 'offen' && isGekl) return false;
      if (fStatus === 'geklärt' && !isGekl) return false;
      if (fLabelId !== '') {
        const ids = new Set((f.labels||[]).map(l=>l.id));
        if (!ids.has(Number(fLabelId))) return false;
      }
      // Score-Buckets
      const s = avgScore(f) ?? 0;
      if (fBucket==='neg'     && s>3.0)  return false;
      if (fBucket==='mid'     && !(s>=3.01 && s<4.5)) return false;
      if (fBucket==='high'    && !(s>=4.5 && s<5.0))  return false;
      if (fBucket==='perfect' && s<5.0)  return false;
      return true;
    });
  }, [items, fDateFrom, fDateTo, fKanal, fTemplate, fComment, fRekla, fStatus, fLabelId, fBucket]);

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
  type Group = { key: string; label: string; items: FeedbackItem[] };
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
        return { key:k, label: fmtMonthYearDE(y, m), items: list };
      });
  }, [sortedItems]);

  // ---- KPI-Übersicht (für aktuelle Filter, ohne Bucket-Effekt? -> mit Bucket, damit es zum Listing passt) ----
  const kpis = useMemo(()=>{
    const arr = sortedItems;
    const n = arr.length;
    const scores = arr.map(avgScore).filter((x): x is number => Number.isFinite(x as any));
    const avg = scores.length ? (scores.reduce((s,n)=>s+n,0)/scores.length) : null;
    const neg = scores.filter(s=>s<=3.0).length;
    const rekla = arr.filter(f=>isTrueish(f.rekla)).length;
    const offen = arr.filter(f=>!isTrueish(f.geklaert)).length;
    const geloest = n - offen;
    return { n, avg, neg, rekla, offen, geloest, negPct: n? Math.round(100*neg/n):0 };
  }, [sortedItems]);

  // Oben: „Neue Mitarbeiter-Kommentare“ Zähler aus unreadMap
  const ownerNewCount = useMemo(()=>{
    let c = 0;
    for (const k in unreadMap) {
      const v = unreadMap[k];
      if (v?.last_by_owner && v.unread_total>0) c++;
    }
    return c;
  }, [unreadMap]);

  // Expand/Collapse alle
  const setAllGroupsOpen = (open:boolean) => {
    const m: Record<string,boolean> = {};
    groups.forEach(g=> { m[g.key] = open; });
    setOpenGroups(m);
  };
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
                  className="w-40 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm" />
            <span className="text-gray-400">–</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
                  className="w-40 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm" />
          </div>

          {/* Label-Manager */}
          <LabelManagerButton />
        </div>
      </header>

      <div className="text-sm text-gray-600 dark:text-gray-300">
        Mitarbeiter: <b>{curName}</b>
        {labelsLoading && <span className="ml-2 text-xs text-gray-500">Labels laden…</span>}
        {labelsError && <span className="ml-2 text-xs text-red-600">{labelsError}</span>}
      </div>

      {/* Hinweisleiste: neue Mitarbeiter-Kommentare */}
      {ownerNewCount > 0 && (
        <div className="rounded-xl bg-rose-50 text-rose-800 border border-rose-200 px-3 py-2 text-sm">
          {ownerNewCount} neue Kommentar{ownerNewCount>1?'e':''} vom Mitarbeiter (ungelesen).
        </div>
      )}

      {/* KPI-Übersicht */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 md:p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Kpi title="Ø-Score" value={fmtAvg(kpis.avg)} tone={kpis.avg!=null?noteColor(kpis.avg):'text-gray-500'} />
          <Kpi title="Feedbacks" value={String(kpis.n)} />
          <Kpi title="Negativ ≤3,0" value={`${kpis.neg} (${kpis.negPct}%)`} />
          <Kpi title="Rekla" value={String(kpis.rekla)} />
          <Kpi title="offen" value={String(kpis.offen)} />
          <Kpi title="geklärt" value={String(kpis.geloest)} />
        </div>
      </section>

      {/* Neueste Mitarbeiter-Kommentare */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Neueste Kommentare des Mitarbeiters</div>
          <div className="text-xs text-gray-500">{recentLoading ? 'lädt…' : `${recent.length} Einträge`}</div>
        </div>
        {recent.length === 0 ? (
          <div className="text-sm text-gray-500">Keine Mitarbeiter-Kommentare vorhanden.</div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {recent.map(rc => (
              <li key={rc.id} className="py-2">
                <div className="text-[12px] text-gray-500 mb-1">
                  <span className="font-medium">{rc.author}</span>
                  <span> · {new Date(rc.created_at).toLocaleString('de-DE')}</span>
                  <Link href={`/feedback/${rc.feedback_id}`} className="ml-2 text-blue-600 hover:underline">Feedback öffnen</Link>
                </div>
                <p className="text-sm whitespace-pre-wrap">{rc.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {loading && <div className="text-sm text-gray-500">Lade…</div>}

      {/* INBOX-LAYOUT */}
      {!loading && (
        <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          {/* Filterleiste */}
          <div className="p-3 flex flex-wrap md:flex-nowrap items-center gap-2 border-b border-gray-100 dark:border-gray-800 text-sm">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={fDateFrom}
                onChange={e=>setFDateFrom(e.target.value)}
                className="w-40 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10"
                aria-label="Von"
              />
              <span className="text-gray-400">–</span>
              <input
                type="date"
                value={fDateTo}
                onChange={e=>setFDateTo(e.target.value)}
                className="w-40 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10"
                aria-label="Bis"
              />
            </div>

            <select
              value={fKanal}
              onChange={e=>setFKanal(e.target.value)}
              className="w-48 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10"
              aria-label="Kanal"
            >
              <option value="">Alle Kanäle</option>
              {allChannels.map(c => (<option key={c} value={c}>{c}</option>))}
            </select>

            <input
              value={fTemplate}
              onChange={e=>setFTemplate(e.target.value)}
              placeholder="Template suchen…"
              className="w-64 md:w-72 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10"
              aria-label="Template"
            />

            <input
              value={fComment}
              onChange={e=>setFComment(e.target.value)}
              placeholder="Kommentar suchen…"
              className="w-64 md:w-80 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10"
              aria-label="Kommentar"
            />

            <select
              value={fRekla}
              onChange={e=>setFRekla(e.target.value as any)}
              className="w-40 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10"
              aria-label="Reklamation"
            >
              <option value="any">Rekla: Alle</option>
              <option value="rekla">Nur Rekla</option>
              <option value="none">Ohne Rekla</option>
            </select>

            <select
              value={fStatus}
              onChange={e=>setFStatus(e.target.value as any)}
              className="w-36 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10"
              aria-label="Status"
            >
              <option value="any">Status: Alle</option>
              <option value="offen">offen</option>
              <option value="geklärt">geklärt</option>
            </select>

            <select
              value={String(fLabelId)}
              onChange={e=>setFLabelId(e.target.value===''?'':Number(e.target.value))}
              className="w-56 px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10"
              aria-label="Label"
            >
              <option value="">Alle Labels</option>
              {labelFilterOptions.map(([id,name])=> (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>

            {/* Score-Bucket Quickfilter */}
            <div className="flex items-center gap-1 ml-auto">
              <BucketChip active={fBucket==='all'} onClick={()=>setFBucket('all')}>alle</BucketChip>
              <BucketChip active={fBucket==='neg'} onClick={()=>setFBucket('neg')}>≤ 3,0</BucketChip>
              <BucketChip active={fBucket==='mid'} onClick={()=>setFBucket('mid')}>3,01–4,49</BucketChip>
              <BucketChip active={fBucket==='high'} onClick={()=>setFBucket('high')}>4,5–4,99</BucketChip>
              <BucketChip active={fBucket==='perfect'} onClick={()=>setFBucket('perfect')}>5,0</BucketChip>
            </div>
          </div>

          {/* Sort/Counter/Reset */}
          <div className="px-3 py-2 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 text-sm">
            <SortSwitcher sort={sort} setSort={setSort} />
            <span className="text-xs text-gray-500 whitespace-nowrap">{sortedItems.length} Treffer</span>
            <button
              onClick={()=>{
                setFDateFrom(''); setFDateTo(''); setFKanal('');
                setFTemplate(''); setFComment(''); setFRekla('any');
                setFStatus('any'); setFLabelId(''); setFBucket('all');
              }}
              className="px-2 py-1.5 rounded-lg border text-xs ml-auto"
            >
              Filter zurücksetzen
            </button>
            <div className="flex items-center gap-2">
              <button onClick={()=>setAllGroupsOpen(true)} className="px-2 py-1.5 rounded-lg border text-xs">Alle öffnen</button>
              <button onClick={()=>setAllGroupsOpen(false)} className="px-2 py-1.5 rounded-lg border text-xs">Alle schließen</button>
            </div>
          </div>

          {/* Ergebnisliste (Monatsgruppen, default zu) */}
          {loading ? (
            <div className="p-6 text-sm text-gray-500">Lade…</div>
          ) : groups.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">Keine Treffer</div>
          ) : (
            <div>
              {groups.map(g => {
                const open = !!openGroups[g.key]; // default: false
                return (
                  <div key={g.key} className="border-b last:border-b-0 border-gray-100 dark:border-gray-800">
                    <button
                      onClick={()=>toggleGroup(g.key)}
                      className="w-full sticky top-0 z-10 px-3 py-2 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur text-sm font-semibold border-b border-gray-100 dark:border-gray-800 capitalize flex items-center justify-between"
                    >
                      <span>{g.label}</span>
                      <span className="text-xs text-gray-500">{open?'▾':'▸'} {g.items.length} Feedbacks</span>
                    </button>

                    {open && (
                      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                        {g.items.map(f=>{
                          const s  = avgScore(f);
                          const bo = boLinkFor(f);
                          const um = unreadMap[String(f.id)];
                          const hasNewFromOwner = !!(um && um.last_by_owner && um.unread_total > 0);
                          return (
                            <FeedbackRow
                              key={String(f.id)}
                              f={f}
                              s={s}
                              bo={bo}
                              hasNewFromOwner={hasNewFromOwner}
                              allLabelsGlobal={allLabelsGlobal}
                            />
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
      )}
    </div>
  );
}

/* ---------------- Row + helpers ---------------- */
function FeedbackRow({
  f, s, bo, hasNewFromOwner, allLabelsGlobal,
}:{
  f: FeedbackItem;
  s: number|null;
  bo: string|null;
  hasNewFromOwner: boolean;
  allLabelsGlobal: Array<{id:number; name:string; color?:string}>;
}) {
  const [showComments, setShowComments] = useState(false);
  return (
    <li className="p-3 md:p-4 hover:bg-gray-50/60 dark:hover:bg-white/5 transition-colors">
      <div className="flex items-start gap-3">
        {/* Neu-Dot */}
        <div className="pt-2">
          {hasNewFromOwner && <span title="Neuer Kommentar vom Mitarbeiter" className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500" />}
        </div>

        {/* Hauptinhalt */}
        <div className="min-w-0 flex-1">
          {/* Kopfzeile */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate max-w-[40ch]">{f.template_name ?? f.feedbacktyp}</span>
              <Chip subtle>{f.feedbacktyp}</Chip>
              {isTrueish(f.rekla) && (<Chip tone="amber">Rekla</Chip>)}
              <Chip tone={isTrueish(f.geklaert) ? 'emerald' : 'slate'}>
                {isTrueish(f.geklaert) ? 'geklärt' : 'offen'}
              </Chip>
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
                  🔎 BO
                </a>
              )}
              <span className="text-[11px] px-2 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                {fmtDateTimeBerlin(getTs(f))}
              </span>
              <span className={`ml-2 text-xs px-2 py-1 rounded-full border ${noteColor(s)}`}>
                Ø {fmtAvg(s)}
              </span>
            </div>
          </div>

          {/* Kommentar-Preview */}
          {f.kommentar && (
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{f.kommentar}</p>
          )}

          {/* Labels + Aktionen */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <LabelChips feedbackId={f.id} labels={f.labels ?? []} allLabels={allLabelsGlobal} />
            <Link href={`/feedback/${f.id}`} className="text-sm text-blue-600 hover:underline">öffnen</Link>
            <button
              onClick={()=>setShowComments(v=>!v)}
              className="text-sm px-2 py-1 rounded-lg border"
              aria-expanded={showComments}
            >
              {showComments ? 'Kommentare verbergen' : 'Kommentare anzeigen'}
            </button>
          </div>

          {/* Kommentare inline */}
          {showComments && (
            <div className="mt-3">
              <FeedbackComments feedbackId={f.id} />
            </div>
          )}
        </div>
      </div>
    </li>
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

  useEffect(()=>{
    setAttached(labels.map(l=>l.id));
  }, [labels.map(l=>l.id).join(',')]); // primitive deps

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
      <details className="relative">
        <summary className="text-[11px] px-2 py-1 rounded-full bg-gray-100 cursor-pointer">Label hinzufügen</summary>
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

/* ---------------- Kommentare ---------------- */
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
    <div className="mt-1 rounded-lg border border-gray-200 dark:border-gray-800 p-3">
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

/* ---------------- Kleine UI-Helfer ---------------- */
function Kpi({ title, value, tone }:{ title:string; value:string; tone?:string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
      <div className="text-[11px] text-gray-500">{title}</div>
      <div className={`text-lg font-semibold ${tone||''}`}>{value}</div>
    </div>
  );
}

function SortSwitcher({ sort, setSort }:{ sort:'newest'|'score_desc'; setSort:(v:'newest'|'score_desc')=>void; }) {
  return (
    <select
      value={sort}
      onChange={e=>setSort(e.target.value as any)}
      className="px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10"
      aria-label="Sortierung"
    >
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

function BucketChip({children, active, onClick}:{children:React.ReactNode; active:boolean; onClick:()=>void}) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2 py-1 rounded-full border ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-white/10'}`}
    >
      {children}
    </button>
  );
}
