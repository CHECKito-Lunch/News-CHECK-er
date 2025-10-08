// lib/auth.ts
'use server';

import type { NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { sql } from '@/lib/db';

/** Name des Auth-Cookies (JWT) */
export const AUTH_COOKIE = 'auth';

/** App-Rollen – inkl. teamleiter */
export type Role = 'admin' | 'moderator' | 'teamleiter' | 'user';

/** Payload, die wir in den JWT packen */
export type Session = { sub: string; role: Role; name?: string };

/** Optionales User-Objekt (kompatibel zu bestehendem Code) */
export type AuthUser = {
  sub: string;
  email?: string;
  name?: string;
  role?: Role;
};

/** SSR-User-Objekt, das aus dem Cookie/DB ermittelt wird */
export type SessionUser = {
  sub: string;
  user_id: string;
  role: Role;
  name?: string;
  email?: string;
};

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret');

/* ===========================
   JWT sign/verify
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
    // Fallbacks absichern
    const role =
      (payload.role as Role) === 'admin' ||
      (payload.role as Role) === 'moderator' ||
      (payload.role as Role) === 'teamleiter'
        ? (payload.role as Role)
        : 'user';

    return {
      sub: String(payload.sub),
      role,
      name: (payload as any).name,
    };
  } catch {
    return null;
  }
}

/* ===========================
   SSR: User aus Cookies lesen
   - nutzt AUTH_COOKIE (JWT)
   - Rolle/Name/Email werden (falls vorhanden) aus public.app_users geholt
=========================== */
export async function getUserFromCookies(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const sess = await verifyToken(token);
  if (!sess?.sub) return null;

  // Quelle der Wahrheit: DB
  try {
    const rows = await sql/*sql*/`
      select user_id, role, name, email
      from public.app_users
      where user_id = ${sess.sub}::uuid
      limit 1
    `;

    if (rows.length > 0) {
      const r = rows[0] as {
        user_id: string;
        role: string | null;
        name?: string | null;
        email?: string | null;
      };

      const dbRole: Role =
        r.role === 'admin' || r.role === 'moderator' || r.role === 'teamleiter' ? (r.role as Role) : 'user';

      return {
        sub: String(r.user_id),        // wichtig: sub immer setzen
        user_id: String(r.user_id),
        role: dbRole,
        name: r.name ?? sess.name ?? undefined,
        email: r.email ?? undefined,
      };
    }
  } catch {
    // Wenn DB nicht erreichbar ist, fällt es unten auf Token zurück
  }

  // Fallback auf Token-Inhalt
  const safeRole: Role =
    sess.role === 'admin' || sess.role === 'moderator' || sess.role === 'teamleiter' ? sess.role : 'user';

  return {
    sub: String(sess.sub),
    user_id: String(sess.sub),
    role: safeRole,
    name: sess.name,
  };
}

/* ===========================
   Kleine Helfer
=========================== */
export const isAdminOrMod = (role?: Role) => role === 'admin' || role === 'moderator';
export const isTeamlead = (role?: Role) => role === 'teamleiter';
