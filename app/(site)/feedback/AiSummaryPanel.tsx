/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useMemo, useState } from 'react';

/** Typen */
export type FeedbackItem = {
  id: string | number;
  feedbacktyp: string;
  feedback_ts?: string | null;
  ts?: string | null;
  kommentar?: string | null; // = comment_raw
  bewertung?: number | null;
  beraterfreundlichkeit?: number | null;
  beraterqualifikation?: number | null;
  angebotsattraktivitaet?: number | null;
};

export type AiSummary = {
  praise: string[];
  neutral: string[];
  improve: string[];
  confidence?: 'low' | 'medium' | 'high';
  token_usage?: { input?: number; output?: number };
};

/** Helpers Zeit */
const FE_TZ = 'Europe/Berlin';
const getTs = (f: FeedbackItem): string | null =>
  (f as any).feedback_ts || (f as any).ts || null;

const ymdBerlin = (d: Date) => {
  const z = new Date(d.toLocaleString('en-US', { timeZone: FE_TZ }));
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, '0');
  const dd = String(z.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

export function AiSummaryPanel({
  items,
  from,
  to,
}: {
  items: FeedbackItem[];
  from: string;
  to: string;
}) {
  /** Channels ableiten */
  const allChannels = useMemo(() => {
    const s = new Set<string>();
    (items || []).forEach((i) => i.feedbacktyp && s.add(i.feedbacktyp));
    return Array.from(s).sort();
  }, [items]);

  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiSummary | null>(null);

  /** Clientseitig filtern */
  const filtered = useMemo(() => {
    const inDate = (iso: string | null) => {
      if (!iso) return false;
      const day = ymdBerlin(new Date(iso));
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    };
    return (items ?? []).filter(
      (i) =>
        (!selected.length || selected.includes(i.feedbacktyp)) &&
        inDate(getTs(i as any)),
    );
  }, [items, selected, from, to]);

  /** API-Call */
  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        channels: selected,
        from,
        to,
        items: filtered.map((i) => ({
          id: i.id,
          feedbacktyp: i.feedbacktyp,
          ts: getTs(i),
          kommentar: (i.kommentar || '').slice(0, 4000),
          bewertung: i.bewertung,
          beraterfreundlichkeit: i.beraterfreundlichkeit,
          beraterqualifikation: i.beraterqualifikation,
          angebotsattraktivitaet: i.angebotsattraktivitaet,
        })),
      };

      const r = await fetch('/api/me/feedback/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as {
        ok: boolean;
        summary?: AiSummary;
        error?: string;
      };
      if (!j.ok) throw new Error(j.error || 'Unbekannter Fehler');
      setResult(j.summary || null);
    } catch (e: any) {
      setError(e?.message || 'Fehler bei der KI-Analyse');
    } finally {
      setLoading(false);
    }
  }

  /** UI */
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-900 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="font-medium">KI-Zusammenfassung (wertschätzend)</div>
        <div className="text-xs text-gray-500">
          Wähle Channels & Zeitraum, dann Analyse starten.
        </div>
      </div>

      {/* Channel Auswahl */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {allChannels.map((ch) => {
          const active = selected.includes(ch);
          return (
            <button
              key={ch}
              type="button"
              onClick={() =>
                setSelected((prev) =>
                  prev.includes(ch) ? prev.filter((x) => x !== ch) : [...prev, ch],
                )
              }
              className={[
                'text-[12px] px-2 py-1 rounded-full border transition-colors',
                active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-transparent text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700',
              ].join(' ')}
            >
              {ch}
            </button>
          );
        })}
        {allChannels.length === 0 && (
          <span className="text-sm text-gray-500">Keine Channels vorhanden.</span>
        )}
      </div>

      {/* Action */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={loading || filtered.length === 0}
          className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-60"
        >
          {loading ? 'Analysiere…' : 'KI-Analyse starten'}
        </button>
        <div className="text-xs text-gray-500">
          {filtered.length} Feedbacks im gewählten Filter
        </div>
      </div>

      {/* Fehler */}
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}

      {/* Ergebnis */}
      {result && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SummaryCard title="Was wird gelobt?" items={result.praise} tone="positive" />
          <SummaryCard title="Was ist neutral?" items={result.neutral} tone="neutral" />
          <SummaryCard
            title="Was ist verbesserungswürdig?"
            items={result.improve}
            tone="warning"
          />
        </div>
      )}
    </div>
  );
}

/** kleine Hilfskomponente */
function SummaryCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone?: 'positive' | 'neutral' | 'warning';
}) {
  const toneClass =
    tone === 'positive'
      ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-900/10'
      : tone === 'warning'
      ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-900/10'
      : 'border-gray-200 bg-gray-50/60 dark:border-gray-800 dark:bg-gray-800/30';

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="text-sm font-semibold mb-2">{title}</div>
      {items && items.length > 0 ? (
        <ul className="list-disc pl-5 space-y-1 text-sm">
          {items.map((s, i) => (
            <li key={i} className="leading-snug">
              {s}
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-gray-500">Keine Punkte erkannt.</div>
      )}
    </div>
  );
}

export default AiSummaryPanel;
