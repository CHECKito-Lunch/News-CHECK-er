// app/api/me/events/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies as getCookies } from 'next/headers';
import { sql } from '@/lib/db';

const json = (data: any, status = 200) => NextResponse.json(data, { status });

async function getUserIdFromCookies(): Promise<string | null> {
  try {
    const c = await getCookies();

    // bevorzugt explizites Cookie (wird bei Login gesetzt)
    const uid = c.get('user_id')?.value || null;
    if (uid) return uid;

    // Fallback: JWT im "auth"-Cookie (Supabase Access Token)
    const auth = c.get('auth')?.value;
    if (!auth || !auth.includes('.')) return null;

    try {
      const payloadB64 = auth.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson);
      const sub = typeof payload?.sub === 'string' ? payload.sub : null;
      return sub || null;
    } catch { return null; }
  } catch { return null; }
}

export async function GET(_req: NextRequest) {
  const userId = await getUserIdFromCookies();
  if (!userId) return json({ ok: false, error: 'unauthorized' }, 401);

  try {
    const rows = await sql<{
      id: number;
      slug: string;
      title: string;
      summary: string | null;
      location: string | null;
      starts_at: string;
      ends_at: string | null;
      hero_image_url: string | null;
      state: 'confirmed' | 'waitlist';
    }[]>`
      SELECT
        e.id, e.slug, e.title, e.summary, e.location,
        e.starts_at, e.ends_at, e.hero_image_url,
        er.state::text AS state
      FROM public.event_registrations er
      JOIN public.events e ON e.id = er.event_id
      WHERE er.user_id::text = ${userId}         -- robust: text-Vergleich (uuid/text)
      ORDER BY e.starts_at ASC
      LIMIT 200
    `;

    return json({ ok: true, items: rows });
  } catch (e: any) {
    console.error('[me/events GET]', e);
    return json({ ok: false, error: e?.message ?? 'server_error' }, 500);
  }
}