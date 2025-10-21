/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  booking_number_hash?: string | null;
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

/* -------- Anzeige-Labels -------- */
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

/* -------- Value→Farb-Map -------- */
const VALUE_COLORS: Record<string, {bg:string; text:string; border:string}> = {
  'Zielgerichtete Kommunikation und Zusammenarbeit': { bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-800 dark:text-indigo-200', border: 'border-indigo-200 dark:border-indigo-800' },
  'Offenheit & Lernbereitschaft': { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-800 dark:text-amber-200', border: 'border-amber-200 dark:border-amber-800' },
  'Kundenorientierung': { bg: 'bg-sky-50 dark:bg-sky-900/20', text: 'text-sky-800 dark:text-sky-200', border: 'border-sky-200 dark:border-sky-800' },
  'Fachkompetenz': { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-800 dark:text-emerald-200', border: 'border-emerald-200 dark:border-emerald-800' },
  'Excellence in Execution': { bg: 'bg-zinc-50 dark:bg-zinc-800/40', text: 'text-zinc-800 dark:text-zinc-200', border: 'border-zinc-200 dark:border-zinc-700' },
  'Ergebnisorientierung': { bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/20', text: 'text-fuchsia-800 dark:text-fuchsia-200', border: 'border-fuchsia-200 dark:border-fuchsia-800' },
  'Commitment': { bg: 'bg-rose-50 dark:bg-rose-900/20', text: 'text-rose-800 dark:text-rose-200', border: 'border-rose-200 dark:border-rose-800' },
};

/* -------- Helpers -------- */
const FE_TZ = 'Europe/Berlin';
const ymKey = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
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
    ? `https://backoffice.reisen.check24.de/booking/search/?booking_id=${encodeURIComponent(n.replace(/\D+/g, ''))}`
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

  // KI-State (nur Coaching)
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCoach, setAiCoach] = useState<CoachData | null>(null);
  const [aiQuicklist, setAiQuicklist] = useState<
    Array<{ value:string; type:'tip'|'improve'; text:string; example_item_ids?:Array<string|number> }>
  >([]);

  // Gruppen-UI (eingeklappt/ausgeklappt)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Highlight-Scroll
  const [highlightId, setHighlightId] = useState<string | number | null>(null);
  const scrollToItem = useCallback((id: string | number) => {
    setAllGroups(true);
    setTimeout(() => {
      const el = document.querySelector(`[data-item-id="${String(id)}"]`);
      if (el && el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightId(id);
        setTimeout(() => setHighlightId(null), 2400);
      }
    }, 50);
  }, []);

  // Items laden (serverseitig gefiltert per ownerId/from/to)
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

  // Typen + Labels
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

  // Filter anwenden
  const filteredItems = useMemo(() => {
    if (typeFilter.size === 0) return items;
    return items.filter(i => {
      const t = (i.incident_type || '').trim();
      return t && typeFilter.has(t);
    });
  }, [items, JSON.stringify(Array.from(typeFilter).sort())]);

  // Monatschart
  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    filteredItems.forEach(i => { const k = ymKey(i.ts); if (!k) return; m.set(k, (m.get(k) || 0) + 1); });
    const arr = [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return arr.map(([k, v]) => ({ month: k, count: v }));
  }, [filteredItems]);

  // Monatsgruppen (neueste zuerst)
  const monthGroups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of filteredItems) {
      const k = ymKey(it.ts);
      if (!k) continue;
      const list = map.get(k) ?? [];
      list.push(it);
      map.set(k, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const ta = a.ts ? new Date(a.ts).getTime() : 0;
        const tb = b.ts ? new Date(b.ts).getTime() : 0;
        return tb - ta;
      });
    }
    const ordered = [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
    return ordered.map(([key, list]) => ({ key, label: ymLabelDE(key), items: list }));
  }, [filteredItems]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const g of monthGroups) next[g.key] = false;
    setOpenGroups(next);
  }, [monthGroups.map(g => g.key).join(',')]);

  const setAllGroups = (open: boolean) => {
    const next: Record<string, boolean> = {};
    for (const g of monthGroups) next[g.key] = open;
    setOpenGroups(next);
  };

  // === KI-Coaching (nur neue API, keine Items senden) ===
  const runAi = useCallback(async () => {
    if (items.length === 0) return; // Button-Disable basiert jetzt auf items
    setAiLoading(true); setAiError(null);
    try {
      const r = await authedFetch('/api/teamhub/coach', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ owner_id: ownerId, from, to }),
      });
      if (!r.ok) {
        const err = await r.json().catch(()=>({ error:'bad_response' }));
        throw new Error(err?.error || 'Analyse fehlgeschlagen');
      }
      const j = await r.json();
      if (!j?.ok || j.mode !== 'ai' || !j.data) {
        throw new Error(j?.error || 'Analyse fehlgeschlagen');
      }
      setAiCoach(j.data as CoachData);
      setAiQuicklist(Array.isArray(j.quicklist) ? j.quicklist : []);
    } catch (e:any){
      setAiError(e?.message || 'Analyse fehlgeschlagen');
      setAiCoach(null);
      setAiQuicklist([]);
    } finally {
      setAiLoading(false);
    }
  }, [items.length, ownerId, from, to]);

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
            disabled={aiLoading || items.length===0}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs"
            title="KI-Coaching für den sichtbaren Zeitraum"
          >
            {aiLoading ? 'Analysiere…' : 'KI-Coaching'}
          </button>
        </div>
      </div>

      {/* Fehler */}
      {aiError && <div className="mb-3 text-sm text-red-600">{aiError}</div>}

      {/* Coaching-Panel */}
      {aiCoach && (
        <div className="mb-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-900/20 p-3">
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

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {aiCoach.values.map((v, idx)=> {
              const color = VALUE_COLORS[v.value] || { bg:'bg-gray-50 dark:bg-gray-800/40', text:'text-gray-800 dark:text-gray-200', border:'border-gray-200 dark:border-gray-700' };
              return (
                <div key={idx} className={`rounded-lg border p-3 ${color.bg} ${color.border}`}>
                  <div className={`text-sm font-semibold mb-1 ${color.text}`}>{v.value}</div>

                  {v.praise.length>0 && (
                    <div className="mb-1">
                      <div className="text-xs text-emerald-700 font-medium">Lob</div>
                      <ul className="text-xs list-disc pl-4">
                        {v.praise.slice(0,3).map((p,i)=>(
                          <li key={i}>{p.text}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {v.improve.length>0 && (
                    <div className="mb-1">
                      <div className="text-xs text-amber-700 font-medium">Verbesserung</div>
                      <ul className="text-xs list-disc pl-4">
                        {v.improve.slice(0,3).map((p,i)=>(
                          <li key={i}>{p.text}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {v.tips.length>0 && (
                    <div className="mt-2">
                      <div className="text-xs text-blue-700 font-medium">Tipps / Next Steps</div>
                      <ul className="text-xs list-disc pl-4">
                        {v.tips.slice(0,4).map((t,i)=>(
                          <li key={i}>{t.text}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Schnellliste */}
          {aiQuicklist.length>0 && (
            <div className="mt-3">
              <div className="text-xs text-gray-600 mb-1">Schnellliste (Top-Tipps & -Verbesserungen)</div>
              <div className="flex flex-wrap gap-1.5">
                {aiQuicklist.map((q, i)=>(
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full border bg-white">
                    {q.type === 'tip' ? '💡' : '🔧'} {q.text}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ladezustand */}
      {loading && <div className="text-sm text-gray-500">Lade…</div>}

      {/* Chart + monatlich gruppierte Liste */}
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
                  <Tooltip formatter={(v:any)=>[v,'Vorfälle']} />
                  <Line type="monotone" dataKey="count" dot={false} strokeWidth={2.2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gruppierte Liste */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            {monthGroups.length === 0 && (
              <div className="p-3 text-sm text-gray-500">Keine Einträge im Zeitraum.</div>
            )}
            {monthGroups.map(g => {
              const open = !!openGroups[g.key];
              return (
                <div key={g.key} className="border-b last:border-b-0 border-gray-200 dark:border-gray-800">
                  <button
                    onClick={()=>setOpenGroups(prev=>({ ...prev, [g.key]: !prev[g.key] }))}
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
                      {g.items.map(it=> (
                        <li
                          key={String(it.id)}
                          data-item-id={String(it.id)}
                          className="p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium">
                                {it.category || labelForType(it.incident_type) || '—'}
                              </div>
                              <div className="text-xs text-gray-500 line-clamp-1">{it.description || '—'}</div>
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
                      ))}
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
