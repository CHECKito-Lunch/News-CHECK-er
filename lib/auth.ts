// lib/auth.ts
import type { NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { sql } from '@/lib/db';

export const AUTH_COOKIE = 'auth';

/** App-Rollen – erweitert um "teamleiter" */
export type Role = 'admin' | 'moderator' | 'teamleiter' | 'user';

/** Payload, die wir in den JWT packen */
export type Session = { sub: string; role: Role; name?: string };

/** Optionales User-Objekt (kompatibel zu deinem bestehenden Code) */
export type AuthUser = {
  sub: string;
  email?: string;
  name?: string;
  role?: Role;
};

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret');

/* ===========================
   JWT sign/verify (wie bisher)
=========================== */
export async function signSession(session: Session) {
  return await new SignJWT(session)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifyToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      sub: String(payload.sub),
      role: (payload.role as Role) ?? 'user',
      name: (payload as any).name,
    };
  } catch {
    return null;
  }
}

/* ===========================
   SSR: User aus Cookies lesen
   - nutzt dein AUTH_COOKIE (JWT)
   - zieht Rolle/Name aus DB, wenn vorhanden (App-Quelle der Wahrheit)
=========================== */
export type SessionUser = { user_id: string; role: Role; name?: string; email?: string };

/**
 * Liest das AUTH_COOKIE, verifiziert es und liefert { user_id, role }.
 * Die Rolle wird – falls vorhanden – aus public.app_users überschrieben,
 * damit spätere Rollenänderungen sofort greifen (Token kann älter sein).
 */
export async function getUserFromCookies(req: NextRequest): Promise<SessionUser | null> {
  // Cookie lesen
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const sess = await verifyToken(token);
  if (!sess?.sub) return null;

  // Rolle/Name aus DB (Quelle der Wahrheit)
  try {
    const rows = await sql/*sql*/`
      select user_id, role, name, email
      from public.app_users
      where user_id = ${sess.sub}::uuid
      limit 1
    `;

    if (rows.length > 0) {
      const r = rows[0];
      // Rolle aus DB erzwingt „teamleiter“ usw.
      const dbRole: Role =
        r.role === 'admin' || r.role === 'moderator' || r.role === 'teamleiter' ? r.role : 'user';

      return {
        user_id: String(r.user_id),
        role: dbRole,
        name: r.name ?? sess.name ?? undefined,
        email: r.email ?? undefined,
      };
    }
  } catch {
    // Falls die DB nicht erreichbar ist, verwenden wir den Token-Fallback
  }

  // Fallback auf Token-Inhalt
  const safeRole: Role =
    sess.role === 'admin' || sess.role === 'moderator' || sess.role === 'teamleiter' ? sess.role : 'user';

  return {
    user_id: sess.sub,
    role: safeRole,
    name: sess.name,
  };
}

/* ===========================
   Kleine Helfer (optional)
=========================== */
export const isAdminOrMod = (role?: Role) => role === 'admin' || role === 'moderator';
export const isTeamlead = (role?: Role) => role === 'teamleiter';
