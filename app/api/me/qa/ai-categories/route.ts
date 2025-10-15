/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

/** Ausgabetyp */
type AiCategory = {
  key: string;                // kanonischer Schlüssel (EN snake_case)
  label: string;              // deutsches Label für UI
  count: number;              // Anzahl Items im Bucket
  reasons: string[];          // kurze Begründungen/Pattern
  example_ids: Array<string | number>; // bis zu 5 Beispiel-IDs
  confidence?: 'low' | 'medium' | 'high';
};

type AiResult = {
  categories: AiCategory[];
  token_usage?: { input?: number; output?: number };
};

/** Same mapping wie auf der User-Seite (Anzeige bleibt DE, Keys stabil EN) */
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

const ALLOWED_KEYS = Object.keys(TYPE_LABELS);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Keine Items übermittelt.' },
        { status: 400 },
      );
    }

    // Kompakt + sicher (nur das Nötigste an Kontext)
    const compact = items.map((i: any) => ({
      id: i.id,
      ts: i.ts ?? null,
      // vorhandener Typ/Category gern nutzen, aber KI soll validieren/vereinheitlichen
      incident_type: (i.incident_type || '').toString(),
      category: (i.category || '').toString(),
      text: (i.description || '').toString().trim(),
    }));

    // Systemprompt: deutsch, feste Zielkategorien
    const sys = [
      'Du bist eine Assistenz, die QA-Fehlerberichte bündelt und klaren Kategorien zuordnet.',
      'Sprache: Deutsch. Output ausschließlich als JSON (keine Erklärtexte).',
      `Erlaube nur diese Kategorie-Keys: ${ALLOWED_KEYS.join(', ')}.`,
      'Wenn nichts sinnvoll passt, nutze "sonstiges".',
      'Mappe ähnliche Schreibweisen (z.B. Umbuchung ↔ booking_transfer) auf den passenden Key.',
      'Fasse identische Muster zusammen. Belege jede Kategorie mit 1–3 kurzen Gründen/Pattern (Stichpunkte, max. 12 Wörter).',
      'Wähle bis zu 5 repräsentative example_ids je Kategorie.',
      'Setze confidence grob auf low/medium/high je nachdem, wie eindeutig die Zuordnung ist.',
      'JSON-Schema: {"categories":[{"key":"","label":"","count":0,"reasons":[],"example_ids":[],"confidence":"medium"}]}.',
    ].join(' ');

    // Userprompt: kompaktes Material (hart gekappt)
    const user = [
      'Ordne die folgenden Einträge den erlaubten Kategorie-Keys zu.',
      'Nutze vorhandene incident_type/category als Hinweis, aber entscheide konsistent.',
      JSON.stringify({ items: compact }).slice(0, 120_000),
    ].join('\n');

    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    });

    const raw = resp.choices?.[0]?.message?.content || '{"categories":[]}';
    let parsed: AiResult = { categories: [] };
    try { parsed = JSON.parse(raw); } catch { /* noop */ }

    // Sanitisieren + Label anwenden + auf erlaubte Keys filtern
    const cleanCats: AiCategory[] = Array.isArray(parsed.categories) ? parsed.categories : [];
    const normalizedObj: Record<string, AiCategory> = cleanCats
      .map((c) => {
        const key = String(c?.key || '').trim();
        const safeKey = ALLOWED_KEYS.includes(key) ? key : 'sonstiges';
        const reasons = Array.isArray(c?.reasons)
          ? c.reasons.filter((s) => typeof s === 'string' && s.trim()).slice(0, 5)
          : [];
        const examples = Array.isArray(c?.example_ids)
          ? c.example_ids.slice(0, 5)
          : [];
        const count = Number.isFinite(c?.count) ? Number(c.count) : examples.length || 0;

        return {
          key: safeKey,
          label: TYPE_LABELS[safeKey] || safeKey,
          count,
          reasons,
          example_ids: examples,
          confidence: (['low','medium','high'] as const).includes(c?.confidence as any)
            ? (c.confidence as 'low'|'medium'|'high')
            : undefined,
        };
      })
      // evtl. doppelte Keys mergen
      .reduce<Record<string, AiCategory>>((acc, cat) => {
        const ex = acc[cat.key];
        if (!ex) { acc[cat.key] = { ...cat }; }
        else {
          ex.count += cat.count;
          ex.reasons = Array.from(new Set([...ex.reasons, ...cat.reasons])).slice(0, 5);
          ex.example_ids = Array.from(new Set([...ex.example_ids, ...cat.example_ids])).slice(0, 5);
          // konservative confidence: nimm die niedrigere
          const rank = { low:1, medium:2, high:3 } as const;
          if (ex.confidence && cat.confidence) {
            ex.confidence = rank[ex.confidence] <= rank[cat.confidence] ? ex.confidence : cat.confidence;
          } else {
            ex.confidence = ex.confidence || cat.confidence;
          }
        }
        return acc;
      }, {});
    const normalized: AiCategory[] = Object.values(normalizedObj);
    
    const out: AiResult = {
      categories: normalized.sort((a,b)=> b.count - a.count),
      token_usage: {
        input: (resp?.usage as any)?.prompt_tokens,
        output: (resp?.usage as any)?.completion_tokens,
      },
    };

    return NextResponse.json({ ok: true, ...out });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Kategorisierung fehlgeschlagen' },
      { status: 500 },
    );
  }
}
