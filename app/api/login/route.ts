// app/api/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AUTH_COOKIE, signSession, type Role } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const jar = await cookies();

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 400 });

  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const { data: row } = await sb.from('app_users').select('role,name').eq('user_id', data.user.id).maybeSingle();
  const role = (row?.role as Role) ?? 'user';
  const name = row?.name ?? data.user.email ?? undefined;

  const jwt = await signSession({ sub: data.user.id, role, name });

  const common = { path: '/', sameSite: 'lax' as const, secure: true, maxAge: 60 * 60 * 24 * 7 };
  jar.set(AUTH_COOKIE, jwt, { ...common, httpOnly: true });
  jar.set('user_role', role, { ...common, httpOnly: false });

  return NextResponse.json({ ok: true, role });
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
