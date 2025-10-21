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

/* ---------- Prompt ---------- */
const SYSTEM_PROMPT =
  'Du bist eine Assistenz für Teamleiter:innen und Mitarbeitende bei CHECK24. ' +
  'Analysiere QA-Feedbackeinträge und gib kompaktes, wertschätzendes Coaching-Feedback auf Deutsch in der "Du"-Form. ' +
  'Beziehe dich EXPLIZIT auf die CHECK24-Werte: ' + VALUE_ENUM.join('; ') + '. ' +
  'Antworte NUR als JSON im Schema {values[], incidents_mapped[], summary}. ' +
  'Jeder Stichpunkt: 1 präziser Satz, max. 18 Wörter, keine PII, keine Schuldzuweisungen, lösungsorientiert. ' +
  'Verdichte Redundanzen und formuliere konkrete Micro-Nächste-Schritte in tips[]. ' +
  'Fülle nur dort Inhalte, wo Substanz vorhanden ist (sonst leere Arrays).';

const buildUserPrompt = (payload: { items: any[]; valueHints: Record<string, string[]> }) =>
  [
    'Erzeuge pro Firmenwert ein Objekt {value, praise[], neutral[], improve[], tips[]}.',
    'Nutze incidents_mapped[] für {item_id, value, why} (why max. 12 Wörter).',
    'Nutze valueHints nur, wenn semantisch passend.',
    'Gib ausschließlich gültiges JSON nach Schema zurück.',
    JSON.stringify(payload),
  ].join('\n');

/* ---------- Utility: Sanitizer & Fallbacks ---------- */
function sanitizeTextArray(arr: any, max = 50): { text: string }[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: { text: string }[] = [];
  for (const t of arr) {
    if (typeof t === 'string') {
      const s = t.trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push({ text: s });
        if (out.length >= max) break;
      }
    } else if (t && typeof (t as any).text === 'string') {
      const s = (t as any).text.trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push({ text: s });
        if (out.length >= max) break;
      }
    }
  }
  return out;
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
  const parsed = CoachResponseSchema.safeParse(loose);
  if (parsed.success) {
    const cleaned = {
      ...parsed.data,
      values: parsed.data.values.map(v => {
        const vv: any = { ...v };
        fillTipsFromImproveIfEmpty(vv);
        return vv;
      })
    };
    return { ...cleaned, values: pruneEmptyValues(cleaned.values) };
  }
  // Fallback: Top-Level praise/neutral/improve in einen Default-Wert kippen
  const praise = sanitizeTextArray(loose?.praise, 50);
  const neutral = sanitizeTextArray(loose?.neutral, 50);
  const improve = sanitizeTextArray(loose?.improve, 50);
  const block: any = {
    value: 'Excellence in Execution' as ValueName,
    praise, neutral, improve, tips: []
  };
  fillTipsFromImproveIfEmpty(block);
  return {
    values: pruneEmptyValues([block]),
    incidents_mapped: [],
    summary: { overall_tone: undefined, quick_wins: improve.slice(0, 5).map(p => p.text), risks: [] },
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

    // OpenAI-Aufruf: direkt CoachData-ähnliche Struktur erzeugen
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
    // Debug nur kurz (Server-Log)
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
      data,
      quicklist,
      meta: {
        from: fromISO,
        to: toISO,
        used_items: compact.length,
      },
    });
  } catch (e: any) {
    console.error('[me/qa/coach POST]', e);
    return NextResponse.json(
      { ok: false, error: e?.message || 'Analyse fehlgeschlagen' },
      { status: 500 }
    );
  }
}
