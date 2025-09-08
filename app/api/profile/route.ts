// app/api/profile/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AUTH_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const c = await cookies(); // WICHTIG: await!
  const token = c.get(AUTH_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const s = supabaseAdmin();
  const { data, error } = await s.auth.getUser(token);
  if (error || !data?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional: Profildetails aus app_users
  const userId = data.user.id;
  const { data: appUser, error: appErr } = await s
    .from('app_users')
    .select('id, name, email, role, active, last_login_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (appErr) {
    return NextResponse.json({ error: appErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: userId,
      email: data.user.email,
      name: appUser?.name ?? data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? null,
      role: appUser?.role ?? 'user',
      active: appUser?.active ?? true,
      last_login_at: appUser?.last_login_at ?? null,
    },
  });
}
