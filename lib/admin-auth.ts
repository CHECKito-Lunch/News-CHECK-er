// lib/admin-auth.ts
import 'server-only';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifyToken, type Session } from './auth';

export type AdminCtx = {
  [x: string]: any; session: Session 
};

/** Liest Session aus dem `auth`-Cookie (Fallback: alte role-/user_-Cookies) */
export async function getSessionFromCookies(): Promise<Session | null> {
  const c = await cookies();                          // ← async!
  // 1) bevorzugt: dein JWT
  const token = c.get(AUTH_COOKIE)?.value;
  const s = await verifyToken(token);
  if (s) return s;

  // 2) Fallback (falls noch im Einsatz): einfache Cookies
  const role = c.get('user_role')?.value as any;
  if (role) {
    return {
      sub: c.get('user_id')?.value ?? '',
      role,
      name: c.get('user_name')?.value,
    } as Session;
  }
  return null;
}

/** Gibt Admin-Kontext zurück oder `null`, wenn nicht eingeloggt/kein Admin */
export async function getAdminFromCookies(): Promise<AdminCtx | null> {
  const session = await getSessionFromCookies();
  if (!session || session.role !== 'admin') return null;
  return { session };
}
