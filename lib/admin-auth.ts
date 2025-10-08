// lib/admin-auth.ts
import 'server-only';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifyToken, type Session, type Role } from './auth';

export type AdminUser = {
  sub: string;
  role: Extract<Role, 'admin' | 'moderator' | 'teamleiter'>;
  name?: string;
};

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

export const isAdminLike = (role?: Role): role is AdminUser['role'] =>
  role === 'admin' || role === 'moderator' || role === 'teamleiter';

/** Session aus Cookies lesen (JWT bevorzugt, sonst Fallback-Cookies) */
export async function getSessionFromCookies(): Promise<Session | null> {
  const c = cookies(); // ← synchron!
  // 1) JWT bevorzugt
  const token = (await c).get(AUTH_COOKIE)?.value;
  const s = await verifyToken(token);
  if (s) return s;

  // 2) Fallback auf einfache Cookies (legacy)
  const role = (await c).get('user_role')?.value as Role | undefined;
  const sub  = (await c).get('user_id')?.value || '';
  const name = (await c).get('user_name')?.value;

  if (role && sub) {
    return { sub, role: (role as Role) ?? 'user', name };
  }
  return null;
}

/**
 * Liefert einen "Admin-ähnlichen" User (admin|moderator|teamleiter) oder null.
 * Rückgabe ist FLACH ({ sub, role, name }) – passend zu deiner API-Route.
 */
export async function getAdminFromCookies(req: unknown): Promise<AdminUser | null> {
  const session = await getSessionFromCookies();
  if (!session || !isAdminLike(session.role)) return null;

  // In deinen SQL-Statements castest du auf ::uuid – stelle sicher, dass sub eine UUID ist.
  // Wenn du auch Nicht-UUIDs erlauben willst, entferne die Prüfung.
  if (!isUUID(session.sub)) return null;

  return { sub: session.sub, role: session.role, name: session.name };
}
