// lib/admin-auth.ts
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';

async function decodeJwtSubFromCookie(): Promise<string | null> {
  // Supabase legt meist "sb-access-token" oder ein JSON in "sb:token" ab
  const raw =
    (await cookies()).get('sb-access-token')?.value ??
    (await cookies()).get('sb:token')?.value ??
    (await cookies()).get('supabase-auth-token')?.value ??
    null;

  if (!raw) return null;

  // Falls "sb:token" ein JSON string mit currentSession ist
  let token = raw;
  try {
    if (raw.trim().startsWith('{')) {
      const j = JSON.parse(raw);
      token = j?.currentSession?.access_token ?? j?.access_token ?? token;
    }
  } catch {
    /* ignore */
  }
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length < 2) return null;

  const payloadStr = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  try {
    const payload = JSON.parse(payloadStr);
    return payload?.sub ?? null; // Supabase user id
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  // Dev-Bypass möglich
  if (process.env.DEV_BYPASS_ADMIN === '1') return { ok: true as const, userId: 'dev-admin' };

  const userId = decodeJwtSubFromCookie();
  if (!userId) return { ok: false as const, code: 401 as const };

  const [me] = await sql<{ role: string }[]>`
    select role from public.app_users
    where user_id = ${await userId} and active = true
    limit 1
  `;
  if (me?.role !== 'admin') return { ok: false as const, code: 403 as const };
  return { ok: true as const, userId };
}
