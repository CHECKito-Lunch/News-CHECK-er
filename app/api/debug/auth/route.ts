// app/api/debug/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifyToken } from '@/lib/auth';

export async function GET() {
  const jar = await cookies();
  const all = jar.getAll();
  const names = all.map(c => c.name);

  // Supabase-Cookie hat immer das Muster "sb-<ref>-auth-token"
  const hasSbAuth = names.some(n => n.startsWith('sb-') && n.endsWith('-auth-token'));

  const userRole = jar.get('user_role')?.value ?? null;
  const jwt = jar.get(AUTH_COOKIE)?.value ?? null;
  const payload = jwt ? await verifyToken(jwt) : null;

  return NextResponse.json({
    hasSbAuth,
    names,
    userRole,
    jwtSub: payload?.sub ?? null,
    jwtRole: payload?.role ?? null,
  });
}