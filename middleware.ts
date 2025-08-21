import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protect = pathname.startsWith('/admin') || pathname.startsWith('/api/news/admin');
  if (!protect) return NextResponse.next();

  const user = process.env.ADMIN_USER || '';
  const pass = process.env.ADMIN_PASS || '';
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

  const decoded = atob(auth.split(' ')[1]); // Edge Runtime hat atob/btoa
  const [u, p] = decoded.split(':');

  if (u === user && p === pass) return NextResponse.next();

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
  });
}

export const config = {
  matcher: ['/admin/:path*', '/api/news/admin'],
};