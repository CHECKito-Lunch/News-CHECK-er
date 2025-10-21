/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/teamhub/qa/coach/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { getUserFromRequest } from '@/lib/getUserFromRequest';
import { openai } from '@/lib/openai';

export const dynamic = 'force-dynamic';

/* ---------- DB Types ---------- */
type Item = {
  id: number | string;
  ts?: string | null;
  incident_type?: string | null;
  category?: string | null;
  severity?: string | null;
  description?: string | null;
};

/* ---------- Request Body ---------- */
const BodySchema = z.object({
  owner_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

/* ---------- Helpers ---------- */
const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const toISODate = (d?: string | null) => {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
};

/* ---------- Firmenwerte ---------- */
const VALUE_ENUM = [
  'Zielgerichtete Kommunikation und Zusammenarbeit',
  'Offenheit & Lernbereitschaft',
  'Kundenorientierung',
  'Fachkompetenz',
  'Excellence in Execution',
  'Ergebnisorientierung',
  'Commitment',
] as const;
type ValueName = typeof VALUE_ENUM[number];

/* ---------- Zuordnungs-Hints/Synonyme ---------- */
const VALUE_SYNONYMES: Array<{key: ValueName; hints: string[]}> = [
  { key: 'Zielgerichtete Kommunikation und Zusammenarbeit', hints: ['kommunikation', 'team', 'zusammenarbeit', 'abstimmung', 'handover', 'übergabe', 'kolleg', 'abteilungsübergreifend'] },
  { key: 'Offenheit & Lernbereitschaft', hints: ['lernen', 'lern', 'feedbackfähig', 'reflexion', 'offenheit', 'neugierig', 'verbesserung', 'coaching'] },
  { key: 'Kundenorientierung', hints: ['kunde', 'kundin', 'service', 'freundlich', 'empath', 'zufriedenheit'] },
  { key: 'Fachkompetenz', hints: ['fachlich', 'wissen', 'kompetenz', 'kenntnis', 'regelkenntnis', 'produktwissen'] },
  { key: 'Excellence in Execution', hints: ['prozess', 'prozessqualität', 'sorgfalt', 'präzision', 'qualität', 'dokumentation', 'bearbeitung', 'durchführung'] },
  { key: 'Ergebnisorientierung', hints: ['abschluss', 'zielerreichung', 'conversions', 'output', 'termintreue', 'effizienz'] },
  { key: 'Commitment', hints: ['engagement', 'verantwortung', 'zuverlässig', 'eigentümer', 'ownership', 'initiative', 'einsatz'] },
];

function normalizeValueName(raw: any): ValueName {
  const s = String(raw ?? '').trim();
  if (!s) return 'Excellence in Execution'; // unstrittiger Default
  // 1) exakte Übereinstimmung
  if ((VALUE_ENUM as readonly string[]).includes(s)) return s as ValueName;
  const low = s.toLowerCase();

  // 2) startsWith/Includes auf offizielle Namen
  for (const v of VALUE_ENUM) {
    const vl = v.toLowerCase();
    if (low.startsWith(vl) || low.includes(vl)) return v;
  }

  // 3) Synonym-Heuristik
  for (const { key, hints } of VALUE_SYNONYMES) {
    if (hints.some(h => low.includes(h))) return key;
  }

  // 4) Letzter Fallback
  return 'Excellence in Execution';
}

/* ---------- CoachData Schema (Zod) ---------- */
const Point = z.object({
  text: z.string(),
  example_item_ids: z.array(z.union([z.string(), z.number()])).optional(),
});
const TipPoint = z.object({
  text: z.string(),
  source: z.enum(['extracted', 'generated']).optional(),
  example_item_ids: z.array(z.union([z.string(), z.number()])).optional(),
});
const ValueBlock = z.object({
  value: z.enum(VALUE_ENUM),
  praise: z.array(Point).default([]),
  neutral: z.array(Point).default([]),
  improve: z.array(Point).default([]),
  tips: z.array(TipPoint).default([]),
});
const Summary = z.object({
  overall_tone: z.string().optional(),
  quick_wins: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});
const CoachResponseSchema = z.object({
  values: z.array(ValueBlock),
  incidents_mapped: z.array(
    z.object({
      item_id: z.union([z.string(), z.number()]),
      value: ValueBlock.shape.value,
      why: z.string().optional(),
    })
  ).default([]),
  summary: Summary,
});
type CoachResponse = z.infer<typeof CoachResponseSchema>;

/* ---------- Prompt (mit Beispiel) ---------- */
const SYSTEM_PROMPT =
  'Du bist eine Assistenz für Teamleiter:innen und Mitarbeitende bei CHECK24. ' +
  'Analysiere QA-Feedbackeinträge und gib kompaktes, wertschätzendes Coaching-Feedback auf Deutsch in der "Du"-Form. ' +
  'Beziehe dich EXPLIZIT auf die CHECK24-Werte: ' + VALUE_ENUM.join('; ') + '. ' +
  'Antworte NUR als JSON gemäß Schema: {"values":[{"value":<einer der obigen Werte>,"praise":[],"neutral":[],"improve":[],"tips":[]}],"incidents_mapped":[{"item_id":<id>,"value":<Wert>,"why":<max 12 Wörter>}],"summary":{"overall_tone":string?,"quick_wins":[], "risks":[]}}. ' +
  'Jeder Stichpunkt: 1 präziser Satz, ≤18 Wörter, keine PII/Schuldzuweisungen, lösungsorientiert. ' +
  'Verdichte Redundanzen und formuliere konkrete Micro-Nächste-Schritte in tips[]. ' +
  'Fülle nur dort Inhalte, wo Substanz vorhanden ist (sonst leere Arrays).';

const ONE_SHOT_EXAMPLE = {
  values: [
    {
      value: 'Kundenorientierung',
      praise: [{ text: 'Du reagierst zügig und freundlich auf Nachfragen.' }],
      neutral: [],
      improve: [{ text: 'Du könntest proaktiv Alternativen nennen, wenn eine Option entfällt.' }],
      tips: [{ text: 'Erstelle eine Mini-Liste mit 2–3 Standardalternativen.', source: 'generated' }],
    },
  ],
  incidents_mapped: [{ item_id: 123, value: 'Kundenorientierung', why: 'freundlicher Ton, schnelle Antwort' }],
  summary: { overall_tone: 'überwiegend positiv', quick_wins: ['Alternativen vorbereiten'], risks: [] },
};

const buildUserPrompt = (payload: { items: any[]; valueHints: Record<string, string[]> }) =>
  [
    'Erzeuge pro Firmenwert ein Objekt {value, praise[], neutral[], improve[], tips[]}.',
    'Nutze incidents_mapped[] für {item_id, value, why} (why max. 12 Wörter).',
    'Nutze valueHints nur, wenn semantisch passend.',
    'Gib ausschließlich gültiges JSON nach Schema zurück.',
    'Beispielstruktur (nur Struktur, Inhalte an Items anpassen):',
    JSON.stringify(ONE_SHOT_EXAMPLE),
    'Daten:',
    JSON.stringify(payload),
  ].join('\n');

/* ---------- Parser/Coercer ---------- */
function toPointArray(arr: any): Array<{ text: string; example_item_ids?: Array<string|number> }> {
  if (!Array.isArray(arr)) return [];
  const out: Array<{ text: string; example_item_ids?: Array<string|number> }> = [];
  for (const x of arr) {
    if (typeof x === 'string' && x.trim()) out.push({ text: x.trim() });
    else if (x && typeof x.text === 'string' && x.text.trim())
      out.push({ text: x.text.trim(), example_item_ids: Array.isArray(x.example_item_ids) ? x.example_item_ids : undefined });
  }
  return out.slice(0, 50);
}

function fillTipsFromImproveIfEmpty(v: { improve: { text: string }[]; tips?: any[] }) {
  if (!Array.isArray(v.tips) || v.tips.length === 0) {
    v.tips = v.improve.slice(0, 6).map(p => ({ text: p.text, source: 'generated' as const }));
  }
}

function pruneEmptyValues(values: any[]) {
  return values.filter(v =>
    (Array.isArray(v.praise) && v.praise.length) ||
    (Array.isArray(v.neutral) && v.neutral.length) ||
    (Array.isArray(v.improve) && v.improve.length) ||
    (Array.isArray(v.tips) && v.tips.length)
  );
}

function coerceToCoachResponse(loose: any): CoachResponse {
  // 1) falls bereits korrekt
  const ok = CoachResponseSchema.safeParse(loose);
  if (ok.success) {
    const cleaned = {
      ...ok.data,
      values: ok.data.values.map(v => {
        const vv: any = { ...v };
        fillTipsFromImproveIfEmpty(vv);
        return vv;
      }),
    };
    cleaned.values = pruneEmptyValues(cleaned.values);
    return cleaned;
  }

  // 2) values als Objekt? { "Kundenorientierung": { praise:[], ... }, ... }
  let valuesRaw: any[] = [];
  if (Array.isArray(loose?.values)) {
    valuesRaw = loose.values;
  } else if (loose && typeof loose.values === 'object') {
    valuesRaw = Object.entries(loose.values).map(([key, val]: any) => ({ value: key, ...(val || {}) }));
  }

  // 3) in Value-Blöcke überführen
  const mapped = valuesRaw.map((v) => {
    const value: ValueName = normalizeValueName(v?.value);
    const praise = toPointArray(v?.praise);
    const neutral = toPointArray(v?.neutral);
    const improve = toPointArray(v?.improve);
    let tips = toPointArray(v?.tips).map(t => ({ ...t, source: 'extracted' as const }));
    const block: any = { value, praise, neutral, improve, tips };
    fillTipsFromImproveIfEmpty(block);
    return block;
  });

  // 4) wenn trotzdem leer, aus Top-Level versuchen (manche Modelle legen die Arrays oben ab)
  if (mapped.length === 0) {
    const fallbackValue: ValueName = 'Excellence in Execution';
    const praise = toPointArray(loose?.praise);
    const neutral = toPointArray(loose?.neutral);
    const improve = toPointArray(loose?.improve);
    let tips = toPointArray(loose?.tips).map(t => ({ ...t, source: 'extracted' as const }));
    const block: any = { value: fallbackValue, praise, neutral, improve, tips };
    fillTipsFromImproveIfEmpty(block);
    valuesRaw = [block];
  }

  const values = pruneEmptyValues(mapped.length ? mapped : valuesRaw);

  const summary = {
    overall_tone: typeof loose?.summary?.overall_tone === 'string' ? loose.summary.overall_tone : undefined,
    quick_wins: Array.isArray(loose?.summary?.quick_wins) ? loose.summary.quick_wins.filter((x: any) => typeof x === 'string' && x.trim()).slice(0, 12) : [],
    risks: Array.isArray(loose?.summary?.risks) ? loose.summary.risks.filter((x: any) => typeof x === 'string' && x.trim()).slice(0, 12) : [],
  };

  const incidents_mapped = Array.isArray(loose?.incidents_mapped)
    ? loose.incidents_mapped
        .map((m: any) => ({
          item_id: m?.item_id,
          value: normalizeValueName(m?.value),
          why: typeof m?.why === 'string' ? m.why.slice(0, 120) : undefined,
        }))
        .filter((m: any) => m.item_id != null)
    : [];

  // final validieren
  const finalCandidate = { values, incidents_mapped, summary };
  const final = CoachResponseSchema.safeParse(finalCandidate);
  if (final.success) return final.data;

  // ultimatives Fallback: Minimalstruktur
  return {
    values: values.length ? (values as any) : [{
      value: 'Excellence in Execution',
      praise: [], neutral: [], improve: [{ text: 'Keine eindeutigen Schwerpunkte erkannt – prüfe Beispiele für konkrete Hinweise.' }],
      tips: [{ text: 'Starte mit 1–2 Quick Wins aus den letzten Fällen.', source: 'generated' }],
    }],
    incidents_mapped: [],
    summary: { overall_tone: undefined, quick_wins: [], risks: [] },
  };
}

/* ---------- CORS/Preflight ---------- */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function GET() {
  return new NextResponse('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST, OPTIONS' },
  });
}

/* ---------- POST ---------- */
export async function POST(req: NextRequest) {
  try {
    const me = await getUserFromRequest(req);
    if (!me) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'invalid_body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { owner_id, from, to, limit } = parsed.data;
    if (!isUUID(owner_id)) {
      return NextResponse.json({ ok: false, error: 'invalid_owner_id' }, { status: 400 });
    }

    const fromISO = toISODate(from);
    const toISO = toISODate(to);
    const cap = limit ?? 500;

    // Items laden
    let q = sql/*sql*/`
      select id, ts, incident_type, category, severity, description, booking_number_hash
      from public.qa_incidents
      where user_id = ${owner_id}::uuid
    `;
    if (fromISO) q = sql/*sql*/`${q} and ts >= ${fromISO}::date`;
    if (toISO)   q = sql/*sql*/`${q} and ts < (${toISO}::date + interval '1 day')`;
    q = sql/*sql*/`${q} order by ts desc limit ${cap}`;

    const rows = (await q) as Item[];
    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: 'no_items' }, { status: 400 });
    }

    const compact = rows.map((i) => ({
      id: i.id,
      ts: i.ts,
      type: (i.incident_type || '').slice(0, 120),
      category: (i.category || '').slice(0, 120),
      severity: (i.severity || '').slice(0, 60),
      text: (i.description || '').trim().slice(0, 2000),
    }));

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt({ items: compact, valueHints: Object.fromEntries(VALUE_SYNONYMES.map(v => [v.key, v.hints])) }) },
    ] as const;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
      messages: messages as any,
    });

    const rawOut = completion.choices?.[0]?.message?.content ?? '{}';
    // zum Debuggen kurz loggen:
    console.log('[qa/coach rawOut]', String(rawOut).slice(0, 400));

    const parsedOut = (() => { try { return JSON.parse(String(rawOut)); } catch { return {}; } })();
    const data: CoachResponse = coerceToCoachResponse(parsedOut);

    const quicklist = data.values.flatMap(v => [
      ...v.improve.map(p => ({ value: v.value, type: 'improve' as const, text: p.text, example_item_ids: (p as any).example_item_ids })),
      ...v.tips.map(t => ({ value: v.value, type: 'tip' as const, text: t.text, example_item_ids: (t as any).example_item_ids })),
    ]).slice(0, 50);

    return NextResponse.json({
      ok: true,
      mode: 'ai',
      data,
      quicklist,
      meta: {
        owner_id,
        from: fromISO,
        to: toISO,
        used_items: compact.length,
      },
    });
  } catch (e: any) {
    console.error('[teamhub/qa/coach POST]', e);
    return NextResponse.json(
      { ok: false, error: e?.message || 'Analyse fehlgeschlagen' },
      { status: 500 }
    );
  }
}
