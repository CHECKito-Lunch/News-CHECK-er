// app/api/teamhub/coach/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { getUserFromRequest } from '@/lib/getUserFromRequest';
import { openai } from '@/lib/openai';

export const dynamic = 'force-dynamic';

/* ---------- Types ---------- */
type Item = {
  id: number | string;
  ts?: string | null;
  incident_type?: string | null;
  category?: string | null;
  severity?: string | null;
  description?: string | null;
};

/* ---------- Helpers ---------- */
const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

function toISODate(d: string | null | undefined): string | null {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

/* ---------- Werte ---------- */
const VALUE_ENUM = [
  'Zielgerichtete Kommunikation und Zusammenarbeit',
  'Offenheit & Lernbereitschaft',
  'Kundenorientierung',
  'Fachkompetenz',
  'Excellence in Execution',
  'Ergebnisorientierung',
  'Commitment',
] as const;

/* ---------- Prompt ---------- */
const SYSTEM_PROMPT =
  'Du bist eine Assistenz für Teamleiter:innen und Mitarbeitende bei CHECK24. ' +
  'Analysiere Feedbackeinträge und gib prägnantes, wertschätzendes Coaching-Feedback in "Du"-Form. ' +
  'Beziehe dich auf die CHECK24-Werte: ' + VALUE_ENUM.join('; ') + '. ' +
  'Liefere NUR JSON nach Schema. Max. ~18 Wörter pro Bullet, keine PII oder Schuldzuweisungen. ' +
  'Nutze vorhandene Tipps aus dem Text, verdichte sie, dedupliziere, ergänze kleine nächste Schritte, wo sinnvoll. ' +
  'Optional: example_item_ids als Belege.';

const buildUserPrompt = (payload: { items: Item[]; valueHints: Record<string,string[]> }) =>
  [
    'Erzeuge eine Auswertung mit Lob, neutralen Beobachtungen, Verbesserungsfeldern und konkreten Tipps pro Firmenwert.',
    'Nutze die Items (JSON) und vorhandene Tipps im Text. Verdichte Redundanzen.',
    'Wenn ein Item keinem Wert klar zuzuordnen ist, nutze deine beste Zuordnung und erläutere kurz im Feld "why".',
    JSON.stringify(payload),
  ].join('\n');

/* ---------- Schema ---------- */
const Point = z.object({
  text: z.string(),
  example_item_ids: z.array(z.union([z.string(), z.number()])).optional(),
});
const TipPoint = z.object({
  text: z.string(),
  source: z.enum(['extracted','generated']).optional(),
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
  incidents_mapped: z.array(z.object({
    item_id: z.union([z.string(), z.number()]),
    value: ValueBlock.shape.value,
    why: z.string().optional(),
  })).default([]),
  summary: Summary,
});
type CoachResponse = z.infer<typeof CoachResponseSchema>;

/* ---------- Heuristik-Hints (optional) ---------- */
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

/* ---------- Request Body ---------- */
const BodySchema = z.object({
  owner_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(), // Hard-Cap
});

/* ---------- Handlers ---------- */
export async function POST(req: NextRequest) {
  try {
    const me = await getUserFromRequest(req);
    if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

    // Nur JSON akzeptieren (hilft gegen versehentliche GET/Form-Aufrufe)
    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return NextResponse.json({ ok:false, error:'unsupported_media_type' }, { status:415 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ ok:false, error:'invalid_body', details: parsed.error.flatten() }, { status:400 });
    }

    const { owner_id, from, to, limit } = parsed.data;
    if (!isUUID(owner_id)) {
      return NextResponse.json({ ok:false, error:'invalid_owner_id' }, { status:400 });
    }

    const fromISO = toISODate(from);
    const toISO   = toISODate(to);
    const cap = limit ?? 500;

    // Items des ausgewählten Mitarbeiters (serverseitig, vertrauenswürdig)
    let q = sql/*sql*/`
      select id, ts, incident_type, category, severity, description
      from public.qa_incidents
      where user_id = ${owner_id}::uuid
    `;
    if (fromISO) q = sql/*sql*/`${q} and ts >= ${fromISO}::date`;
    if (toISO)   q = sql/*sql*/`${q} and ts < (${toISO}::date + interval '1 day')`;
    q = sql/*sql*/`${q} order by ts desc limit ${cap}`;

    const rows = await q as Item[];
    if (!rows?.length) {
      return NextResponse.json({ ok:false, error:'no_items' }, { status:400 });
    }

    // Sanitizing/Truncation
    const safeItems: Item[] = rows.slice(0, cap).map(i => ({
      ...i,
      description: (i.description ?? '').slice(0, 2000),
      incident_type: (i.incident_type ?? '').slice(0, 120),
      category: (i.category ?? '').slice(0, 120),
      severity: (i.severity ?? '').slice(0, 60),
    }));

    // === OpenAI ===
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt({ items: safeItems, valueHints: VALUE_HINTS }) },
    ] as const;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: messages as any,
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content ?? '{}';
    let data: CoachResponse | null = null;
    try {
      const parsedOut = CoachResponseSchema.safeParse(JSON.parse(content));
      if (parsedOut.success) data = parsedOut.data;
    } catch { /* noop */ }

    if (!data) {
      return NextResponse.json({ ok:false, error:'bad_ai_response' }, { status:502 });
    }

    // Quicklist für UI
    const quicklist = data.values.flatMap(v => [
      ...v.improve.map(p => ({ value: v.value, type: 'improve' as const, text: p.text, example_item_ids: p.example_item_ids })),
      ...v.tips.map(t => ({ value: v.value, type: 'tip' as const, text: t.text, example_item_ids: t.example_item_ids })),
    ]).slice(0, 50);

    return NextResponse.json({
      ok: true,
      mode: 'ai',
      data,
      quicklist,
      meta: { owner_id, from: fromISO, to: toISO, used_items: safeItems.length },
    }, { status: 200, headers: { 'content-type':'application/json; charset=utf-8', 'Allow':'POST, OPTIONS' }});
  } catch (e:any) {
    console.error('[teamhub/coach POST]', e);
    return NextResponse.json({ ok:false, error:'internal' }, { status:500 });
  }
}

// Verbiete GET explizit (verhindert “harte” 405 im Browser, liefert klare JSON-Antwort)
export async function GET() {
  return new Response(JSON.stringify({ ok:false, error:'method_not_allowed', allow:['POST','OPTIONS'] }), {
    status: 405,
    headers: { 'content-type':'application/json; charset=utf-8', 'Allow':'POST, OPTIONS' },
  });
}

// OPTIONS für Preflight-Anfragen (falls Header o. Wrapper das auslösen)
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Allow':'POST, OPTIONS',
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'content-type',
    }
  });
}
