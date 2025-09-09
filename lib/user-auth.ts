// lib/user-auth.ts
import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifyToken, type Role, type Session } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type SessionLike = { sub: string; role: Role; name?: string };

export async function getUserFromCookies(): Promise<SessionLike | null> {
  // In manchen Next-Versionen ist cookies() sync, in anderen async typisiert – so sind wir safe:
  const jar: any = await (cookies() as any);
  const token: string | undefined = jar.get?.(AUTH_COOKIE)?.value ?? jar.get?.(AUTH_COOKIE)?.value;

  if (!token) return null;

  // 1) Eigenes HS256-Session-JWT?
  const local: Session | null = await verifyToken(token).catch(() => null);
  if (local?.sub) {
    return {
      sub: String(local.sub),
      role: (local.role as Role) ?? (jar.get?.('user_role')?.value as Role) ?? 'user',
      name: local.name ?? jar.get?.('user_name')?.value ?? undefined,
    };
  }

  // 2) Fallback: Supabase Access Token (aus /api/login)
  try {
    const s = supabaseAdmin();
    const { data, error } = await s.auth.getUser(token);
    if (error || !data?.user) return null;

    const role = (jar.get?.('user_role')?.value as Role) ?? 'user';
    const name =
      jar.get?.('user_name')?.value ||
      (data.user.user_metadata?.full_name as string | undefined) ||
      (data.user.user_metadata?.name as string | undefined);

    return { sub: data.user.id, role, name };
  } catch {
    return null;
  }
}
