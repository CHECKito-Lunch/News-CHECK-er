import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

// .env(.local) -> LOGIN_CODE=dein-geheimer-code
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const emailRaw = String(body.email ?? '').trim().toLowerCase();
  const code = String(body.code ?? '');

  if (!emailRaw || !code) {
    return NextResponse.json({ error: 'E-Mail und Code sind erforderlich.' }, { status: 400 });
  }
  if (!process.env.LOGIN_CODE) {
    return NextResponse.json({ error: 'LOGIN_CODE fehlt auf dem Server.' }, { status: 500 });
  }
  if (code !== process.env.LOGIN_CODE) {
    return NextResponse.json({ error: 'Ungültiger Code.' }, { status: 401 });
  }

  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.appUsers)
    .select('email,name,role,active')
    .eq('email', emailRaw)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Unbekannte E-Mail.' }, { status: 401 });
  }
  if (!data.active) {
    return NextResponse.json({ error: 'Konto ist inaktiv.' }, { status: 403 });
  }

  const c = cookies();
  const maxAge = 60 * 60 * 8; // 8h Session

  c.set({ name: 'role', value: data.role, httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge });
  c.set({ name: 'user_email', value: data.email, httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge });
  if (data.name) {
    c.set({ name: 'user_name', value: data.name, httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge });
  }

  return NextResponse.json({ ok: true });
}
