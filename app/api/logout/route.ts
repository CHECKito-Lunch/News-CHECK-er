import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

function buildRedirect(request: Request) {
  // Ziel: zurück zur Login-Seite (oder /)
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  return new URL('/login', base); // oder '/' wenn du direkt auf die Startseite willst
}

function clearCookiesOn(res: NextResponse) {
  const isProd = process.env.NODE_ENV === 'production';
  const common = { httpOnly: true, path: '/', maxAge: 0, secure: isProd, sameSite: 'lax' } as const;

  res.cookies.set(AUTH_COOKIE, '', common);
  res.cookies.set('user_role', '', common);
  res.cookies.set('user_id', '', common);
}

async function handle(request: Request) {
  const res = NextResponse.redirect(buildRedirect(request));
  clearCookiesOn(res);
  return res;
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
