export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const b = await req.json().catch(()=> ({}));
    const newPassword = (b?.newPassword ?? '').toString();
    if (newPassword.length < 8) return json({ ok:false, error:'weak_password' }, 400);

    const s = supabaseAdmin();
    const { error } = await s.auth.admin.updateUserById(me.userId, { password: newPassword });
    if (error) return json({ ok:false, error: error.message }, 500);

    return json({ ok:true });
  } catch {
    return json({ ok:false, error:'unauthorized' }, 401);
  }
}
