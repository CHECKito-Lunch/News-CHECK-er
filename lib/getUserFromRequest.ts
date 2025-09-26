// lib/getUserFromRequest.ts
import 'server-only';
import { cookies, headers } from 'next/headers';

export async function getUserFromRequest(req?: Request): Promise<{ id: string } | null> {
  try {
    // 1) Cookie aus Request oder Next cookies()
    const cookieHeader =
      req?.headers.get('cookie') ??
      cookies().toString(); // serialisiert alle Cookies

    const m = cookieHeader?.match(/(?:^|;\s*)user_id=([^;]+)/);
    if (m?.[1]) return { id: decodeURIComponent(m[1]) };

    // 2) Authorization aus Request oder Next headers()
    const auth =
      req?.headers.get('authorization') ??
      (await headers()).get('authorization') ??
      '';

    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (bearer) return { id: bearer };

    return null;
  } catch {
    return null;
  }
}
