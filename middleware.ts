// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type Role = 'admin'|'moderator'|'user';

function getUser(req: NextRequest): { email: string|null; role: Role|null } {
  const email = req.cookies.get('user_email')?.value || null;
  const role = (req.cookies.get('user_role')?.value as Role | undefined) || null;
  return { email, role };
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const { email, role } = getUser(req);

  // Geschützte Bereiche:
  const needsLogin =
    pathname.startsWith('/profile') ||
    pathname.startsWith('/api/profile');

  const needsModerator =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/admin');

  const needsAdmin =
    pathname.startsWith('/admin/users') ||
    pathname.startsWith('/api/admin/users');

  // 1) Login nötig?
  if (needsLogin || needsModerator || needsAdmin) {
    if (!email || !role) {
      const url = new URL('/login', req.url);
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  // 2) Rollen prüfen
  if (needsAdmin && role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 });
  }
  if (needsModerator && !['admin','moderator'].includes(role as string)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/profile',
    '/api/profile/:path*',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};