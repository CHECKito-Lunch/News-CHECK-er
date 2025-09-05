// lib/requireAdmin.ts
import { cookies } from 'next/headers';
import { verifyToken, AUTH_COOKIE, type Role } from '@/lib/auth';

export async function requireAdmin(_req?: Request) {
  const jar = await cookies();
  let role = jar.get('user_role')?.value as Role | undefined;
  if (!role) {
    const jwt = jar.get(AUTH_COOKIE)?.value;
    if (jwt) {
      const session = await verifyToken(jwt).catch(() => null);
      role = (session?.role as Role) ?? undefined;
    }
  }
  if (role === 'admin' || role === 'moderator') {
    return { role };
  }
  return null;
}
