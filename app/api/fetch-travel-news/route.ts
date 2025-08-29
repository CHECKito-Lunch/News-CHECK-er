// app/api/fetch-travel-news/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // nur hier (Server) verwenden!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const dynamic = 'force-dynamic';

type RawArticle = { title: string; url: string; publishedAt?: string; source?: { name?: string } };

export async function GET() {
  // 1) Keywords laden
  const { data: kws, error: kwErr } = await supabase
    .from('travel_news_keywords')
    .select('term, lang')
    .eq('enabled', true);
  if (kwErr) return NextResponse.json({ error: kwErr.message }, { status: 400 });

  const terms = (kws ?? []).map(k => k.term).filter(Boolean);
  if (terms.length === 0) {
    await supabase.from('travel_news_runs').insert({ keywords: [], inserted: 0, provider: 'none', notes: 'no active keywords' });
    return NextResponse.json({ inserted: 0, note: 'no active keywords' });
  }

  // 2) News-Provider (Beispiel: NewsAPI)
  const q = encodeURIComponent(terms.map(t => `"${t}"`).join(' OR '));
  const url = `https://newsapi.org/v2/everything?q=${q}&language=de&sortBy=publishedAt&pageSize=20&apiKey=${process.env.NEWS_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const txt = await resp.text();
    return NextResponse.json({ error: `NewsAPI error: ${txt}` }, { status: 502 });
  }
  const payload = await resp.json();
  const raw: RawArticle[] = payload.articles ?? [];
  if (raw.length === 0) {
    await supabase.from('travel_news_runs').insert({ keywords: terms, inserted: 0, provider: 'newsapi', notes: 'no articles' });
    return NextResponse.json({ inserted: 0 });
  }

  // 3) mit ChatGPT strukturieren (JSON!)
  const system = `Du bist News-Analyst für die Reisebranche. Extrahiere pro Artikel eine prägnante Zusammenfassung (2 Sätze) und, falls vorhanden, die konkrete Auswirkung (Impact) für Reisende/Branche (z.B. Streik, Flughafen, Zeitraum). Antworte als JSON mit einem Feld "items": Array von {headline, summary, impact, source_url, published_at}. Nutze deutsche Sprache.`;
  const user = raw.map(a => `- ${a.title} (${a.url})`).join('\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' }, // zwinge JSON
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Artikel:\n${user}` }
    ],
    temperature: 0.2,
  });

  let items: Array<{ headline: string; summary: string; impact?: string; source_url: string; published_at?: string }> = [];
  try {
    const json = JSON.parse(completion.choices[0].message?.content || '{}');
    items = Array.isArray(json.items) ? json.items : [];
  } catch {
    // Fallback: im Zweifel Rohartikel ohne Zusammenfassung
    items = raw.map(a => ({ headline: a.title, summary: '', source_url: a.url, published_at: a.publishedAt }));
  }

  // 4) speichern (Upsert via unique index auf source_url)
  let inserted = 0;
  for (const it of items) {
    const { error } = await supabase.from('travel_news').insert({
      headline: it.headline,
      summary: it.summary,
      impact: it.impact ?? null,
      source_url: it.source_url,
      published_at: it.published_at ?? null,
      provider: 'newsapi',
    }).select().single();
    if (!error) inserted += 1;
    // bei Duplicate: error?.code === '23505' (Postgres unique_violation) → ignoriere
  }

  await supabase.from('travel_news_runs').insert({ keywords: terms, inserted, provider: 'newsapi' });
  return NextResponse.json({ inserted });
}
