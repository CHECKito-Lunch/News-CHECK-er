// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/admin', '/api/admin', '/api/news/admin'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Prüfen, ob die aktuelle URL in einen geschützten Bereich fällt
  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  if (!needsAuth) return NextResponse.next();

  const user = process.env.ADMIN_USER ?? '';
  const pass = process.env.ADMIN_PASS ?? '';
  if (!user || !pass) {
    return new NextResponse('Admin auth not configured', { status: 500 });
  }

  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Basic ')) {
    return new NextResponse('Auth required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
    });
  }

  // Edge Runtime: atob/btoa verfügbar
  const [u, p] = atob(auth.slice(6)).split(':');
  if (u === user && p === pass) return NextResponse.next();

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
  });
}

// Wichtig: auch /api/admin/** matchen
export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/news/admin'],
  // wenn du auch Unterrouten von /api/news/admin schützen willst:
  // matcher: ['/admin/:path*', '/api/admin/:path*', '/api/news/admin/:path*'],
};
