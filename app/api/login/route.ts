// app/api/login/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AUTH_COOKIE } from '@/lib/auth';

type Role = 'admin' | 'moderator' | 'user'| 'teamleiter';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return NextResponse.json({ error: 'Missing Bearer' }, { status: 401 });
  const accessToken = m[1];

  const s = supabaseAdmin();
  const { data: userData, error: userErr } = await s.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const email = userData.user.email?.toLowerCase() ?? null;
  const userId = userData.user.id;
  const displayName =
    (userData.user.user_metadata?.full_name as string | undefined) ||
    (userData.user.user_metadata?.name as string | undefined) ||
    undefined;

  // Rolle/Aktiv holen
  let role: Role = 'user';
  let active = false;
  let appUserId: number | null = null;

  if (email) {
    const { data, error } = await s
      .from('app_users')
      .select('id, role, active')
      .eq('email', email)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) { role = (data.role as Role) || 'user'; active = !!data.active; appUserId = data.id; }
  } else {
    const { data, error } = await s
      .from('app_users')
      .select('id, role, active')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) { role = (data.role as Role) || 'user'; active = !!data.active; appUserId = data.id; }
  }

  if (!active) {
    return NextResponse.json({ error: 'Benutzer ist noch nicht aktiviert.' }, { status: 403 });
  }

  if (appUserId) {
    await s.from('app_users').update({ last_login_at: new Date().toISOString() }).eq('id', appUserId);
  }

  const res = NextResponse.json({ ok: true, role });
  const isProd = process.env.NODE_ENV === 'production';

  // Haupt-Cookie (JWT)
  res.cookies.set(AUTH_COOKIE, accessToken, {
    httpOnly: true, sameSite: 'lax', secure: isProd, path: '/', maxAge: 60 * 60 * 24 * 7,
  });

  // Zusatzinfos: Rolle, user_id, name (nicht httpOnly, damit Client sie lesen kann)
  res.cookies.set('user_role', role, {
    httpOnly: false, sameSite: 'lax', secure: isProd, path: '/', maxAge: 60 * 60 * 12,
  });
  res.cookies.set('user_id', userId, {
    httpOnly: false, sameSite: 'lax', secure: isProd, path: '/', maxAge: 60 * 60 * 24 * 7,
  });
  if (displayName) {
    res.cookies.set('user_name', displayName, {
      httpOnly: false, sameSite: 'lax', secure: isProd, path: '/', maxAge: 60 * 60 * 24 * 7,
    });
  }

  return res;
}
