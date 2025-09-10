// middleware.ts
import { NextResponse, NextRequest } from 'next/server';

type Role = 'admin' | 'moderator' | 'user';

function isPublic(pathname: string) {
  if (pathname === '/login' || pathname === '/register') return true;
  if (pathname.startsWith('/api/login') || pathname.startsWith('/api/register')) return true;
  if (pathname.startsWith('/api/me')) return true;
  if (pathname.startsWith('/api/unread')) return true;
  if (pathname.startsWith('/api/logout')) return true;
   if (pathname.startsWith('/api/profile')) return true;
   if (pathname.startsWith('/api/upload')) return true;
    if (pathname.startsWith('/api/events')) return true;
    if (pathname.startsWith('/api')) return true;

  // Diagnose offen lassen
  if (pathname.startsWith('/api/diag')) return true;

  // Next statics / Assets
  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname === '/header.svg') return true;

  return false;
}

// Cron-Auth nur für Middleware (Edge-safe)
function isCronAuthorizedInMiddleware(req: NextRequest) {
  const secret = process.env.NEWS_AGENT_CRON_SECRET?.trim();
  if (!secret) return false;

  const h = req.headers.get('x-cron-auth')?.trim() || '';
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const key = req.nextUrl.searchParams.get('key')?.trim() || '';

  return h === secret || bearer === secret || key === secret;
}

function isAdminArea(pathname: string) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/news/admin')
  );
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // a) Public direkt durch
  if (isPublic(pathname)) return NextResponse.next();

  // b) Cron: Run-Endpoint darf mit Secret immer durch
  if (pathname.startsWith('/api/admin/news-agent/run') && isCronAuthorizedInMiddleware(req)) {
    return NextResponse.next();
  }

  // c) Ab hier normale Auth
  const role = req.cookies.get('user_role')?.value as Role | undefined;

  if (!role) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', req.url);
    if (pathname !== '/login') url.searchParams.set('from', pathname + search);
    return NextResponse.redirect(url);
  }

  if (isAdminArea(pathname) && !(role === 'admin' || role === 'moderator')) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|header.svg).*)',
    '/api/:path*',
  ],
};
