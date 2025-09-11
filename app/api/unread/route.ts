// app/api/unread/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

/**
 * Für Demo: wir nutzen user_profiles.news_last_seen_at (timestamp)
 * und zählen News seitdem. Passe Tabellen an dein Schema an.
 */
export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const [state] = await sql<{ last_seen_at: string | null }[]>`
      select news_last_seen_at as last_seen_at
      from public.user_profiles where user_id=${u.sub}::uuid
    `;

    const since = state?.last_seen_at ?? null;

    const rows = await sql<any[]>`
      select id, slug, title, summary, effective_from
      from public.news
      where status='published' and (${since}::timestamptz is null or effective_from > ${since}::timestamptz)
      order by effective_from desc
      limit 10
    `.catch(()=>[] as any);

    return json({
      ok: true,
      last_seen_at: since,
      total: rows.length,
      unread: rows.length,
      preview: rows
    });
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized' }, 401);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}
