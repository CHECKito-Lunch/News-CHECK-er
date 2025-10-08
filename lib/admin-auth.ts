// lib/admin-auth.ts
import 'server-only';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifyToken, type Session, type Role } from './auth';

export type AdminUser = {
  sub: string;
  role: 'admin' | 'moderator' | 'teamleiter';
  name?: string;
};

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const isAdminLike = (r?: Role): r is AdminUser['role'] =>
  r === 'admin' || r === 'moderator' || r === 'teamleiter';

/** Session aus Cookies lesen (JWT bevorzugt, sonst Fallback-Cookies) */
export async function getSessionFromCookies(): Promise<Session | null> {
  const c = cookies(); // synchron
  const token = (await c).get(AUTH_COOKIE)?.value;
  const s = await verifyToken(token);
  if (s) return s;

  const role = (await c).get('user_role')?.value as Role | undefined;
  const sub  = (await c).get('user_id')?.value || '';
  const name = (await c).get('user_name')?.value;
  if (role && sub) return { sub, role, name };
  return null;
}

/**
 * Admin-/Moderator-/Teamleiter-Guard.
 * Optionaler req-Parameter (kompatibel zu alten Signaturen), wird aktuell nicht benötigt.
 */
export async function getAdminFromCookies(_req?: NextRequest): Promise<AdminUser | null> {
  const session = await getSessionFromCookies();
  if (!session || !isAdminLike(session.role)) return null;
  if (!isUUID(session.sub)) return null; // weil du in SQL auf ::uuid castest
  return { sub: session.sub, role: session.role, name: session.name };
}
