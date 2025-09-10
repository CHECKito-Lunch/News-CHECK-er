// lib/user-auth.ts
import { cookies, headers } from 'next/headers';
import { AUTH_COOKIE, verifyToken, type Role, type Session } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type SessionLike = { sub: string; role: Role; name?: string };

/**
 * Liest User aus Cookies/Headers.
 * Unterstützt:
 *  - eigenes Session-JWT in AUTH_COOKIE
 *  - Supabase Access Token in 'auth' | 'sb-access-token' | 'sb:token'
 *  - Authorization: Bearer <token>
 */
export async function getUserFromCookies(): Promise<SessionLike | null> {
  // In einigen Next-Versionen ist cookies()/headers() async typisiert – so sind wir safe:
  const jar: any = await (cookies() as any);
  const hdr: any = await (headers() as any);

  // alle möglichen Token-Quellen zusammenführen
  const bearer = (() => {
    const h = hdr?.get?.('authorization') || hdr?.get?.('Authorization');
    if (!h) return undefined;
    const m = /^Bearer\s+(.+)$/i.exec(String(h));
    return m?.[1];
  })();

  const token: string | undefined =
    jar?.get?.(AUTH_COOKIE)?.value ||              // dein Haupt-Cookie (aus /api/login gesetzt)
    jar?.get?.('auth')?.value ||                   // evtl. altes/anderes Cookie
    jar?.get?.('sb-access-token')?.value ||        // gängiger Supabase-Name
    jar?.get?.('sb:token')?.value ||               // alternative Schreibweise
    bearer;                                        // Fallback: Authorization-Header

  if (!token) return null;

  // 1) eigenes HS256-Session-JWT?
  const local: Session | null = await verifyToken(token).catch(() => null);
  if (local?.sub) {
    return {
      sub: String(local.sub),
      role: (local.role as Role) ?? (jar?.get?.('user_role')?.value as Role) ?? 'user',
      name: local.name ?? jar?.get?.('user_name')?.value ?? undefined,
    };
  }

  // 2) Fallback: Supabase Access Token
  try {
    const s = supabaseAdmin();
    const { data, error } = await s.auth.getUser(token);
    if (error || !data?.user) return null;

    const role = (jar?.get?.('user_role')?.value as Role) ?? 'user';
    const name =
      jar?.get?.('user_name')?.value ||
      (data.user.user_metadata?.full_name as string | undefined) ||
      (data.user.user_metadata?.name as string | undefined);

    return { sub: data.user.id, role, name };
  } catch {
    return null;
  }
}
