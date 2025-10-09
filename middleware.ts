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

  // 2) Login-Erkennung
  const roleCookie = req.cookies.get('user_role')?.value as Role | undefined;
  const hasAuthJwt = !!req.cookies.get('auth')?.value;  // dein JWT

  // a) Weder Rolle noch JWT -> Login/Redirect
  if (!roleCookie && !hasAuthJwt) {
    const url = new URL('/login', req.url);
    if (pathname !== '/login') url.searchParams.set('from', pathname + search);
    return NextResponse.redirect(url);
  }

  // 3) Admin-Bereiche nur dann von der Middleware einschränken,
  //    wenn eine explizite Rolle im Cookie steht. Falls nur JWT da ist,
  //    lassen wir durch und der Server-Handler (DB) entscheidet.
  if (roleCookie) {
    // b) Adminbereich: admin | moderator | teamleiter dürfen rein
    if (isAdminArea(pathname) && !(roleCookie === 'admin' || roleCookie === 'moderator' || roleCookie === 'teamleiter')) {
      return pathname.startsWith('/api')
        ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        : NextResponse.redirect(new URL('/', req.url));
    }

    // c) Admin-only: admin | teamleiter (gleiches Recht; Moderator nicht)
    if (isAdminOnly(pathname) && !(roleCookie === 'admin' || roleCookie === 'teamleiter')) {
      return pathname.startsWith('/api')
        ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        : NextResponse.redirect(new URL('/admin', req.url));
    }
  }

  return NextResponse.next();
}

/* ----------------------------- Matcher ----------------------------- */
/* API bewusst vom Matching ausgeschlossen (robuster; Server-Handler authorisiert selbst) */
export const config = {
  matcher: [
    // alles außer Next-Assets/Icons UND außer /api
    '/((?!_next/static|_next/image|favicon.ico|header.svg|api).*)',
  ],
};
