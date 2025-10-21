// app/api/teamhub/qa/coach/route.ts
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

/* ---------- Prompt ---------- */
const SYSTEM_PROMPT =
  'Du bist eine Assistenz für Teamleiter:innen und Mitarbeitende bei CHECK24. ' +
  'Analysiere QA-Feedbackeinträge und gib kompaktes, wertschätzendes Coaching-Feedback auf Deutsch in der "Du"-Form. ' +
  'Beziehe dich EXPLIZIT auf die CHECK24-Werte: ' + VALUE_ENUM.join('; ') + '. ' +
  'Antworte NUR als JSON im Schema {values[], incidents_mapped[], summary}. ' +
  'Jeder Stichpunkt: 1 präziser Satz, max. 18 Wörter, keine PII, keine Schuldzuweisungen, lösungsorientiert. ' +
  'Verdichte Redundanzen und formuliere konkrete Micro-Nächste-Schritte in tips[].';

const buildUserPrompt = (payload: { items: any[]; valueHints: Record<string, string[]> }) =>
  [
    'Erzeuge pro Firmenwert ein Objekt {value, praise[], neutral[], improve[], tips[]}.',
    'Fülle nur dort Inhalte, wo die Items Substanz liefern; sonst arrays leer lassen.',
    'Nutze incidents_mapped[] für {item_id, value, why} (why max. 12 Wörter).',
    'Nutze valueHints nur, wenn sie semantisch passen.',
    'Gib ausschließlich gültiges JSON nach Schema zurück.',
    JSON.stringify(payload),
  ].join('\n');

/* ---------- CORS/Preflight ---------- */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', // bei Bedarf einschränken
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

    // Items des ausgewählten Mitarbeiters serverseitig laden
    let q = sql/*sql*/`
      select id, ts, incident_type, category, severity, description
      from public.qa_incidents
      where user_id = ${owner_id}::uuid
    `;
    if (fromISO) q = sql/*sql*/`${q} and ts >= ${fromISO}::date`;
    if (toISO) q = sql/*sql*/`${q} and ts < (${toISO}::date + interval '1 day')`;
    q = sql/*sql*/`${q} order by ts desc limit ${cap}`;

    const rows = (await q) as Item[];
    if (!rows?.length) {
      return NextResponse.json({ ok: false, error: 'no_items' }, { status: 400 });
    }

    // Für den Prompt kompakt & saniert
    const compact = rows.map((i) => ({
      id: i.id,
      ts: i.ts,
      type: (i.incident_type || '').slice(0, 120),
      category: (i.category || '').slice(0, 120),
      severity: (i.severity || '').slice(0, 60),
      text: (i.description || '').trim().slice(0, 2000),
    }));

    // OpenAI: direkt CoachData-ähnliche Struktur erzeugen
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
    let data: CoachResponse | null = null;
    try {
      const parsedOut = CoachResponseSchema.safeParse(JSON.parse(rawOut));
      if (parsedOut.success) data = parsedOut.data;
    } catch { /* noop */ }

    if (!data) {
      return NextResponse.json({ ok: false, error: 'bad_ai_response' }, { status: 502 });
    }

    // Quicklist fürs UI (Tipps separat generieren können wir später optional ergänzen)
    const quicklist = data.values.flatMap(v => [
      ...v.improve.map(p => ({ value: v.value, type: 'improve' as const, text: p.text, example_item_ids: p.example_item_ids })),
      ...v.tips.map(t => ({ value: v.value, type: 'tip' as const, text: t.text, example_item_ids: t.example_item_ids })),
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
