// app/api/unread/seen/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';
const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function POST(req: NextRequest) {
  try {
    const u = await requireUser(req);
    await sql`
      insert into public.user_profiles (user_id, news_last_seen_at)
      values (${u.sub}::uuid, now())
      on conflict (user_id) do update set news_last_seen_at = excluded.news_last_seen_at
    `;
    return json({ ok:true });
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized' }, 401);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}
