// lib/auth.ts
import { SignJWT, jwtVerify } from 'jose';

export type Role = 'admin' | 'moderator' | 'user';
export type Session = { sub: string; role: Role; name?: string };

export const AUTH_COOKIE = 'auth';

export type AuthUser = {
  sub: string;
  email?: string;
  name?: string;
  role?: 'admin' | 'moderator' | 'user';
};

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret');

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
      role: payload.role as Role,
      name: (payload as any).name,
    };
  } catch {
    return null;
  }
}