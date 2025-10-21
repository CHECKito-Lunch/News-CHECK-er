// app/api/teamhub/qa/coach/route.ts
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

type AiSummary = {
  praise: string[];
  neutral: string[];
  improve: string[];
  confidence?: 'low' | 'medium' | 'high';
  token_usage?: { input?: number; output?: number };
};

/* ---- Coach types (für API-Ausgabe) ---- */
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

/* ---------- Helpers ---------- */
const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const toISODate = (d?: string | null) => {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
};

/* ---------- Request Body ---------- */
const BodySchema = z.object({
  owner_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

/* ---------- CORS/Preflight ---------- */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', // ggf. auf Origin einschränken
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

/* ---------- Summary -> CoachData Mapping ---------- */
function summaryToCoachData(s: AiSummary): CoachData {
  const toPts = (arr?: string[]) =>
    (Array.isArray(arr) ? arr : []).filter(Boolean).map((t) => ({ text: t }));

  // Ein einfacher Default-Block (du kannst das später nach Werten aufsplitten)
  const block: CoachValue = {
    value: 'Excellence in Execution',
    praise: toPts(s.praise),
    neutral: toPts(s.neutral),
    improve: toPts(s.improve),
    tips: [], // Hier keine separaten Tipps generiert
  };

  return {
    values: [block],
    summary: {
      overall_tone: undefined,
      quick_wins: (s.improve || []).slice(0, 5),
      risks: [],
    },
    incidents_mapped: [],
  };
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

    // QA-Items des ausgewählten Mitarbeiters laden (serverseitig)
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

    // Kompakt für Prompt (sanitizen + kürzen)
    const compact = rows.map((i) => ({
      id: i.id,
      ts: i.ts,
      type: (i.incident_type || '').slice(0, 120),
      category: (i.category || '').slice(0, 120),
      severity: (i.severity || '').slice(0, 60),
      text: (i.description || '').trim().slice(0, 2000),
    }));

    /* ---------- Prompt ---------- */
    const sys = [
      'Du bist eine Assistenz, die Mitarbeiterfeedback entlang der CHECK24-Firmenwerte analysiert und in wertschätzende, klare und kurze Stichpunkte überführt.',
      'Sprache: Deutsch. Zielgruppe: internes Serviceteam (Führungskraft + Mitarbeiter).',
      'Strukturiere dein Feedback im JSON-Format {"praise":[],"neutral":[],"improve":[]}.',
      'Jeder Stichpunkt bezieht sich implizit auf passende Werte (z. B. Zielgerichtete Kommunikation, Offenheit & Lernbereitschaft, Kundenorientierung, Fachkompetenz, Excellence in Execution, Ergebnisorientierung, Commitment).',
      'Jeder Stichpunkt: 1 präziser Satz, max. 18 Wörter, ohne Schuldzuweisungen/PII, in der "Du"-Form.',
      'Nutze neutrale, motivierende Formulierungen ("könntest", "zeigt", "achtet auf", "unterstützt").',
      'Fasse Redundanzen zusammen, professioneller, lösungsorientierter Ton. Keine Floskeln.',
    ].join(' ');

    const userMsg = [
      'Erzeuge eine kurze Auswertung in drei Kategorien:',
      '1) Was wird gelobt (praise)?',
      '2) Was ist neutral (neutral)?',
      '3) Was ist verbesserungswürdig (improve)?',
      'Leite Punkte aus den folgenden Einträgen ab (QA-Incidents):',
      JSON.stringify({ items: compact }).slice(0, 120_000),
    ].join('\n');

    const resp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userMsg },
      ],
    });

    const rawOut = resp.choices?.[0]?.message?.content || '{}';
    let parsedOut: AiSummary = { praise: [], neutral: [], improve: [] };
    try {
      parsedOut = JSON.parse(rawOut);
    } catch {
      // Falls das LLM nicht korrekt antwortet, bleiben die Listen leer
    }

    // Sanitize
    const sanitize = (arr: any) =>
      Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.trim()).slice(0, 12) : [];

    const summary: AiSummary = {
      praise: sanitize(parsedOut.praise),
      neutral: sanitize(parsedOut.neutral),
      improve: sanitize(parsedOut.improve),
    };

    // === Mapping auf CoachData + Quicklist (Frontend erwartet mode:'ai' + data) ===
    const coachData: CoachData = summaryToCoachData(summary);
    const quicklist = coachData.values
      .flatMap((v) => [
        ...v.improve.map((p) => ({ value: v.value, type: 'improve' as const, text: p.text })),
        ...v.tips.map((t) => ({ value: v.value, type: 'tip' as const, text: t.text })),
      ])
      .slice(0, 50);

    return NextResponse.json({
      ok: true,
      mode: 'ai',
      data: coachData,
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
