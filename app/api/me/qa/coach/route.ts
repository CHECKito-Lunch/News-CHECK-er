// app/api/me/qa/coach/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserFromRequest } from '@/lib/getUserFromRequest';
import { openai } from '@/lib/openai'; // dein vorhandener Client
export const dynamic = 'force-dynamic';

type Item = {
  id: number|string;
  ts?: string | null;
  incident_type?: string | null;
  category?: string | null;
  severity?: string | null;
  description?: string | null;
};

const VALUE_ENUM = [
  'Zielgerichtete Kommunikation und Zusammenarbeit',
  'Offenheit & Lernbereitschaft',
  'Kundenorientierung',
  'Fachkompetenz',
  'Excellence in Execution',
  'Ergebnisorientierung',
  'Commitment',
] as const;

// ===== Prompt (inline) =====
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

// ===== Schema (inline) =====
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

// ===== Heuristik: incident_type -> Werte (überschreibbar) =====
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

// ===== Legacy-Fallback (deine alte Logik) =====
function legacyAggregation(items: Item[]) {
  const byType = new Map<string, { count:number; example_ids:Array<string|number>; reasons:Set<string> }>();
  for (const it of items) {
    const k = (it.incident_type || 'sonstiges').trim() || 'sonstiges';
    const entry = byType.get(k) || { count:0, example_ids:[], reasons:new Set<string>() };
    entry.count += 1;
    if (entry.example_ids.length < 5) entry.example_ids.push(it.id);
    if (it.category) entry.reasons.add(it.category);
    if (it.severity) entry.reasons.add(String(it.severity));
    byType.set(k, entry);
  }
  const categories = [...byType.entries()]
    .sort((a,b)=> b[1].count - a[1].count)
    .map(([key, val]) => ({
      key, label: key,
      count: val.count,
      reasons: [...val.reasons].filter(Boolean).slice(0,8),
      example_ids: val.example_ids,
      confidence: 'medium' as const,
    }));
  return categories;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

    const body = await req.json().catch(()=>null);
    const items: Item[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return NextResponse.json({ ok:false, error:'no_items' }, { status:400 });

    // Eingabe beschränken
    const safeItems = items.slice(0, 500).map(i => ({
      ...i,
      description: (i.description ?? '').slice(0, 2000),
      incident_type: (i.incident_type ?? '').slice(0, 120),
      category: (i.category ?? '').slice(0, 120),
      severity: (i.severity ?? '').slice(0, 60),
    }));

    // Optionaler Modus: ?mode=legacy erzwingt nur Kategorien
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode');

    if (mode === 'legacy') {
      return NextResponse.json({ ok:true, mode:'legacy', categories: legacyAggregation(safeItems) });
    }

    // === OpenAI-Aufruf ===
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt({ items: safeItems, valueHints: VALUE_HINTS }) },
    ];

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: messages as any,
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let data: CoachResponse | null = null;
    try {
      const parsed = CoachResponseSchema.safeParse(JSON.parse(raw));
      if (parsed.success) data = parsed.data;
    } catch { /* noop */ }

    if (!data) {
      // Fallback: alte Kategorien
      return NextResponse.json({
        ok: true,
        mode: 'fallback',
        categories: legacyAggregation(safeItems),
      });
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
      legacy: { categories: legacyAggregation(safeItems) }, // für Kompat-UI nutzbar
    });
  } catch (e:any) {
    console.error('[qa/coach POST]', e);
    return NextResponse.json({ ok:false, error:'internal' }, { status:500 });
  }
}
