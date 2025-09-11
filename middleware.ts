// middleware.ts
import { NextResponse, NextRequest } from 'next/server';

type Role = 'admin' | 'moderator' | 'user';

const PUBLIC_PATHS = new Set([
  '/login',
  '/register',
  '/api/login',
  '/api/register',
  '/api/logout',
  '/api/me',          // darf durch; Handler liefert 200/401
  '/api/unread',      // dito
  '/api/profile',     // Profil lesen/ändern prüft im Handler Bearer
  '/api/upload',      // wenn öffentlich gewollt
]);

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;

  // Collections mit Präfix:
  if (pathname.startsWith('/api/events')) return true;   // öffentlicher Events-Feed
  if (pathname.startsWith('/api/diag')) return true;     // Diagnose offen
  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/favicon.ico' || pathname === '/header.svg') return true;

  return false;
}

// Nur Admin-Zeug zentral in der Middleware schützen
function isAdminArea(pathname: string) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/news/admin')
  );
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 1) Öffentliche Pfade nie blocken
  if (isPublic(pathname)) return NextResponse.next();

  // 2) Nicht-Admin-APIs: Durchlassen, Route-Handler prüft Bearer (Supabase)
  if (pathname.startsWith('/api') && !isAdminArea(pathname)) {
    return NextResponse.next();
  }

  // 3) Ab hier Seiten & Admin-APIs: Cookie-basierte Gate
  const role = req.cookies.get('user_role')?.value as Role | undefined;

  // a) Keine Rolle ⇒ Login erzwingen (Seiten) oder 401 (Admin-APIs)
  if (!role) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', req.url);
    if (pathname !== '/login') url.searchParams.set('from', pathname + search);
    return NextResponse.redirect(url);
  }

  // b) Admin-Bereich absichern
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
