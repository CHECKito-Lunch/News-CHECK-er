// lib/auth-server.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { cookies, headers } from 'next/headers';

export type Role = 'admin'|'moderator'|'user';
export type SessionUser = { sub: string; role: Role; name?: string; email?: string };
export type AuthUser = { sub: string; email: string|null; name: string|null; role: Role };

export const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

// ---- kleine Helfer
function bearerFrom(req: NextRequest): string | null {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];
  return (
    req.cookies.get('sb-access-token')?.value ||
    req.cookies.get('access_token')?.value ||
    req.headers.get('x-access-token') ||
    null
  );
}

// Optionales, leichtgewichtiges Auslesen (für Client/SSR)
export async function readUserFromRequest(req?: NextRequest): Promise<SessionUser | null> {
  const c = req ? req.cookies : await cookies();
  const h = req ? req.headers : await headers();

  // hier steckt die Supabase UID drin (siehe DB: app_users.user_id)
  const sub   = c.get('user_id')?.value || h.get('x-user-id') || '';
  const role  = (c.get('user_role')?.value || h.get('x-user-role') || '') as Role;
  const name  = c.get('user_name')?.value || undefined;
  const email = c.get('user_email')?.value || undefined;

  if (!sub) return null;
  return { sub, role, name, email };
}

// ---- Fehlerklasse + optionale/harte Auth
export class UnauthorizedError extends Error {}

export async function maybeUser(req: NextRequest): Promise<AuthUser | null> {
  // Quelle der UID: Cookie/Header/JWT (JWT wird hier NICHT dekodiert – wir vertrauen auf Cookie/Header)
  const uid = req.cookies.get('user_id')?.value || req.headers.get('x-user-id') || null;
  const token = bearerFrom(req);
  if (!uid && !token) return null;

  const rows = await sql<AuthUser[]>`
    select
      user_id::text as sub,
      email,
      name,
      role::text as role
    from public.app_users
    where user_id::text = ${uid ?? ''}
      and active = true
    limit 1
  `;
  return rows[0] ?? null;
}

export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const me = await maybeUser(req);
  if (!me) throw new UnauthorizedError('unauthorized');
  return me;
}
