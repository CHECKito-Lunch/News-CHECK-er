// middleware.ts
import { NextResponse, NextRequest } from 'next/server';

type Role = 'admin' | 'moderator' | 'user';

function isPublic(pathname: string, method: string) {
  // Login / Registrierung (Seite + API)
  if (pathname === '/login' || pathname === '/register') return true;
  if (pathname.startsWith('/api/login') || pathname.startsWith('/api/register')) return true;
  if (pathname.startsWith('/api/me')) return true;

  

  // Next statics / Assets
  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname === '/header.svg') return true;
 


  return false;
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
  const method = req.method;

  if (isPublic(pathname, method)) return NextResponse.next();

  const role = req.cookies.get('user_role')?.value as Role | undefined;

  // Nicht eingeloggt → immer zum Login
  if (!role) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', req.url);
    if (pathname !== '/login') url.searchParams.set('from', pathname + search);
    return NextResponse.redirect(url);
  }

  // Eingeloggt, aber Admin-Bereich erfordert admin/moderator
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
