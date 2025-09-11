// lib/auth-server.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { cookies, headers } from 'next/headers';

export type Role = 'admin' | 'moderator' | 'user';

export type SessionUser = { sub: string; role: Role; name?: string; email?: string };
export type AuthUser    = { sub: string; email: string | null; name: string | null; role: Role };

export const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

/** Fehler zum eleganten Abfangen in Routen */
export class UnauthorizedError extends Error {
  status = 401 as const;
  constructor(message = 'unauthorized') { super(message); this.name = 'UnauthorizedError'; }
}

/** Nur für „leichte“ Fälle: liest User grob aus Cookies/Headers (nicht vertrauenswürdig für Role) */
export async function readUserFromRequest(req?: NextRequest): Promise<SessionUser | null> {
  const c = req ? req.cookies : await cookies();
  const h = req ? req.headers : await headers();

  const sub   = c.get('user_id')?.value || h.get('x-user-id') || '';
  const roleC = (c.get('user_role')?.value || h.get('x-user-role') || '') as Role;
  const name  = c.get('user_name')?.value || undefined;
  const email = c.get('user_email')?.value || undefined;

  if (!sub) return null;
  // Wichtig: Rolle hier NICHT vertrauen – nur als Fallback 'user' ausgeben
  const role: Role = roleC === 'admin' || roleC === 'moderator' ? roleC : 'user';
  return { sub, role, name, email };
}

/** Bearer aus Header/Cookies (Supabase/JWT etc.) */
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

/** Base64url-JWT-Payload sicher dekodieren (ohne Signaturprüfung) */
function parseJwt(token: string): Record<string, any> | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch { return null; }
}

/** optionaler User (null wenn nicht eingeloggt) – nutzt DB als Quelle für Rolle/Name/Email */
export async function maybeUser(req: NextRequest): Promise<AuthUser | null> {
  // 1) Identität bestimmen (Cookie/Dev-Header/JWT)
  const cookieId = req.cookies.get('user_id')?.value || undefined;
  const headerId = req.headers.get('x-user-id') || undefined;
  let sub = cookieId || headerId || '';

  if (!sub) {
    const token = bearerFrom(req);
    const payload = token ? parseJwt(token) : null;
    if (payload?.sub && typeof payload.sub === 'string') sub = payload.sub;
  }
  if (!sub) return null;

  // 2) Profil aus DB laden:
  //    - auth.users: email, raw_user_meta_data (z.B. name)
  //    - public.app_users: role, name (falls vorhanden)
  const rows = await sql<Array<{ sub: string; email: string | null; name: string | null; role: string | null }>>`
    select
      au.id::text as sub,
      au.email,
      coalesce(apu.name, au.raw_user_meta_data->>'name') as name,
      coalesce(apu.role, 'user') as role
    from auth.users au
    left join public.app_users apu on apu.user_id = au.id
    where au.id::text = ${sub}
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  const role: Role = row.role === 'admin' || row.role === 'moderator' ? (row.role as Role) : 'user';
  return { sub: row.sub, email: row.email, name: row.name, role };
}

/** zwingend eingeloggt: wirft UnauthorizedError statt null */
export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const user = await maybeUser(req);
  if (!user) throw new UnauthorizedError();
  return user;
}
