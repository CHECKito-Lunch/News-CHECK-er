export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const json = (d:any, s=200) => NextResponse.json(d, { status:s });

export async function GET(req: Request) {
  try {
    const me = await requireUser(req);
    const s = supabaseAdmin();

    // App-spezifische Metadaten laden (optional)
    const { data: appUser } = await s
      .from('app_users')
      .select('user_id, email, role, active, name')
      .eq('user_id', me.userId)
      .maybeSingle();

    return json({
      ok: true,
      user: {
        sub: me.userId,
        role: (appUser?.role ?? 'user') as 'admin'|'moderator'|'user',
        name: appUser?.name ?? null,
        email: appUser?.email ?? me.email ?? null,
      }
    });
  } catch {
    return json({ ok:false, error:'unauthorized' }, 401);
  }
}
