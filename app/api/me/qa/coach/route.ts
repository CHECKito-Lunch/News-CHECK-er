// app/api/me/qa/coach/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
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

/* ---------- Request Body (ohne owner_id!) ---------- */
const BodySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

/* ---------- Helpers ---------- */
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

/* ---------- Optionale Zuordnungs-Hints ---------- */
const VALUE_HINTS: Record<string, string[]> = {
  kommunikation: ['Zielgerichtete Kommunikation und Zusammenarbeit'],
  teamwork: ['Zielgerichtete Kommunikation und Zusammenarbeit'],
  lernen: ['Offenheit & Lernbereitschaft'],
  kunden: ['Kundenorientierung'],
  fachlich: ['Fachkompetenz'],
  prozess: ['Excellence in Execution'],
  abschluss: ['Ergebnisorientierung'],
  commitment: ['Commitment'],
};

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

/* ---------- Normalisierung ---------- */
const CANON = VALUE_ENUM as readonly string[];
const normalizeValueName = (raw: any): ValueName | null => {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();

  // schnelle exakte/teilweise Matches
  const direct = CANON.find(v => v.toLowerCase() === s);
  if (direct) return direct as ValueName;

  // heuristiken/alias
  const aliases: Array<[RegExp, ValueName]> = [
    [/kommunikation|zusammenarbeit|collab|team/, 'Zielgerichtete Kommunikation und Zusammenarbeit'],
    [/lern|feedback|offenheit/, 'Offenheit & Lernbereitschaft'],
    [/kunde|customer|service/, 'Kundenorientierung'],
    [/fach|wissen|know|kompetenz/, 'Fachkompetenz'],
    [/excellence|execution|prozess|qualität|qualitätssicherung|ablauf/, 'Excellence in Execution'],
    [/ergebnis|zielerreich|ownership|abschluss|deal/, 'Ergebnisorientierung'],
    [/commitment|zuverläss|verbindlich|initiative/, 'Commitment'],
  ];
  for (const [rx, name] of aliases) {
    if (rx.test(s)) return name;
  }

  // fuzzy contains
  const contains = CANON.find(v => s.includes(v.toLowerCase().split(' ')[0]));
  return (contains as ValueName) || null;
};

/* ---------- Prompt ---------- */
const SYSTEM_PROMPT =
  'Du bist eine Assistenz für Teamleiter:innen und Mitarbeitende bei CHECK24. ' +
  'Analysiere QA-Feedbackeinträge und gib kompaktes, wertschätzendes Coaching-Feedback auf Deutsch in der "Du"-Form. ' +
  'Beziehe dich EXPLIZIT auf die CHECK24-Werte: ' + VALUE_ENUM.join('; ') + '. ' +
  'Antworte NUR als JSON im Schema {values[], incidents_mapped[], summary}. ' +
  'Jeder Stichpunkt: 1 präziser Satz, max. 18 Wörter, keine PII, keine Schuldzuweisungen, lösungsorientiert. ' +
  'Verdichte Redundanzen und formuliere konkrete Micro-Nächste-Schritte in tips[]. ' +
  'Fülle nur dort Inhalte, wo Substanz vorhanden ist (sonst leere Arrays).';

const EXAMPLE_JSON = {
  values: [
    {
      value: 'Kundenorientierung',
      praise: [{ text: 'Du reagierst zügig auf Rückfragen und klärst Anliegen verständlich.' }],
      neutral: [],
      improve: [{ text: 'Du kündigst Bearbeitungszeiten klarer an, um Erwartungen zu steuern.' }],
      tips: [{ text: 'Formuliere SLA-Hinweise in der ersten Antwort.', source: 'generated' }],
    },
  ],
  incidents_mapped: [{ item_id: '123', value: 'Kundenorientierung', why: 'klare Rückmeldung an Kundin' }],
  summary: { overall_tone: 'ausgewogen', quick_wins: ['SLA-Hinweis früh einbauen'], risks: [] },
};

const buildUserPrompt = (payload: { items: any[]; valueHints: Record<string, string[]> }) =>
  [
    'Erzeuge pro Firmenwert ein Objekt {value, praise[], neutral[], improve[], tips[]}.',
    'values DARF auch ein Objekt sein (Keys = Wertnamen). Beispiel-Ausgabe folgt.',
    'Nutze incidents_mapped[] für {item_id, value, why} (why max. 12 Wörter).',
    'Nutze valueHints nur, wenn semantisch passend.',
    'Gib ausschließlich gültiges JSON nach Schema zurück.',
    'Beispiel:',
    JSON.stringify(EXAMPLE_JSON),
    'Daten:',
    JSON.stringify(payload),
  ].join('\n');

/* ---------- Utility: tolerant parsen ---------- */
type P = { text: string; example_item_ids?: Array<string | number> };
type T = P & { source?: 'extracted' | 'generated' };

const toPoints = (arr: any, max = 50): P[] => {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>(); const out: P[] = [];
  for (const it of arr) {
    const text = typeof it === 'string' ? it : typeof it?.text === 'string' ? it.text : null;
    if (!text) continue;
    const t = text.trim(); if (!t || seen.has(t)) continue;
    seen.add(t);
    const ids = Array.isArray(it?.example_item_ids) ? it.example_item_ids : undefined;
    out.push({ text: t, example_item_ids: ids });
    if (out.length >= max) break;
  }
  return out;
};

const ensureTips = (improve: P[], tips?: T[]): T[] => {
  const clean = Array.isArray(tips) ? (toPoints(tips) as T[]) : [];
  if (clean.length) return clean;
  return improve.slice(0, 6).map(p => ({ text: p.text, example_item_ids: p.example_item_ids, source: 'generated' as const }));
};

const pruneEmptyValues = (values: any[]) =>
  values.filter(v =>
    (v.praise?.length ?? 0) > 0 ||
    (v.neutral?.length ?? 0) > 0 ||
    (v.improve?.length ?? 0) > 0 ||
    (v.tips?.length ?? 0) > 0
  );

/* ---- Loose→Strict Mapping (Array ODER Objekt akzeptieren, Names normalisieren) ---- */
function parseValuesLoose(looseValues: any): Array<z.infer<typeof ValueBlock>> {
  const buckets: Record<ValueName, { praise: P[]; neutral: P[]; improve: P[]; tips?: T[] }> = {
    'Zielgerichtete Kommunikation und Zusammenarbeit': { praise:[], neutral:[], improve:[] },
    'Offenheit & Lernbereitschaft': { praise:[], neutral:[], improve:[] },
    'Kundenorientierung': { praise:[], neutral:[], improve:[] },
    'Fachkompetenz': { praise:[], neutral:[], improve:[] },
    'Excellence in Execution': { praise:[], neutral:[], improve:[] },
    'Ergebnisorientierung': { praise:[], neutral:[], improve:[] },
    'Commitment': { praise:[], neutral:[], improve:[] },
  };

  const addBlock = (raw: any, nameFromKey?: string) => {
    const rawName = raw?.value ?? nameFromKey;
    const n = normalizeValueName(rawName);
    if (!n) return;
    const b = buckets[n];
    b.praise.push(...toPoints(raw?.praise));
    b.neutral.push(...toPoints(raw?.neutral));
    b.improve.push(...toPoints(raw?.improve));
    b.tips = ensureTips(b.improve, raw?.tips);
  };

  if (Array.isArray(looseValues)) {
    for (const v of looseValues) addBlock(v);
  } else if (looseValues && typeof looseValues === 'object') {
    for (const [k, v] of Object.entries(looseValues)) addBlock(v, k);
  }

  return (Object.entries(buckets).map(([value, arrs]) => ({
    value: value as ValueName,
    praise: arrs.praise,
    neutral: arrs.neutral,
    improve: arrs.improve,
    tips: ensureTips(arrs.improve, arrs.tips),
  })) as Array<z.infer<typeof ValueBlock>>);
}

/* ---- Komplette Koerzierung inkl. Fallback ---- */
function coerceToCoachResponse(loose: any): CoachResponse {
  // 1) Direkter Versuch gegen Zod
  const direct = CoachResponseSchema.safeParse(loose);
  if (direct.success) {
    const v = direct.data.values.map(vb => ({
      ...vb,
      tips: ensureTips(vb.improve, vb.tips),
    }));
    return { ...direct.data, values: pruneEmptyValues(v) };
  }

  // 2) Versuchen, values lose zu parsen (Array oder Objekt, Namen normalisieren)
  if (Array.isArray(loose?.values) || (loose?.values && typeof loose?.values === 'object')) {
    const values = parseValuesLoose(loose.values);
    const summary = {
      overall_tone: typeof loose?.summary?.overall_tone === 'string' ? loose.summary.overall_tone : undefined,
      quick_wins: Array.isArray(loose?.summary?.quick_wins) ? loose.summary.quick_wins.filter((s: any)=>typeof s==='string').slice(0,10) : [],
      risks: Array.isArray(loose?.summary?.risks) ? loose.summary.risks.filter((s: any)=>typeof s==='string').slice(0,10) : [],
    };
    return {
      values: pruneEmptyValues(values),
      incidents_mapped: Array.isArray(loose?.incidents_mapped) ? loose.incidents_mapped : [],
      summary,
    } as CoachResponse;
  }

  // 3) Minimaler Fallback aus top-level praise/neutral/improve
  const toMini = (arr:any)=> toPoints(arr).slice(0,50);
  const improve = toMini(loose?.improve);
  const block: any = {
    value: 'Excellence in Execution' as ValueName,
    praise: toMini(loose?.praise),
    neutral: toMini(loose?.neutral),
    improve,
    tips: ensureTips(improve),
  };
  return {
    values: pruneEmptyValues([block]),
    incidents_mapped: [],
    summary: { overall_tone: undefined, quick_wins: improve.slice(0,5).map(p=>p.text), risks: [] },
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

    const { from, to, limit } = parsed.data;
    const fromISO = toISODate(from);
    const toISO = toISODate(to);
    const cap = limit ?? 500;

    // Items für den eingeloggten User laden
    let q = sql/*sql*/`
      select id, ts, incident_type, category, severity, description
      from public.qa_incidents
      where user_id = ${me.id}::uuid
    `;
    if (fromISO) q = sql/*sql*/`${q} and ts >= ${fromISO}::date`;
    if (toISO)   q = sql/*sql*/`${q} and ts < (${toISO}::date + interval '1 day')`;
    q = sql/*sql*/`${q} order by ts desc limit ${cap}`;

    const rows = (await q) as Item[];
    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: 'no_items' }, { status: 400 });
    }

    // Für Prompt komprimieren/säubern
    const compact = rows.map((i) => ({
      id: i.id,
      ts: i.ts,
      type: (i.incident_type || '').slice(0, 120),
      category: (i.category || '').slice(0, 120),
      severity: (i.severity || '').slice(0, 60),
      text: (i.description || '').trim().slice(0, 2000),
    }));

    // OpenAI-Aufruf
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt({ items: compact, valueHints: VALUE_HINTS }) },
    ] as const;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
      messages: messages as any,
    });

    const rawOut = completion.choices?.[0]?.message?.content ?? '{}';
    console.log('[me/qa/coach rawOut]', String(rawOut).slice(0, 400));

    // Robust in gültiges Schema überführen
    const data: CoachResponse = coerceToCoachResponse((() => {
      try { return JSON.parse(String(rawOut)); } catch { return {}; }
    })());

    // Quicklist fürs UI
    const quicklist = data.values.flatMap(v => [
      ...v.improve.map(p => ({ value: v.value, type: 'improve' as const, text: p.text, example_item_ids: (p as any).example_item_ids })),
      ...v.tips.map(t => ({ value: v.value, type: 'tip' as const, text: t.text, example_item_ids: (t as any).example_item_ids })),
    ]).slice(0, 50);

    return NextResponse.json({
      ok: true,
      mode: 'ai',
      data: { ...data, values: pruneEmptyValues(data.values) },
      quicklist,
      meta: { from: fromISO, to: toISO, used_items: compact.length },
    });
  } catch (e: any) {
    console.error('[me/qa/coach POST]', e);
    return NextResponse.json(
      { ok: false, error: e?.message || 'Analyse fehlgeschlagen' },
      { status: 500 }
    );
  }
}
