/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authedFetch } from '@/lib/fetchWithSupabase';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

/* -------- Types -------- */
type Item = {
  id: number|string;
  ts?: string | null;
  incident_type?: string | null;
  category?: string | null;
  severity?: string | null;
  description?: string | null;
  booking_number_hash?: string | null; // enthält nur Ziffern
};

type AiCategory = {
  key: string;
  label: string;
  count: number;
  reasons: string[];
  example_ids: Array<string|number>;
  confidence?: 'low'|'medium'|'high';
};

/* ---- Coach types ---- */
type CoachPoint = { text: string; example_item_ids?: Array<string|number> };
type CoachTip = CoachPoint & { source?: 'extracted' | 'generated' };
type CoachValue = {
  value: string;
  praise: CoachPoint[];
  neutral: CoachPoint[];
  improve: CoachPoint[];
  tips: CoachTip[];
};
type CoachData = {
  values: CoachValue[];
  summary: { overall_tone?: string; quick_wins: string[]; risks: string[] };
  incidents_mapped: Array<{ item_id: string|number; value: string; why?: string }>;
};

/* -------- Anzeige-Labels (Incident-Typen) -------- */
const TYPE_LABELS: Record<string, string> = {
  mail_handling: 'Mail-Bearbeitung',
  consulting: 'Beratung',
  rekla: 'Reklamation',
  booking_transfer: 'Umbuchung',
  booking_changed: 'Buchung geändert',
  cancellation: 'Stornierung',
  reminder: 'Erinnerung',
  post_booking: 'Nachbuchung',
  additional_service: 'Zusatzleistung',
  voucher: 'Gutschein',
  payment_data: 'Zahlungsdaten',
  va_contact: 'VA-Kontakt',
  word_before_writing: 'Vor dem Schreiben',
  privacy: 'Datenschutz',
  special_reservation: 'Sonderreservierung',
  sonstiges: 'Sonstiges',
};

const labelForType = (t?: string | null) => {
  const k = (t || '').trim();
  if (!k) return '—';
  if (TYPE_LABELS[k]) return TYPE_LABELS[k];
  return k.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
};

/* -------- Value→Farb-Map (Chips/Farbtöne) -------- */
const VALUE_COLORS: Record<string, {bg:string; text:string; border:string; pillBg?:string}> = {
  'Zielgerichtete Kommunikation und Zusammenarbeit': { bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-800 dark:text-indigo-200', border: 'border-indigo-200 dark:border-indigo-800', pillBg:'bg-indigo-50' },
  'Offenheit & Lernbereitschaft': { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-800 dark:text-amber-200', border: 'border-amber-200 dark:border-amber-800', pillBg:'bg-amber-50' },
  'Kundenorientierung': { bg: 'bg-sky-50 dark:bg-sky-900/20', text: 'text-sky-800 dark:text-sky-200', border: 'border-sky-200 dark:border-sky-800', pillBg:'bg-sky-50' },
  'Fachkompetenz': { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-800 dark:text-emerald-200', border: 'border-emerald-200 dark:border-emerald-800', pillBg:'bg-emerald-50' },
  'Excellence in Execution': { bg: 'bg-zinc-50 dark:bg-zinc-800/40', text: 'text-zinc-800 dark:text-zinc-200', border: 'border-zinc-200 dark:border-zinc-700', pillBg:'bg-zinc-50' },
  'Ergebnisorientierung': { bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/20', text: 'text-fuchsia-800 dark:text-fuchsia-200', border: 'border-fuchsia-200 dark:border-fuchsia-800', pillBg:'bg-fuchsia-50' },
  'Commitment': { bg: 'bg-rose-50 dark:bg-rose-900/20', text: 'text-rose-800 dark:text-rose-200', border: 'border-rose-200 dark:border-rose-800', pillBg:'bg-rose-50' },
};

/* -------- Helpers -------- */
const FE_TZ = 'Europe/Berlin';

const ymKey = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  // nach Berlin normalisieren, damit Monatsgrenzen passen
  const z = new Date(d.toLocaleString('en-US', { timeZone: FE_TZ }));
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}`;
};

const ymLabelDE = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, (m || 1) - 1, 1));
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(d);
};

const fmtDate = (input?: string | null) => {
  if (!input) return '—';
  const d = new Date(input);
  return isNaN(d.getTime()) ? input : d.toLocaleString('de-DE');
};

const boUrl = (n?: string | null) =>
  n && n.trim()
    ? `https://backoffice.reisen.check24.de/booking/search/?booking_id=${encodeURIComponent(
        n.replace(/\D+/g, '')
      )}`
    : null;

/* -------- Widget -------- */
export default function QAWidget({
  ownerId,
  from,
  to,
}: {
  ownerId: string;
  from?: string;
  to?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter (Typen-Chips)
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());

  // KI-State (Legacy + Coaching)
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCategories, setAiCategories] = useState<AiCategory[] | null>(null); // für Fallback/Legacy
  const [aiCoach, setAiCoach] = useState<CoachData | null>(null);
  const [aiQuicklist, setAiQuicklist] = useState<Array<{value:string;type:'tip'|'improve';text:string;example_item_ids?:Array<string|number>}>>([]);

  // Gruppen-UI (eingeklappt/ausgeklappt)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Highlight-Scroll-Zeug
  const listRef = useRef<HTMLDivElement | null>(null);
  const [highlightId, setHighlightId] = useState<string | number | null>(null);

  // Load items (Teamhub-API, scoped auf ownerId)
  const load = useCallback(async () => {
    if (!ownerId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('owner_id', ownerId);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const r = await authedFetch(`/api/teamhub/qa${qs.toString() ? `?${qs.toString()}` : ''}`, { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      setItems(Array.isArray(j?.items) ? j.items : []);
    } finally {
      setLoading(false);
    }
  }, [ownerId, from, to]);

  useEffect(() => { load(); }, [load]);

  // Typen + deutsche Labels
  const incidentTypes = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const key = (it.incident_type || '').trim();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, label: labelForType(key), count }));
  }, [items]);

  // Anwenden der Typenfilter
  const filteredItems = useMemo(() => {
    if (typeFilter.size === 0) return items;
    return items.filter(i => {
      const t = (i.incident_type || '').trim();
      return t && typeFilter.has(t);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, JSON.stringify(Array.from(typeFilter).sort())]);

  // Monatsverlauf (für Chart, Berlin TZ)
  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    filteredItems.forEach(i => {
      const k = ymKey(i.ts);
      if (!k) return;
      m.set(k, (m.get(k) || 0) + 1);
    });
    const arr = [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return arr.map(([k, v]) => ({ month: k, count: v }));
  }, [filteredItems]);

  // Gruppieren nach Monat (für Liste) – neueste Monate zuerst, default eingeklappt
  const monthGroups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of filteredItems) {
      const k = ymKey(it.ts);
      if (!k) continue;
      const list = map.get(k) ?? [];
      list.push(it);
      map.set(k, list);
    }
    // Sortiere Einträge innerhalb des Monats (neueste zuerst)
    for (const [, list] of map) {
      list.sort((a, b) => {
        const ta = a.ts ? new Date(a.ts).getTime() : 0;
        const tb = b.ts ? new Date(b.ts).getTime() : 0;
        return tb - ta;
      });
    }
    // Sortiere Monate (neueste zuerst)
    const ordered = [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return ordered.map(([key, list]) => ({ key, label: ymLabelDE(key), items: list }));
  }, [filteredItems]);

  // Beim Wechsel der Gruppen: standardmäßig alle einklappen
  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const g of monthGroups) next[g.key] = false; // zugeklappt
    setOpenGroups(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthGroups.map(g => g.key).join(',')]);

  const setAllGroups = (open: boolean) => {
    const next: Record<string, boolean> = {};
    for (const g of monthGroups) next[g.key] = open;
    setOpenGroups(next);
  };

  // Scroll + Highlight zu Item-ID
  const scrollToItem = useCallback((id: string | number) => {
    // öffne alle Monate (oder gezielt den mit dem Item)
    setAllGroups(true);
    // in einem Tick warten, bis geöffnet
    setTimeout(() => {
      const el = document.querySelector(`[data-item-id="${String(id)}"]`);
      if (el && el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightId(id);
        setTimeout(() => setHighlightId(null), 2400);
      }
    }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // KI-Coaching (nimmt die aktuell sichtbaren Items)
  const runAi = useCallback(async () => {
    if (filteredItems.length === 0) return;
    setAiLoading(true); setAiError(null);
    try {
      const r = await authedFetch('/api/me/qa/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: filteredItems }),
      });
      const j = await r.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || 'Analyse fehlgeschlagen');

      // Reset
      setAiCoach(null);
      setAiCategories(null);
      setAiQuicklist([]);

      if (j.mode === 'ai' && j.data) {
        const d = j.data as CoachData;
        setAiCoach(d);
        setAiQuicklist(Array.isArray(j.quicklist) ? j.quicklist : []);
        // optional: Legacy-Kacheln zusätzlich anzeigen
        if (j.legacy?.categories) {
          const cats: AiCategory[] = j.legacy.categories.map((c:any)=>({
            ...c,
            label: TYPE_LABELS[c.key] || c.label || c.key
          }));
          setAiCategories(cats);
        }
      } else {
        // fallback/legacy
        const cats: AiCategory[] = Array.isArray(j.categories)
          ? j.categories.map((c:any)=> ({ ...c, label: TYPE_LABELS[c.key] || c.label || c.key }))
          : [];
        setAiCategories(cats);
      }
    } catch (e: any) {
      setAiError(e?.message || 'Analyse fehlgeschlagen');
      setAiCoach(null);
      setAiCategories(null);
      setAiQuicklist([]);
    } finally {
      setAiLoading(false);
    }
  }, [filteredItems]);

  const toggleType = (t: string) => {
    setTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };
  const resetTypes = () => setTypeFilter(new Set());

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 md:p-4">
      {/* Kopf */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-sm font-semibold">Mitarbeiterfeedbacks</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAllGroups(true)}
            className="px-2 py-1.5 rounded-lg border text-xs"
            title="Alle Monate öffnen"
          >
            Alle öffnen
          </button>
          <button
            onClick={() => setAllGroups(false)}
            className="px-2 py-1.5 rounded-lg border text-xs"
            title="Alle Monate schließen"
          >
            Alle schließen
          </button>
          <button
            onClick={runAi}
            disabled={aiLoading || filteredItems.length === 0}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs"
            title="KI-Coaching der aktuell sichtbaren Einträge"
          >
            {aiLoading ? 'Analysiere…' : 'KI-Coaching'}
          </button>
        </div>
      </div>

      {/* Typen-Chips */}
      {incidentTypes.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] text-gray-500 mb-1">Filtern nach Typ</div>
          <div className="flex flex-wrap gap-2">
            {incidentTypes.map(({ key, label, count }) => {
              const active = typeFilter.has(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleType(key)}
                  className={[
                    'px-2.5 py-1 rounded-full border text-xs',
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-white/10 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/20',
                  ].join(' ')}
                  title={`${label} (${count})`}
                >
                  {label} <span className={active ? 'opacity-90' : 'text-gray-500'}>({count})</span>
                </button>
              );
            })}
            {typeFilter.size > 0 && (
              <button
                onClick={resetTypes}
                className="px-2.5 py-1 rounded-full border text-xs bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/20"
                title="Filter zurücksetzen"
              >
                Zurücksetzen
              </button>
            )}
          </div>
        </div>
      )}

      {/* KI-Error */}
      {aiError && <div className="mb-3 text-sm text-red-600">{aiError}</div>}

      {/* KI-Coaching Panel */}
      {aiCoach && (
        <div className={`mb-3 rounded-xl p-3 border ${'border-emerald-200 dark:border-emerald-900'} ${'bg-emerald-50/60 dark:bg-emerald-900/20'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">KI-Coaching (Werte & Tipps)</div>
            <div className="text-xs text-gray-500">
              Quick Wins: {aiCoach.summary.quick_wins.length} · Risiken: {aiCoach.summary.risks.length}
            </div>
          </div>

          {aiCoach.summary.quick_wins.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium mb-1">Quick Wins</div>
              <div className="flex flex-wrap gap-1.5">
                {aiCoach.summary.quick_wins.slice(0,8).map((q, i)=>(
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full border bg-white">{q}</span>
                ))}
              </div>
            </div>
          )}

          {/* Werte-Kacheln */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {aiCoach.values.map((v, idx)=> {
              const c = VALUE_COLORS[v.value] || { bg:'bg-gray-50 dark:bg-gray-800/40', text:'text-gray-800 dark:text-gray-200', border:'border-gray-200 dark:border-gray-700' };
              return (
                <div key={idx} className={`rounded-lg border p-3 ${c.bg} ${c.border}`}>
                  <div className={`text-sm font-semibold mb-1 ${c.text}`}>{v.value}</div>

                  {v.praise.length>0 && (
                    <div className="mb-1">
                      <div className="text-xs text-emerald-700 font-medium">Lob</div>
                      <ul className="text-xs list-disc pl-4">
                        {v.praise.slice(0,3).map((p,i)=>(
                          <li key={i}>
                            {p.text}
                            {p.example_item_ids && p.example_item_ids.length>0 && (
                              <button
                                className="ml-1 text-[11px] underline text-blue-700 hover:text-blue-900"
                                onClick={()=> scrollToItem(p.example_item_ids![0])}
                                title={`Zu Beispiel ${String(p.example_item_ids[0])} springen`}
                              >
                                (Beispiel)
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {v.improve.length>0 && (
                    <div className="mb-1">
                      <div className="text-xs text-amber-700 font-medium">Verbesserung</div>
                      <ul className="text-xs list-disc pl-4">
                        {v.improve.slice(0,3).map((p,i)=>(
                          <li key={i}>
                            {p.text}
                            {p.example_item_ids && p.example_item_ids.length>0 && (
                              <button
                                className="ml-1 text-[11px] underline text-blue-700 hover:text-blue-900"
                                onClick={()=> scrollToItem(p.example_item_ids![0])}
                                title={`Zu Beispiel ${String(p.example_item_ids[0])} springen`}
                              >
                                (Beispiel)
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {v.tips.length>0 && (
                    <div className="mt-2">
                      <div className="text-xs text-blue-700 font-medium">Tipps / Next Steps</div>
                      <ul className="text-xs list-disc pl-4">
                        {v.tips.slice(0,4).map((t,i)=>(
                          <li key={i}>
                            {t.text}
                            {t.example_item_ids && t.example_item_ids.length>0 && (
                              <button
                                className="ml-1 text-[11px] underline text-blue-700 hover:text-blue-900"
                                onClick={()=> scrollToItem(t.example_item_ids![0])}
                                title={`Zu Beispiel ${String(t.example_item_ids[0])} springen`}
                              >
                                (Beispiel)
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Schnellliste (Tipps & Improve) */}
          {aiQuicklist.length>0 && (
            <div className="mt-3">
              <div className="text-xs text-gray-600 mb-1">Schnellliste (Top-Tipps & -Verbesserungen)</div>
              <div className="flex flex-wrap gap-1.5">
                {aiQuicklist.map((q, i)=>(
                  <button
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full border bg-white hover:bg-gray-50"
                    onClick={()=> {
                      const id = q.example_item_ids?.[0];
                      if (id!=null) scrollToItem(id);
                    }}
                    title={q.example_item_ids?.[0] ? `Zu Beispiel ${String(q.example_item_ids[0])}` : undefined}
                  >
                    {q.type === 'tip' ? '💡' : '🔧'} {q.text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Falls nur Legacy/Fallback vorhanden: zeige deine alte Kachelansicht weiter */}
      {!aiCoach && aiCategories && aiCategories.length > 0 && (
        <div className="mb-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-900/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">KI-Kategorisierung (sichtbarer Zeitraum)</div>
            <div className="text-xs text-gray-500">
              {aiCategories.reduce((a, c) => a + c.count, 0)} Einträge
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {aiCategories.map(cat => (
              <div key={cat.key} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-950">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">{cat.label}</div>
                  <div className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{cat.count}</div>
                </div>
                {cat.reasons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cat.reasons.map((r, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => toggleType(cat.key)}
                    className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                    title="Diese Kategorie filtern"
                  >
                    Nach {cat.label} filtern
                  </button>
                  {cat.example_ids.length > 0 && (
                    <button
                      className="text-[11px] text-blue-700 underline"
                      onClick={()=> scrollToItem(cat.example_ids[0])}
                      title={`Zu Beispiel ${String(cat.example_ids[0])} springen`}
                    >
                      Beispiel öffnen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ladezustand */}
      {loading && <div className="text-sm text-gray-500">Lade…</div>}

      {/* Chart + Liste (monatsweise, collapsible) */}
      {!loading && (
        <>
          {/* Monatsverlauf */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-900 mb-3">
            <div className="text-sm font-medium mb-2">Monatsverlauf (Anzahl Vorfälle)</div>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byMonth}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => [v, 'Vorfälle']} />
                  <Line type="monotone" dataKey="count" dot={false} strokeWidth={2.2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gruppierte Liste */}
          <div ref={listRef} className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            {monthGroups.length === 0 && (
              <div className="p-3 text-sm text-gray-500">Keine Einträge im Zeitraum.</div>
            )}

            {monthGroups.map(g => {
              const open = !!openGroups[g.key];
              return (
                <div key={g.key} className="border-b last:border-b-0 border-gray-200 dark:border-gray-800">
                  <button
                    onClick={() => setOpenGroups(prev => ({ ...prev, [g.key]: !prev[g.key] }))}
                    className="w-full px-3 py-2 bg-gray-50/70 dark:bg-gray-800/60 backdrop-blur text-sm font-semibold
                               border-b border-gray-200 dark:border-gray-800 capitalize flex items-center justify-between"
                  >
                    <span>{g.label}</span>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{g.items.length} Einträge</span>
                      <span className="text-gray-400">{open ? '▾' : '▸'}</span>
                    </div>
                  </button>

                  {open && (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                      {g.items.map(it => {
                        const isHighlighted = highlightId != null && String(highlightId) === String(it.id);
                        return (
                          <li
                            key={String(it.id)}
                            data-item-id={String(it.id)}
                            className={`p-3 transition-colors ${isHighlighted ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-medium">
                                  {it.category || labelForType(it.incident_type) || '—'}
                                </div>
                                <div className="text-xs text-gray-500 line-clamp-1">
                                  {it.description || '—'}
                                </div>
                              </div>

                              <div className="shrink-0 text-right flex items-center gap-2">
                                {boUrl(it.booking_number_hash) && (
                                  <a
                                    href={boUrl(it.booking_number_hash)!}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center px-2 py-0.5 rounded border text-xs
                                               bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                    title="Im Backoffice öffnen"
                                  >
                                    BO
                                  </a>
                                )}
                                <div className="text-xs text-gray-500">{fmtDate(it.ts)}</div>
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
        </>
      )}
    </section>
  );
}
