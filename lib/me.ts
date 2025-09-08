// /lib/me.ts
import { cookies } from 'next/headers';
import { verifyToken, AUTH_COOKIE } from '@/lib/auth';

export async function requireUserSub() {
  const jar = await cookies();
  const jwt = jar.get(AUTH_COOKIE)?.value;
  const session = await verifyToken(jwt);
  const sub = session?.sub; // uuid der app_users.user_id
  if (!sub) throw new Error('unauthorized');
  return sub as string;
}
