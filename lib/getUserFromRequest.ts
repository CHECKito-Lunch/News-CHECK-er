// lib/getUserFromRequest.ts
import 'server-only';
import type { NextRequest } from 'next/server';

export type Role = 'admin' | 'moderator' | 'user';
export type User = { id: string; role?: Role; name?: string; email?: string };

/**
 * Best-effort User-Erkennung aus Request:
 * - Cookie "user_id"
 * - Header "x-user-id" (dev)
 * - Authorization: Bearer <userId> (dev)
 */
export async function getUserFromRequest(req: NextRequest): Promise<User | null> {
  // 1) Cookie
  const uidCookie = req.cookies.get('user_id')?.value?.trim();
  if (uidCookie) return { id: uidCookie };

  // 2) Dev-Header
  const hdr = req.headers.get('x-user-id')?.trim();
  if (hdr) return { id: hdr };

  // 3) Dev-Bearer
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) return { id: m[1].trim() };

  return null;
}
