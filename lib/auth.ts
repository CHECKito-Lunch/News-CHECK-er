/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/auth.ts
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify, decodeJwt } from 'jose';
import { sql } from '@/lib/db';

/** Name des Auth-Cookies (JWT) – kollidiert evtl. mit Supabase */
export const AUTH_COOKIE = 'auth';

export type Role = 'admin' | 'moderator' | 'teamleiter' | 'user';
export type Session = { sub: string; role: Role; name?: string };
export type AuthUser = { sub: string; email?: string; name?: string; role?: Role };
export type SessionUser = { sub: string; user_id: string; role: Role; name?: string; email?: string };

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret');

/* ---------------- JWT sign/verify (für DEINEN eigenen Token) ---------------- */
export async function signSession(session: Session) {
  return await new SignJWT(session).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);
}

export async function verifyToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const roleRaw = payload.role as Role | undefined;
    const role: Role = roleRaw === 'admin' || roleRaw === 'moderator' || roleRaw === 'teamleiter' ? roleRaw : 'user';
    return { sub: String(payload.sub), role, name: (payload as any).name };
  } catch {
    return null;
  }
}

/* ---------------- Helpers ---------------- */
const isRole = (v: unknown): v is Role =>
  v === 'admin' || v === 'moderator' || v === 'teamleiter' || v === 'user';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

/**
 * Robustes SSR-Login (request-unabhängig):
 * 1) Versuche eigenen JWT aus AUTH_COOKIE zu verifizieren
 * 2) Fallback: Legacy-Cookies user_role/user_id/user_name
 * 3) Fallback: Supabase sb-*-auth-token (Base64-JSON), um mindestens sub/email zu bekommen
 * Danach: Rolle/Name/Email wenn möglich aus DB überschreiben (Quelle der Wahrheit)
 */
export async function getUserFromCookies(): Promise<SessionUser | null> {
  const c = cookies();

  /* 1) Eigener JWT im AUTH_COOKIE */
  const token = (await c).get(AUTH_COOKIE)?.value;
  const sess = await verifyToken(token);
  if (sess?.sub) {
    const enriched = await enrichFromDb(sess.sub, sess.role, sess.name);
    if (enriched) return enriched;
    // Fallback ohne DB
    return {
      sub: String(sess.sub),
      user_id: String(sess.sub),
      role: sess.role,
      name: sess.name,
    };
  }

  /* 2) Legacy-Cookies */
  const cookieRole = (await c).get('user_role')?.value;
  const cookieUserId = (await c).get('user_id')?.value || '';
  const cookieUserName = (await c).get('user_name')?.value;
  if (isRole(cookieRole) && cookieUserId) {
    const role = cookieRole;
    const sub = cookieUserId;
    const enriched = await enrichFromDb(sub, role, cookieUserName);
    if (enriched) return enriched;
    return {
      sub: String(sub),
      user_id: String(sub),
      role,
      name: cookieUserName,
    };
  }

  /* 3) Supabase sb-*-auth-token (Base64-JSON) */
  const sbCookie = [...(await c).getAll()].find(kv => kv.name.includes('-auth-token'));
  if (sbCookie?.value) {
    // Formate: "base64-<b64>" oder direkt JWT; wir behandeln beides tolerant
    const val = sbCookie.value.startsWith('base64-') ? sbCookie.value.substring('base64-'.length) : sbCookie.value;
    let sub: string | undefined;
    let name: string | undefined;
    let email: string | undefined;

    try {
      // Case A: Base64-kapseltes JSON { access_token, user: {...} }
      const json = JSON.parse(Buffer.from(val, 'base64').toString('utf8'));
      if (json?.user?.id) sub = String(json.user.id);
      if (json?.user?.email) email = String(json.user.email);
      if (json?.user?.user_metadata?.name) name = String(json.user.user_metadata.name);
    } catch {
      try {
        // Case B: Access-Token ist ein JWT → sub/email aus Payload nehmen (UNVERIFIED read)
        const decoded = decodeJwt(val);
        if (decoded?.sub) sub = String(decoded.sub);
        if ((decoded as any)?.email) email = String((decoded as any).email);
        if ((decoded as any)?.name) name = String((decoded as any).name);
      } catch {
        /* ignore */
      }
    }

    if (sub) {
      // Ohne Rolle → default 'user', Rolle evtl. aus DB
      const enriched = await enrichFromDb(sub, 'user', name, email);
      if (enriched) return enriched;
      return {
        sub: String(sub),
        user_id: String(sub),
        role: 'user',
        name,
        email,
      };
    }
  }

  /* Kein Auth-Context gefunden */
  return null;
}

/** DB-Enrichment: Rolle/Name/Email aus app_users holen; akzeptiert sub als UUID oder string */
async function enrichFromDb(
  sub: string,
  fallbackRole: Role,
  fallbackName?: string,
  fallbackEmail?: string
): Promise<SessionUser | null> {
  try {
    // Wenn sub keine UUID ist, kann die Query fehlschlagen; dann skippen wir DB (und nutzen Fallback)
    if (!isUUID(sub)) return null;

    const rows = await sql/*sql*/`
      select user_id, role, name, email
      from public.app_users
      where user_id = ${sub}::uuid
      limit 1
    `;
    if (rows.length > 0) {
      const r = rows[0] as { user_id: string; role: string | null; name?: string | null; email?: string | null };
      const dbRole: Role =
        r.role === 'admin' || r.role === 'moderator' || r.role === 'teamleiter' ? (r.role as Role) : 'user';
      return {
        sub: String(r.user_id),
        user_id: String(r.user_id),
        role: dbRole,
        name: r.name ?? fallbackName ?? undefined,
        email: r.email ?? fallbackEmail ?? undefined,
      };
    }
  } catch {
    // DB down → kein Enrichment
  }
  return null;
}

/* ---------------- Kleine Helfer ---------------- */
export const isAdminOrMod = (role?: Role) => role === 'admin' || role === 'moderator';
export const isTeamlead   = (role?: Role) => role === 'teamleiter';
