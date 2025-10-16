import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

const common = (isProd: boolean) => ({
  httpOnly: true,
  path: '/',
  maxAge: 0,
  secure: isProd,
  sameSite: 'lax' as const,
});

function clearCookies(res: NextResponse, isProd: boolean) {
  const opts = common(isProd);
  res.cookies.set(AUTH_COOKIE, '', opts);
  res.cookies.set('user_role', '', opts);
  res.cookies.set('user_id', '', opts);
}

export async function POST(request: Request) {
  const isProd = process.env.NODE_ENV === 'production';
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const location = new URL('/login', base);

  // 303 erzwingt GET auf der Zielseite
  const res = NextResponse.redirect(location, 303);
  clearCookies(res, isProd);
  return res;
}

// Optional: auch GET erlauben, falls Logout per Link aufgerufen wird
export async function GET(request: Request) {
  return POST(request);
}
