import 'server-only';
import { NextResponse } from 'next/server';
import { openai } from '@/lib/openai';

export const runtime = 'nodejs';           // SDK läuft hier sauber
export const dynamic = 'force-dynamic';    // optional: keine Build-Time Caching-Probleme

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'POST nutzen.' });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { headlines = [] } = body as { headlines?: string[] };

    // Beispiel: Headlines zu kurzem, internem Summary verarbeiten
    const prompt = [
      {
        role: 'system',
        content:
          'Fasse Reise-/Tourismus-News stichpunktartig für ein internes Dashboard zusammen. Max 5 Bullet Points, deutsch.',
      },
      {
        role: 'user',
        content:
          headlines.length
            ? `Hier sind die Schlagzeilen:\n- ${headlines.join('\n- ')}`
            : 'Keine Schlagzeilen übergeben.',
      },
    ] as const;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages: prompt as any,
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || '';
    return NextResponse.json({ ok: true, summary: text });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'unknown' }, { status: 500 });
  }
}
