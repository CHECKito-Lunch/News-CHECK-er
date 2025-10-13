import React, { useMemo, useState } from 'react';


// Typen aus deinem Code übernommen/vereinfacht
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


// Hilfsfunktionen (wie in deinem File)
const FE_TZ = 'Europe/Berlin';
const getTs = (f: FeedbackItem): string | null => (f as any).feedback_ts || (f as any).ts || null;
const ymdBerlin = (d: Date) => {
const z = new Date(d.toLocaleString('en-US', { timeZone: FE_TZ }));
const y = z.getFullYear();
const m = String(z.getMonth() + 1).padStart(2, '0');
const dd = String(z.getDate()).padStart(2, '0');
return `${y}-${m}-${dd}`;
};


// Ergebnisformat vom API
export type AiSummary = {
praise: string[];
neutral: string[];
improve: string[];
confidence?: 'low' | 'medium' | 'high';
token_usage?: { input?: number; output?: number };
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
// verfügbare Channels ableiten
const allChannels = useMemo(() => {
const s = new Set<string>();
(items || []).forEach((i) => i.feedbacktyp && s.add(i.feedbacktyp));
return Array.from(s).sort();
}, [items]);


const [selected, setSelected] = useState<string[]>([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [result, setResult] = useState<AiSummary | null>(null);


// Client-seitig filtern (wir übergeben gefilterte Items an die API)
const filtered = useMemo(() => {
const inDate = (iso: string | null) => {
if (!iso) return false;
const day = ymdBerlin(new Date(iso));
if (from && day < from) return false;
if (to && day > to) return false;
return true;
};
return (items || []).filter((i) =>
}