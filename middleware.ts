// middleware.ts
import { NextResponse, NextRequest } from 'next/server';

type Role = 'admin' | 'moderator' | 'teamleiter' | 'user';

/* ----------------------------- Public Paths ----------------------------- */
/* ----------------------------- Public Paths ----------------------------- */
const PUBLIC_PATHS = new Set([
  '/login',
  '/register',       // Registrierung für neue User
  '/api/login',      // API endpoint für Login
  '/api/register',   // API endpoint für Registrierung
  '/api/logout',     // Logout sollte immer erreichbar sein
]);

function isPublic(pathname: string) {
  // Exakte Pfade aus PUBLIC_PATHS
  if (PUBLIC_PATHS.has(pathname)) return true;
  
  // Next.js interne Pfade (notwendig für Funktion)
  if (pathname.startsWith('/_next')) return true;
  
  // Statische Assets (notwendig für Login-Seite)
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

  // 1) Öffentliche Pfade - IMMER durchlassen
  if (isPublic(pathname)) return NextResponse.next();

  // 2) Login-Erkennung
  const roleCookie = req.cookies.get('user_role')?.value as Role | undefined;
  const hasAuthJwt = !!req.cookies.get('auth')?.value;

  // a) Nicht eingeloggt -> Redirect zu Login mit "from" Parameter
  if (!roleCookie && !hasAuthJwt) {
    const url = new URL('/login', req.url);
    // Speichere die ursprüngliche URL, um nach Login dorthin zurück zu leiten
    url.searchParams.set('from', pathname + search);
    return NextResponse.redirect(url);
  }

  // 3) User ist eingeloggt - prüfe Berechtigungen
  if (roleCookie) {
    // b) Adminbereich: admin | moderator | teamleiter dürfen rein
    if (isAdminArea(pathname) && !hasAdminRights(roleCookie)) {
      return pathname.startsWith('/api')
        ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        : NextResponse.redirect(new URL('/', req.url));
    }

    // c) Admin-only: admin | teamleiter (Moderator nicht)
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
