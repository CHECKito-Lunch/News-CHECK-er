// lib/auth-server.ts
import { headers as nextHeaders, cookies as nextCookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AUTH_COOKIE } from '@/lib/auth';

export type Authed = { userId: string; email: string | null; token?: string | null };

class UnauthorizedError extends Error {
  status = 401 as const;
  constructor(msg = 'unauthorized') { super(msg); }
}

/** Cookie-Header manuell parsen (Fallback, wenn req übergeben wurde) */
function readCookieFromHeader(headerValue: string | null, name: string): string | null {
  if (!headerValue) return null;
  const parts = headerValue.split(';');
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('=') || '');
  }
  return null;
}

async function readCookie(name: string, req?: Request): Promise<string | null> {
  // 1) Falls Request übergeben: zuerst daraus lesen (funktioniert auch in Edge/Route-Handlern zuverlässig)
  if (req) {
    const fromReq = readCookieFromHeader(req.headers.get('cookie'), name);
    if (fromReq) return fromReq;
  }
  // 2) Fallback: Next.js cookies() (asynchron in deiner Version)
  try {
    const ck = await nextCookies();
    return ck.get(name)?.value ?? null;
  } catch {
    return null;
  }
}

async function readAuthz(req?: Request): Promise<string> {
  if (req) return req.headers.get('authorization') || '';
  try {
    const hdr = await nextHeaders();
    return hdr.get('authorization') || '';
  } catch {
    return '';
  }
}

export async function requireUser(req?: Request): Promise<Authed> {
  const s = supabaseAdmin();

  // 1) Authorization: Bearer ...
  const authz = await readAuthz(req);
  const m = /^Bearer\s+(.+)$/i.exec(authz);
  const headerToken = m?.[1] ?? null;

  // 2) Kandidaten aus Cookies (mehrere Namen zulassen)
  const candidates = [
    headerToken,
    await readCookie(AUTH_COOKIE, req),
    await readCookie('AUTH_COOKIE', req),
    await readCookie('auth', req),
    await readCookie('sb-access-token', req),
  ].filter(Boolean) as string[];

  for (const token of candidates) {
    const { data, error } = await s.auth.getUser(token);
    if (!error && data?.user) {
      return { userId: data.user.id, email: data.user.email ?? null, token };
    }
  }

  // 3) Dev-Fallback: user_id-Cookie prüfen (nur wenn aktiv in app_users)
  const uid = await readCookie('user_id', req);
  if (uid) {
    const { data, error } = await s
      .from('app_users')
      .select('id, active, email')
      .eq('user_id', uid)
      .maybeSingle();
    if (!error && data && data.active) {
      return { userId: uid, email: data.email ?? null, token: null };
    }
  }

  throw new UnauthorizedError();
}
