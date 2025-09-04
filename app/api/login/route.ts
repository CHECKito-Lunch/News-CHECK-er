// app/api/login/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type Role = 'admin' | 'moderator' | 'user';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return NextResponse.json({ error: 'Missing Bearer' }, { status: 401 });
  }
  const accessToken = m[1];

  const s = supabaseAdmin();

  // user_id + email aus dem JWT lesen
  let userId: string | null = null;
  let email: string | null = null;
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1] || '', 'base64').toString('utf8')
    ) as { sub?: string; email?: string };
    userId = payload?.sub ?? null;
    email = payload?.email ?? null;
  } catch {
    /* ignore */
  }

  if (!userId && !email) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Rolle + active aus DB holen
  let role: Role = 'user';
  let active = false;
  let id: number | null = null;

  if (email) {
    const { data, error } = await s
      .from('app_users')
      .select('id, role, active')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (data) {
      role = data.role as Role;
      active = !!data.active;
      id = data.id;
    }
  } else if (userId) {
    const { data, error } = await s
      .from('app_users')
      .select('id, role, active')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (data) {
      role = data.role as Role;
      active = !!data.active;
      id = data.id;
    }
  }

  if (!active) {
    return NextResponse.json({ error: 'Benutzer ist noch nicht aktiviert.' }, { status: 403 });
  }

  // --- letzter Login setzen ---
  if (id) {
    await s.from('app_users').update({ last_login: new Date().toISOString() }).eq('id', id);
  }

  // Cookies setzen
  const res = NextResponse.json({ ok: true, role });
  const isProd = process.env.NODE_ENV === 'production';

  res.cookies.set('auth', '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 Tage
  });

  res.cookies.set('user_role', role, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 12, // 12 Stunden
  });

  return res;
}
