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

/** Hilfsfunktion: Prüft ob User Admin-Rechte hat (Admin, Moderator oder Teamleiter) */
function hasAdminRights(role: Role | undefined): boolean {
  return role === 'admin' || role === 'moderator' || role === 'teamleiter';
}

/* ----------------------------- Middleware ----------------------------- */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 1) Öffentliche Pfade
  if (isPublic(pathname)) return NextResponse.next();

  // 2) Login-Erkennung
  const roleCookie = req.cookies.get('user_role')?.value as Role | undefined;
  const hasAuthJwt = !!req.cookies.get('auth')?.value;

  // a) Weder Rolle noch JWT -> Login/Redirect
  if (!roleCookie && !hasAuthJwt) {
    const url = new URL('/login', req.url);
    if (pathname !== '/login') url.searchParams.set('from', pathname + search);
    return NextResponse.redirect(url);
  }

  // 3) Admin-Bereiche: Admin, Moderator oder Teamleiter dürfen rein
  if (roleCookie) {
    // b) Adminbereich: admin | moderator | teamleiter dürfen rein
    if (isAdminArea(pathname) && !hasAdminRights(roleCookie)) {
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
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, header.svg (icons)
     */
    '/((?!_next/static|_next/image|favicon.ico|header.svg).*)',
  ],
};
