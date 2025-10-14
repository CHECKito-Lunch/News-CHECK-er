/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

/** Lokaler Typ – nur für die Route nötig */
type AiSummary = {
  praise: string[];
  neutral: string[];
  improve: string[];
  confidence?: 'low' | 'medium' | 'high';
  token_usage?: { input?: number; output?: number };
};

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

    // Kommentare + Kontext komprimieren
    const compact = items.map((i: any) => ({
      id: i.id,
      type: i.feedbacktyp,
      ts: i.ts,
      rating: i.bewertung ?? null,
      f: i.beraterfreundlichkeit ?? null,
      q: i.beraterqualifikation ?? null,
      o: i.angebotsattraktivitaet ?? null,
      text: (i.kommentar || '').trim(),
    }));

const sys = [
  'Du bist eine Assistenz, die Mitarbeiterfeedback entlang der CHECK24-Firmenwerte analysiert und in wertschätzende, klare und kurze Stichpunkte überführt.',
  'Sprache: Deutsch. Zielgruppe: internes Serviceteam (Führungskraft + Mitarbeiter).',
  'Strukturiere dein Feedback im JSON-Format {"praise":[],"neutral":[],"improve":[]}.',
  'Jeder Stichpunkt bezieht sich auf mindestens einen der folgenden Werte: Zielgerichtete Kommunikation, Offenheit & Lernbereitschaft, Kundenorientierung, Fachkompetenz, Excellence in Execution, Ergebnisorientierung, Commitment.',
  'Jeder Stichpunkt soll 1 präziser Satz sein, maximal 18 Wörter, ohne Schuldzuweisungen oder personenbezogene Daten.',
  'Sprich in der "Du"-Form (direktes, respektvolles Feedback an den Mitarbeiter).',
  'Verwende neutrale, motivierende Formulierungen ("könntest", "zeigt", "achtet auf", "unterstützt").',
  'Fasse Redundanzen zusammen, halte den Ton professionell, lösungsorientiert und positiv. Keine Floskeln, kein künstliches Lob.',
].join(' ');

const user = [
  'Erzeuge eine kurze Auswertung in drei Kategorien:',
  '1) Was wird gelobt (praise)?',
  '2) Was ist neutral (neutral)?',
  '3) Was ist verbesserungswürdig (improve)?',
  'Berücksichtige dabei die CHECK24-Verhaltensanker und leite sie aus den folgenden Einträgen ab:',
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

    const raw = resp.choices?.[0]?.message?.content || '{}';
    let parsed: AiSummary = { praise: [], neutral: [], improve: [] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      // falls das LLM unerwartet antwortet, bleiben wir bei leeren Listen
    }

    // Sanitisieren
    const sanitize = (arr: any) =>
      Array.isArray(arr)
        ? arr.filter((x) => typeof x === 'string' && x.trim()).slice(0, 12)
        : [];

    const out: AiSummary = {
      praise: sanitize(parsed.praise),
      neutral: sanitize(parsed.neutral),
      improve: sanitize(parsed.improve),
    };

    return NextResponse.json({ ok: true, summary: out });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Analyse fehlgeschlagen' },
      { status: 500 },
    );
  }
}
