import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const isProd = process.env.NODE_ENV === 'production';

  // App-Cookies löschen
  res.cookies.set(AUTH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0, secure: isProd, sameSite: 'lax' });
  res.cookies.set('user_role', '',   { httpOnly: true, path: '/', maxAge: 0, secure: isProd, sameSite: 'lax' });
  res.cookies.set('user_id', '',     { httpOnly: true, path: '/', maxAge: 0, secure: isProd, sameSite: 'lax' }); 

  return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.karl-marx-checknitz.de/'));
}