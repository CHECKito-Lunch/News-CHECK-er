// middleware.ts (ersetzt vorhandene)
import { NextResponse, NextRequest } from 'next/server';

type Role = 'admin' | 'moderator' | 'user';

function isPublic(pathname: string) {
  // Login & Login-API sind öffentlich, Assets ebenso
  if (pathname === '/login') return true;
  if (pathname.startsWith('/api/login')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/favicon.ico') return true;
  if (pathname === '/header.svg') return true;
  return false;
}

function allowed(role: Role | undefined, pathname: string) {
  if (!role) return false;

  // Admin-only Bereiche (Userverwaltung)
  if (pathname.startsWith('/admin/users') || pathname.startsWith('/api/admin/users')) {
    return role === 'admin';
  }

  // Admin-Bereich & Admin-APIs (Beiträge/Taxonomien)
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    return role === 'admin' || role === 'moderator';
  }

  // sonstige Seiten: nur eingeloggt (user, moderator, admin)
  return true;
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const role = req.cookies.get('user_role')?.value as Role | undefined;

  // nicht eingeloggt → redirect auf Login (Pages)
  if (!role) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', req.url);
    if (pathname !== '/login') url.searchParams.set('from', pathname + search);
    return NextResponse.redirect(url);
  }

  // eingeloggt, aber keine Rechte → 403 oder Redirect
  if (!allowed(role, pathname)) {
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