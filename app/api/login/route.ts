import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const emailRaw = (body.email as string | undefined) || '';
  const password = (body.password as string | undefined) || '';

  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) {
    return NextResponse.json({ error: 'E-Mail und Passwort erforderlich.' }, { status: 400 });
  }

  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.appUsers)
    .select('id,email,name,role,password_hash')
    .eq('email', email)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Login fehlgeschlagen.' }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, (data as any).password_hash ?? '');
  if (!ok) {
    return NextResponse.json({ error: 'Login fehlgeschlagen.' }, { status: 401 });
  }

  // Cookies über die Response setzen (nicht cookies().set)
  const res = NextResponse.json({ ok: true });
  const maxAge = 60 * 60 * 8; // 8h Session
  const base = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge };

  res.cookies.set('user_role', String(data.role), base);
  res.cookies.set('user_email', String(data.email), base);
  if (data.name) res.cookies.set('user_name', String(data.name), base);

  return res;
}