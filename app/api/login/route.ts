// app/api/login/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AUTH_COOKIE } from '@/lib/auth'; // <- sicherstellen, dass dieser Name mit deinem Layout übereinstimmt

type Role = 'admin' | 'moderator' | 'user';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) {
    return NextResponse.json({ error: 'Missing Bearer' }, { status: 401 });
  }
  const accessToken = m[1];

  const s = supabaseAdmin();

  // User sicher über Supabase prüfen (statt manuell JWT zu decodieren),
  // das funktioniert zuverlässig und ist Edge/Node-kompatibel.
  const { data: userData, error: userErr } = await s.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const email = userData.user.email?.toLowerCase() ?? null;
  const userId = userData.user.id ?? null;

  // Rolle + Aktiv-Flag aus app_users lesen
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
    if (data) {
      role = (data.role as Role) || 'user';
      active = !!data.active;
      appUserId = data.id;
    }
  } else if (userId) {
    const { data, error } = await s
      .from('app_users')
      .select('id, role, active')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) {
      role = (data.role as Role) || 'user';
      active = !!data.active;
      appUserId = data.id;
    }
  }

  if (!active) {
    return NextResponse.json({ error: 'Benutzer ist noch nicht aktiviert.' }, { status: 403 });
  }

  // Letzten Login in der Tabelle vermerken (Spaltenname ggf. anpassen)
  if (appUserId) {
    await s
      .from('app_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', appUserId);
  }

  const res = NextResponse.json({ ok: true, role });
  const isProd = process.env.NODE_ENV === 'production';

  // 1) httpOnly-JWT für serverseitige Verifikation (Layout nutzt AUTH_COOKIE)
  res.cookies.set(AUTH_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 Tage
  });

  // 2) Rolle als Zusatz (UI kann sofort unterscheiden)
  res.cookies.set('user_role', role, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 12, // 12 Stunden
  });

  return res;
}
