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
const ymKeyBerlin = (d: Date) => {
  const z = new Date(d.toLocaleString('en-US', { timeZone: FE_TZ }));
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}`;
};
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

  // Filter (Dropdowns)
  const [minRating, setMinRating] = useState<number>(0); // 0..5
  const [channels, setChannels]   = useState<Set<string>>(new Set()); // leer => alle
  const [groupMode, setGroupMode] = useState<'month'|'rating_then_month'>('month');

  // UI: geöffnete Monate
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  // Kommentar-Karte
  const [recent, setRecent] = useState<RecentComment[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);

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

      // Kanäle initial befüllen (einmalig)
      if (channels.size === 0) {
        const ks = new Set(rows.map(x => x.feedbacktyp).filter(Boolean));
        setChannels(ks);
      }
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
        const r = await authedFetch(
  `/api/teamhub/threads?mode=recent_owner_comments&owner_id=${encodeURIComponent(userId)}&limit=20`,
  { cache: 'no-store' }
);
const j = await r.json().catch(()=>null);
setRecent(Array.isArray(j?.items) ? j.items : []);
      } finally { setRecentLoading(false); }
    })();
  }, [userId]);

  const curName = useMemo(() => members.find(m => m.user_id === userId)?.name ?? '—', [members, userId]);

  // Channel-Liste für UI
  const allChannels = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.feedbacktyp) s.add(it.feedbacktyp);
    return [...s].sort();
  }, [items]);

  // --- Filter + Gruppierung ---
  type Group = { key: string; label: string; items: FeedbackItem[] };
  const groups: Group[] = useMemo(() => {
    // filtern
    const filtered = items.filter(f => {
      const s = avgScore(f);
      const passRating = minRating <= 0 ? true : Number(s ?? 0) >= minRating;
      const passChannel = channels.size === 0 ? true : channels.has(f.feedbacktyp || '');
      return passRating && passChannel;
    });

    if (groupMode === 'month') {
      // Gruppe nach Monat
      const map = new Map<string, FeedbackItem[]>();
      for (const f of filtered) {
        const iso = getTs(f);
        const d = iso ? new Date(iso) : null;
        if (!d || isNaN(d.getTime())) continue;
        const key = ymKeyBerlin(d);
        const arr = map.get(key) ?? [];
        arr.push(f); map.set(key, arr);
      }
      const months = [...map.entries()].map(([k, arr]) => {
        const [y, m] = k.split('-');
        // innerhalb des Monats: neueste zuerst
        const sorted = [...arr].sort((a, b) => {
          const ta = getTs(a) ? new Date(getTs(a) as string).getTime() : 0;
          const tb = getTs(b) ? new Date(getTs(b) as string).getTime() : 0;
          return tb - ta;
        });
        return { key: k, label: `${m}/${y}`, items: sorted };
      }).sort((a, b) => a.key < b.key ? 1 : -1);

      return months;
    }

    // groupMode === 'rating_then_month'
    // 1) nach Bewertung buckets bilden (5.0.., 4.75.., 4.5.., 4.0.., <4.0)
    const bucketFor = (s: number | null) => {
      const v = Number(s ?? 0);
      if (v >= 4.95) return '5.00–4.95';
      if (v >= 4.75) return '4.95–4.75';
      if (v >= 4.50) return '4.75–4.50';
      if (v >= 4.00) return '4.50–4.00';
      return '< 4.00';
    };

    const buckets = new Map<string, FeedbackItem[]>();
    for (const f of filtered) {
      const key = bucketFor(avgScore(f));
      const arr = buckets.get(key) ?? [];
      arr.push(f); buckets.set(key, arr);
    }

    // 2) innerhalb jedes Buckets → nach Monat
    const order = ['5.00–4.95','4.95–4.75','4.75–4.50','4.50–4.00','< 4.00'];
    const out: Group[] = [];
    for (const bucket of order) {
      const arr = buckets.get(bucket);
      if (!arr || arr.length === 0) continue;

      const perMonth = new Map<string, FeedbackItem[]>();
      for (const f of arr) {
        const iso = getTs(f);
        const d = iso ? new Date(iso) : null;
        if (!d || isNaN(d.getTime())) continue;
        const key = ymKeyBerlin(d);
        const list = perMonth.get(key) ?? [];
        list.push(f); perMonth.set(key, list);
      }

      // Monate absteigend, innerhalb neueste zuerst
      const months = [...perMonth.entries()].sort((a,b)=> a[0] < b[0] ? 1 : -1);
      months.forEach(([k, list]) => {
        const [y, m] = k.split('-');
        const sorted = [...list].sort((a, b) => {
          const ta = getTs(a) ? new Date(getTs(a) as string).getTime() : 0;
          const tb = getTs(b) ? new Date(getTs(b) as string).getTime() : 0;
          return tb - ta;
        });
        out.push({ key: `${bucket}:${k}`, label: `${bucket} · ${m}/${y}`, items: sorted });
      });
    }
    return out;
  }, [items, minRating, channels, groupMode]);

  // UI helpers
  const setAllChannels = (on: boolean) => setChannels(on ? new Set(allChannels) : new Set());
  const toggleChannel = (ch: string) =>
    setChannels(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
  const toggleMonth = (k: string) => setOpenMonths(p => ({ ...p, [k]: !p[k] }));

  // Dropdown-Renderer (leichtgewichtig mit <details>)
  function ChannelsDropdown() {
    return (
      <details className="relative">
        <summary className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm cursor-pointer">
          Feedbackarten
        </summary>
        <div className="absolute right-0 z-10 mt-2 w-64 rounded-lg border bg-white dark:bg-gray-900 shadow p-2">
          <div className="flex items-center gap-2 mb-2">
            <button className="text-xs px-2 py-1 rounded border" onClick={()=>setAllChannels(true)}>alle</button>
            <button className="text-xs px-2 py-1 rounded border" onClick={()=>setAllChannels(false)}>keine</button>
          </div>
          <ul className="max-h-64 overflow-auto space-y-1">
            {allChannels.map(ch => (
              <li key={ch} className="text-sm">
                <label className="inline-flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-white/10 w-full cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-blue-600"
                    checked={channels.has(ch)}
                    onChange={()=>toggleChannel(ch)}
                  />
                  <span className="truncate">{ch}</span>
                </label>
              </li>
            ))}
            {allChannels.length===0 && <li className="text-xs text-gray-500 px-2 py-1">Keine Kanäle</li>}
          </ul>
        </div>
      </details>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-6 space-y-4">
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

      {/* Filterleiste – Dropdowns */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-800/40">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Gruppierung */}
          <div className="flex items-center gap-2">
            <label className="text-sm">Gruppierung:</label>
            <select
              value={groupMode}
              onChange={e=>setGroupMode(e.target.value as any)}
              className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
            >
              <option value="month">Nach Monaten</option>
              <option value="rating_then_month">Nach Bewertung → Monate</option>
            </select>
          </div>

          {/* Mindestbewertung */}
          <div className="flex items-center gap-2">
            <label className="text-sm">Mindest-Bewertung:</label>
            <select
              value={String(minRating)}
              onChange={e=>setMinRating(Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
            >
              {[
                ['0','Alle'],
                ['4.0','≥ 4.00'],
                ['4.5','≥ 4.50'],
                ['4.75','≥ 4.75'],
                ['4.95','≥ 4.95'],
              ].map(([v,l])=> <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* Kanäle */}
          <ChannelsDropdown />
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Lade…</div>}

      {!loading && groups.length === 0 && (
        <div className="text-sm text-gray-500">Keine Feedbacks im Zeitraum/Filter.</div>
      )}

      {/* Gruppenliste */}
      {!loading && groups.length > 0 && (
        <ul className="space-y-3">
          {groups.map(g => {
            const open = !!openMonths[g.key];
            return (
              <li key={g.key} className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <button
                  onClick={()=>toggleMonth(g.key)}
                  className="w-full px-3 py-3 flex items-center justify-between bg-white/70 dark:bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base font-semibold">{g.label}</span>
                    <span className="text-xs text-gray-500">{g.items.length} Feedbacks</span>
                  </div>
                  <span className="text-gray-400">{open ? '▾' : '▸'}</span>
                </button>

                {open && (
                  <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                    {g.items.map((f) => {
                      const s = avgScore(f);
                      const bo = boLinkFor(f);
                      return (
                        <li key={String(f.id)} className="p-3 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="min-w-0 flex items-center gap-2 flex-wrap">
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
                                {f.template_name && (
                                  <span className="text-[11px] px-2 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                                    {f.template_name}
                                  </span>
                                )}
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
    const r = await authedFetch(`/api/labels`, { cache: 'no-store' });
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
