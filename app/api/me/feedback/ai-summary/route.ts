/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';


const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


export async function POST(req: NextRequest) {
try {
const body = await req.json();
const items = Array.isArray(body?.items) ? body.items : [];
if (items.length === 0) {
return NextResponse.json({ ok: false, error: 'Keine Items übermittelt.' }, { status: 400 });
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
'Du bist eine Assistenz, die Kundenfeedback wertschätzend, neutral und präzise zu kurzen Stichpunkten zusammenfasst.',
'Sprache: Deutsch. Zielgruppe: internes Serviceteam.',
'Gib ausschließlich JSON zurück im Format {"praise":[],"neutral":[],"improve":[]}.',
'Jeder Bulletpunkt sollte 1 Satz sein, maximal ~18 Wörter, keine Schuldzuweisung, keine personenbezogenen Daten.',
'Nutze neutrale Begriffe (z.B. "könnte" statt "muss"). Fasse Redundanzen zusammen.',
].join(' ');


const user = [
'Erzeuge eine kurze Auswertung in drei Kategorien: 1) Was wird gelobt? 2) Was ist neutral? 3) Was ist verbesserungswürdig?',
'Nutze die folgenden Einträge (JSON):',
JSON.stringify({ items: compact }).slice(0, 120_000), // Sicherheitsgrenze
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
try { parsed = JSON.parse(raw); } catch {}


// Sanitisieren
const sanitize = (arr: any) => Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.trim()).slice(0, 12) : [];
const out: AiSummary = {
praise: sanitize(parsed.praise),
neutral: sanitize(parsed.neutral),
improve: sanitize(parsed.improve),
};


return NextResponse.json({ ok: true, summary: out });
} catch (e: any) {
return NextResponse.json({ ok: false, error: e?.message || 'Analyse fehlgeschlagen' }, { status: 500 });
}
}