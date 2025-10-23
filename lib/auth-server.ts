/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/auth-server.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { cookies, headers } from 'next/headers';

export type Role = 'admin' | 'moderator' | 'teamleiter' | 'user'; // <-- ÄNDERUNG
export type SessionUser = { sub: string; role: Role; name?: string; email?: string };
export type AuthUser = { sub: string; email: string|null; name: string|null; role: Role } & Record<string, any>;

export const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

/* ------------------------- kleine Helfer ------------------------- */

// Bearer aus Header/Cookies
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

// Role normalisieren (Fallback 'user')
const normalizeRole = (r?: string | null): Role => {
  const v = String(r || '').toLowerCase();
  // ÄNDERUNG: teamleiter als valide Rolle erkennen
  if (v === 'admin') return 'admin';
  if (v === 'moderator') return 'moderator';
  if (v === 'teamleiter') return 'teamleiter';
  return 'user';
};

// ⛳ nach Login/Refresh Cookies konsistent setzen
export async function setAuthCookies(u: AuthUser) {
  const c = await cookies();
  const opts = { httpOnly: false, sameSite: 'lax' as const, path: '/' };
  c.set('user_id', u.sub, opts);
  c.set('user_role', u.role, opts);
  if (u.name)  c.set('user_name', u.name, opts);
  if (u.email) c.set('user_email', u.email, opts);
}

/* ---------------------- Session & User lesen ---------------------- */

// Optionales, leichtgewichtiges Auslesen (SSR/Client)
// → nimmt Cookies/Header; dekodiert keine JWTs
export async function readUserFromRequest(req?: NextRequest): Promise<SessionUser | null> {
  const c = req ? req.cookies : await cookies();
  const h = req ? req.headers : await headers();

  // bevorzugt UUID, akzeptiere aber notfalls numerische app_users.id
  const rawId = c.get('user_id')?.value || h.get('x-user-id') || '';
  const role  = normalizeRole(c.get('user_role')?.value || h.get('x-user-role'));
  const name  = c.get('user_name')?.value || undefined;
  const email = c.get('user_email')?.value || undefined;

  if (!rawId) return null;
  return { sub: rawId, role, name, email };
}

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

/**
 * Hilfsfunktion: akzeptiert 'user_id' als UUID ODER numerische app_users.id
 * und liefert den DB-Datensatz + kanonische UUID zurück.
 */
async function loadUserByAnyId(idLike: string | null): Promise<AuthUser | null> {
  if (!idLike) return null;

  // Numerisch? → über app_users.id auflösen
  if (/^\d+$/.test(idLike)) {
    const r = await sql<AuthUser[]>`
      select user_id::text as sub, email, name, role::text as role
      from public.app_users
      where id = ${Number(idLike)} and active = true
      limit 1
    `;
    return r[0] ? { ...r[0], role: normalizeRole(r[0].role) } : null;
  }

  // Sonst: direkt via UUID
  const r = await sql<AuthUser[]>`
    select user_id::text as sub, email, name, role::text as role
    from public.app_users
    where user_id::text = ${idLike} and active = true
    limit 1
  `;
  return r[0] ? { ...r[0], role: normalizeRole(r[0].role) } : null;
}

/**
 * maybeUser: versucht so „robust" wie möglich den Benutzer zu ermitteln:
 * - Cookie/Header user_id (UUID ODER numerisch)
 * - Bearer (nur Präsenzcheck; kein Decode hier)
 * - lädt name/email/role IMMER aus DB (Cookies können veraltet sein)
 */
export async function maybeUser(req: NextRequest): Promise<AuthUser | null> {
  const cookieId = req.cookies.get('user_id')?.value || req.headers.get('x-user-id') || null;
  const token = bearerFrom(req);

  if (!cookieId && !token) return null;

  const user = await loadUserByAnyId(cookieId);
  return user ?? null;
}

export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const me = await maybeUser(req);
  if (!me) throw new UnauthorizedError('unauthorized');
  return me;
}

/* ---------------------- Rollen-Guards (neu) ---------------------- */

export function hasRole(user: { role: Role }, allowed: Role[]) {
  return allowed.includes(user.role);
}

export async function requireRole(req: NextRequest, allowed: Role[]): Promise<AuthUser> {
  const me = await requireUser(req);
  if (!hasRole(me, allowed)) {
    throw new ForbiddenError('forbidden');
  }
  return me;
}

// Bequemlichkeits-Shortcuts
export const requireAdmin = (req: NextRequest) => requireRole(req, ['admin']);
export const requireModOrAdmin = (req: NextRequest) => requireRole(req, ['admin', 'moderator']);

// NEUE SHORTCUTS für Teamleiter
export const requireAdminRights = (req: NextRequest) => 
  requireRole(req, ['admin', 'moderator', 'teamleiter']);

export const requireAdminOrTeamleiter = requireAdminRights; // Alias

/* ------------------- API-Handler-Helfer (optional) ------------------- */

// In API-Routen praktisch: kapselt 401/403
export function guardApi<T>(fn: (req: NextRequest, me: AuthUser) => Promise<T>, roles?: Role[]) {
  return async (req: NextRequest) => {
    try {
      const me = roles?.length ? await requireRole(req, roles) : await requireUser(req);
      const data = await fn(req, me);
      return json({ ok: true, data });
    } catch (e) {
      if (e instanceof UnauthorizedError) return json({ ok: false, error: 'unauthorized' }, 401);
      if (e instanceof ForbiddenError)    return json({ ok: false, error: 'forbidden'    }, 403);
      console.error('[api]', e);
      return json({ ok: false, error: 'internal' }, 500);
    }
  };
}
