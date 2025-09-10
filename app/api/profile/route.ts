export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const json = (d:any, s=200) => NextResponse.json(d,{status:s});

export async function PUT(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const b = await req.json().catch(()=> ({}));
    const name = (b?.name ?? '').toString().trim();
    const s = supabaseAdmin();

    await s.from('app_users')
      .update({ name })
      .eq('user_id', me.userId);

    // optional auch im Supabase-User aktualisieren
    await s.auth.admin.updateUserById(me.userId, { user_metadata: { name } });

    return json({ ok:true });
  } catch {
    return json({ ok:false, error:'unauthorized' }, 401);
  }
}
