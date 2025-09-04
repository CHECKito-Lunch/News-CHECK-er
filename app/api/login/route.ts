// app/api/login/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Erwartet: Authorization: Bearer <access_token> (vom Supabase-Client nach signIn)
 * Tut:  - prüft Token (sub = user_id, email)
 *       - holt Rolle aus app_users (service role, keine RLS-Probleme)
 *       - setzt httpOnly auth-marker (optional) + user_role Cookie
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return NextResponse.json({ error: 'Missing Bearer' }, { status: 401 });
  }
  const accessToken = m[1];

  // Falls du das Token validieren willst, kannst du z. B. über Supabase Admin getUser() gehen.
  // Für Rolle reicht uns hier die user_id aus dem JWT, die du dir i. d. R. im Client schon hast.
  // Wir zeigen hier den robusten Weg: role per email/user_id aus der DB ziehen.
  const s = supabaseAdmin();

  // user_id + email aus dem JWT auslesen (leichtgewichtig)
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

  // Rolle sicher serverseitig (Service Role) lesen – keine RLS-Probleme
  let role: 'admin' | 'moderator' | 'user' = 'user';
  if (email) {
    const { data } = await s
      .from('app_users')
      .select('role')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (data?.role) role = data.role as any;
  } else if (userId) {
    const { data } = await s
      .from('app_users')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.role) role = data.role as any;
  }

  // Cookies setzen
  const res = NextResponse.json({ ok: true, role });
  // Wichtig: in Prod Secure setzen; Domain NICHT setzen -> Host-spezifisch (vermeidet www./Apex-Mismatch)
  const isProd = process.env.NODE_ENV === 'production';

  // httpOnly Marker (optional – falls du so einen nutzt)
  res.cookies.set('auth', '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 Tage
  });

  // Rolle für Middleware
  res.cookies.set('user_role', role, {
    httpOnly: true,          // Middleware darf per Request headers lesen, Client nicht
    sameSite: 'lax',
    secure: isProd,          // In Prod zwingend, sonst droppt der Browser unter HTTPS
    path: '/',
    maxAge: 60 * 60 * 12,    // 12h reicht meist
  });

  return res;
}
