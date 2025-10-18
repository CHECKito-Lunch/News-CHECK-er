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

  // KI-State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCategories, setAiCategories] = useState<AiCategory[] | null>(null);

  // Load items (Teamhub-API, scoped auf ownerId)
  const load = useCallback(async () => {
    if (!ownerId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try{
      const qs = new URLSearchParams();
      qs.set('owner_id', ownerId);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const r = await authedFetch(`/api/teamhub/qa${qs.toString()?`?${qs.toString()}`:''}`, { cache: 'no-store' });
      const j = await r.json().catch(()=>null);
      setItems(Array.isArray(j?.items)? j.items : []);
    } finally { setLoading(false); }
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
      .sort((a,b) => b[1]-a[1])
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

  // Monatsverlauf (Berlin TZ)
  const byMonth = useMemo(()=>{
    const FE_TZ = 'Europe/Berlin';
    const ymKey = (iso?:string|null)=>{
      if (!iso) return null; const d = new Date(iso); if (isNaN(d.getTime())) return null;
      const z = new Date(d.toLocaleString('en-US', { timeZone: FE_TZ }));
      return `${z.getFullYear()}-${String(z.getMonth()+1).padStart(2,'0')}`;
    };
    const m = new Map<string, number>();
    filteredItems.forEach(i=>{ const k = ymKey(i.ts); if (!k) return; m.set(k,(m.get(k)||0)+1); });
    const arr = [...m.entries()].sort((a,b)=> a[0]<b[0]? -1:1);
    return arr.map(([k,v])=>({ month:k, count:v }));
  },[filteredItems]);

  // Helpers
  const fmtDate = (input?: string | null) => {
    if (!input) return '—';
    const d = new Date(input);
    return isNaN(d.getTime()) ? input : d.toLocaleString('de-DE');
  };

  const boUrl = (n?: string | null) =>
    n && n.trim()
      ? `https://backoffice.reisen.check24.de/booking/search/?booking_id=${encodeURIComponent(n.replace(/\D+/g,''))}`
      : null;

  const toggleType = (t: string) => {
    setTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(t)) {
        next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  };
  const resetTypes = () => setTypeFilter(new Set());

  // KI-Kategorien (nimmt die aktuell sichtbaren Items)
  const runAi = useCallback(async () => {
    if (filteredItems.length === 0) return;
    setAiLoading(true); setAiError(null);
    try{
      const r = await authedFetch('/api/teamhub/qa/ai-categories', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ owner_id: ownerId, items: filteredItems }),
      });
      const j = await r.json().catch(()=>null);
      if (!j?.ok) throw new Error(j?.error || 'Analyse fehlgeschlagen');
      const cats: AiCategory[] = Array.isArray(j.categories) ? j.categories : [];
      setAiCategories(cats.map(c => ({ ...c, label: TYPE_LABELS[c.key] || c.label || c.key })));
    } catch (e:any){
      setAiError(e?.message || 'Analyse fehlgeschlagen');
      setAiCategories(null);
    } finally {
      setAiLoading(false);
    }
  }, [filteredItems, ownerId]);

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 md:p-4">
      {/* Kopf */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-sm font-semibold">
          QA {from || to ? '(gefiltert)' : '(30 Tage)'}
        </div>
        <button
          onClick={runAi}
          disabled={aiLoading || filteredItems.length===0}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs"
          title="KI-Kategorisierung der aktuell sichtbaren Einträge"
        >
          {aiLoading ? 'Analysiere…' : 'KI-Kategorisierung'}
        </button>
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
                    "px-2.5 py-1 rounded-full border text-xs",
                    active
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white dark:bg-white/10 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/20"
                  ].join(' ')}
                  title={`${label} (${count})`}
                >
                  {label} <span className={active ? "opacity-90" : "text-gray-500"}>({count})</span>
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

      {/* KI-Auswertung */}
      {aiError && <div className="mb-3 text-sm text-red-600">{aiError}</div>}
      {aiCategories && aiCategories.length > 0 && (
        <div className="mb-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-900/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">KI-Kategorisierung (sichtbarer Zeitraum)</div>
            <div className="text-xs text-gray-500">{aiCategories.reduce((a,c)=>a+c.count,0)} Einträge</div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {aiCategories.map(cat => (
              <div key={cat.key} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-950">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">{cat.label}</div>
                  <div className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{cat.count}</div>
                </div>
                {cat.reasons.length>0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cat.reasons.map((r,idx)=> (
                      <span key={idx} className="text-xs px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
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
                  {cat.example_ids.length>0 && (
                    <span className="text-[11px] text-gray-500">
                      Beispiele: {cat.example_ids.slice(0,3).map(String).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ladezustand */}
      {loading && <div className="text-sm text-gray-500">Lade…</div>}

      {/* Chart + vollständige Liste */}
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

          {/* Vollständige Liste aller (gefilterten) QA-Einträge */}
          <ul className="divide-y divide-gray-200 dark:divide-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            {(filteredItems||[]).map(it=> (
              <li key={String(it.id)} className="p-3">
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
            {(filteredItems||[]).length===0 && (
              <li className="p-3 text-sm text-gray-500">Keine Einträge im Zeitraum.</li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
