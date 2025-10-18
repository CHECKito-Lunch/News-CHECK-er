'use client';
import { useEffect, useMemo, useState } from 'react';

type QaSummary = {
  ok: boolean;
  total: number;
  topIncidentType?: [string, number];
  topAgent?: [string, number];
};

// Anzeige-Labels wie in deiner Einzelansicht
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
  return TYPE_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
};

export default function QAWidget({
  ownerId,
  from,
  to,
}: {
  ownerId?: string;
  from?: string;
  to?: string;
}) {
  const [data, setData] = useState<QaSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // API-URL an Zeitraum + Owner koppeln (falls vorhanden)
  const url = useMemo(() => {
    const qs = new URLSearchParams();
    if (ownerId) qs.set('user_id', ownerId);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return `/api/teamhub/qa${suffix}`;
  }, [ownerId, from, to]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(url, { cache: 'no-store' });
        const j = await r.json();
        if (alive) setData(j as QaSummary);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [url]);

  // Anzeige-Werte
  const total = data?.total ?? 0;
  const topTypeLabel = labelForType(data?.topIncidentType?.[0]);
  const topTypeCount = data?.topIncidentType?.[1] ?? 0;
  const topAgentName = data?.topAgent?.[0] ?? '—';
  const topAgentCount = data?.topAgent?.[1] ?? 0;

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      {/* Header wie bei Feedback-Liste */}
      <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <div className="text-sm font-semibold">QA (Zeitraum)</div>
        <span className="ml-auto text-xs text-gray-500">
          {loading ? 'lädt…' : `${total} Vorfälle`}
        </span>
      </div>

      {/* Inhalt */}
      <div className="p-3 md:p-4">
        {loading && <div className="text-sm text-gray-500">Lade…</div>}
        {!loading && !data?.ok && (
          <div className="text-sm text-red-600">QA konnte nicht geladen werden.</div>
        )}

        {!loading && data?.ok && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Kachel: Gesamt */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
              <div className="text-[11px] text-gray-500">Gesamt (im Zeitraum)</div>
              <div className="text-lg font-semibold">{total}</div>
            </div>

            {/* Kachel: Top-Kategorie */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
              <div className="text-[11px] text-gray-500">Top-Kategorie</div>
              <div className="text-sm font-medium flex items-center gap-2">
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                  {topTypeLabel}
                </span>
                <span className="text-xs text-gray-500">{topTypeCount}</span>
              </div>
            </div>

            {/* Kachel: Top-Agent */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
              <div className="text-[11px] text-gray-500">Top-Agent</div>
              <div className="text-sm font-medium flex items-center gap-2">
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                  {topAgentName}
                </span>
                <span className="text-xs text-gray-500">{topAgentCount}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
