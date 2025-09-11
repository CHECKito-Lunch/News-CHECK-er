// lib/auth-server.ts
import type { NextRequest } from 'next/server';
import { cookies, headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type AuthedUser = {
  sub: string;
  email?: string | null;
  name?: string | null;
  role: 'admin' | 'moderator' | 'user';
};

const AUTH_COOKIE = 'auth'; // oder dein Name

function bearerFrom(h: string | null) {
  const m = h ? /^Bearer\s+(.+)$/i.exec(h) : null;
  return m ? m[1] : null;
}

export async function getAccessTokenFromServer(req?: NextRequest) {
  if (req) {
    return (
      req.cookies.get(AUTH_COOKIE)?.value ??
      bearerFrom(req.headers.get('authorization')) ??
      null
    );
  }
  const ck = await cookies();           // in Next 14 typisiert als Promise
  const hd = await headers();
  return (
    ck.get(AUTH_COOKIE)?.value ??
    bearerFrom(hd.get('authorization')) ??
    null
  );
}

export async function requireUser(req?: NextRequest): Promise<AuthedUser> {
  const token = await getAccessTokenFromServer(req);
  if (!token) throw new Error('unauthorized');

  const s = supabaseAdmin();
  const { data, error } = await s.auth.getUser(token);
  if (error || !data?.user) throw new Error('unauthorized');

  const u = data.user;

  // (optional) Rolle aus eigener Tabelle lesen
  let role: AuthedUser['role'] = 'user';
  try {
    const { data: row } = await s.from('app_users')
      .select('role').eq('user_id', u.id).maybeSingle();
    if (row?.role) role = row.role as any;
  } catch {}

  const name =
    (u.user_metadata?.full_name as string | undefined) ||
    (u.user_metadata?.name as string | undefined) ||
    undefined;

  return { sub: u.id, email: u.email ?? null, name, role };
}
