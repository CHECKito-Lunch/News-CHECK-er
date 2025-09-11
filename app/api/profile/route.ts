// app/api/profile/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function PUT(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const body = await req.json().catch(()=> ({}));
    const name = (body?.name ?? '').toString().trim();

    await sql`
      insert into public.user_profiles (user_id, name)
      values (${u.sub}::uuid, ${name || null})
      on conflict (user_id) do update set name = excluded.name
    `;
    return json({ ok:true });
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized' }, 401);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}
