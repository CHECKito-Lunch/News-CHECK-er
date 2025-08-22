// app/api/me/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Role = 'admin'|'moderator'|'user';

export async function GET() {
  const c = await cookies(); // in Next 15 kann cookies() async sein
  const email = c.get('user_email')?.value || '';
  const role = c.get('user_role')?.value as Role | undefined;
  const name = c.get('user_name')?.value || undefined;

  const res = NextResponse.json({
    user: email && role ? { sub: email, role, name } : null
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}