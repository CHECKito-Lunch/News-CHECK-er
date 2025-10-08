// middleware.ts
import { NextResponse, NextRequest } from 'next/server';

type Role = 'admin' | 'moderator' | 'teamleiter' | 'user';

/* ----------------------------- Public Paths ----------------------------- */
const PUBLIC_PATHS = new Set([
  '/login',
  '/register',
  '/api/login',
  '/api/register',
  '/api/logout',
  '/api/me',
  '/api/unread',
  '/api/profile',
  '/api/upload',
  '/api/admin/stats',
]);

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;

  if (pathname.startsWith('/api/events')) return true;
  if (pathname.startsWith('/api/diag')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname === '/favicon.ico' || pathname === '/header.svg') return true;

  return false;
}

/* ----------------------------- Role areas ----------------------------- */
function isAdminArea(pathname: string) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/news/admin')
  );
}

/* ---- Admin-exklusive Seiten/Endpoints ---- */
const ADMIN_ONLY_PREFIXES = [
  '/admin/news-agent',
  '/admin/kpis',
  '/admin/checkiade',
  '/admin/feedback',
  '/api/admin/news-agent',
  '/api/admin/kpis',
  '/api/admin/checkiade',
  '/api/admin/feedback',
];

function isAdminOnly(pathname: string) {
  return ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
}

/* ----------------------------- Middleware ----------------------------- */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 1) Öffentliche Pfade
  if (isPublic(pathname)) return NextResponse.next();

  // 2) API-Routen außerhalb Admin-Bereich: durchlassen
  if (pathname.startsWith('/api') && !isAdminArea(pathname)) {
    return NextResponse.next();
  }

  // 3) Rolle prüfen (aus Cookies)
  const role = req.cookies.get('user_role')?.value as Role | undefined;

  // a) Keine Rolle → Login / 401
  if (!role) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', req.url);
    if (pathname !== '/login') url.searchParams.set('from', pathname + search);
    return NextResponse.redirect(url);
  }

  // b) Adminbereich: admin | moderator | teamleiter
  if (isAdminArea(pathname) && !(role === 'admin' || role === 'moderator' || role === 'teamleiter')) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', req.url));
  }

  // c) Admin-only: ebenfalls admin | teamleiter (→ gleiche Rechte)
  if (isAdminOnly(pathname) && !(role === 'admin' || role === 'teamleiter')) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // UX: Moderator → zurück zum Admin-Dashboard
    return NextResponse.redirect(new URL('/admin', req.url));
  }

  return NextResponse.next();
}

/* ----------------------------- Matcher ----------------------------- */
// Empfehlung: API gar nicht von der Middleware matchen lassen.
// Falls du sie weiter matchen willst, ist die Logik oben bereits korrekt,
// aber robuster ist es, API aus dem Matcher auszuschließen:
export const config = {
  matcher: [
    // alles außer Next-Assets/Icons UND außer /api
    '/((?!_next/static|_next/image|favicon.ico|header.svg|api).*)',
  ],
};
