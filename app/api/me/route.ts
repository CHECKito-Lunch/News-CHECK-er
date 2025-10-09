/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/me/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db'; // ← dein DB-Helper

type Role = 'admin' | 'moderator' | 'user';
type Me = { user: { sub: string; role: Role; name?: string; email?: string } | null };

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

export async function GET(_req: NextRequest) {
  try {
    const c = await cookies(); // Next 15
    const sub   = c.get('user_id')?.value || null;         // uuid der Person
    const role  = c.get('user_role')?.value as Role | undefined;
    let   name  = c.get('user_name')?.value || undefined;  // optionales Cookie
    let   email = c.get('user_email')?.value || undefined; // optionales Cookie

    if (!sub || !role) {
      return NextResponse.json<Me>({ user: null }, { status: 200 });
    }

    // DB-Fallback, falls Cookies name/email fehlen
    if ((!name || !email) && isUUID(sub)) {
      const rows = await sql<{ name: string | null; email: string }[]>`
        select name, email
        from public.app_users
        where user_id = ${sub}::uuid
        limit 1
      `;
      if (rows[0]) {
        name  = rows[0].name ?? name;
        email = rows[0].email ?? email;
      }
    }

    return NextResponse.json<Me>({ user: { sub, role, name, email } });
  } catch (e) {
    console.error('[me GET]', e);
    return NextResponse.json<Me>({ user: null }, { status: 200 });
  }
}
