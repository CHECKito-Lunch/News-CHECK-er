// app/api/password/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function POST(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const body = await req.json().catch(()=> ({}));
    const newPassword = (body?.newPassword ?? '').toString();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) return json({ ok:false, error:'not_configured' }, 501);

    const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }});
    const { error } = await sb.auth.admin.updateUserById(u.sub, { password: newPassword });
    if (error) return json({ ok:false, error: error.message }, 400);

    return json({ ok:true });
  } catch (e:any) {
    if (e?.message === 'unauthorized') return json({ ok:false, error:'unauthorized' }, 401);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}
