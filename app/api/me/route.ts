/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/me/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import { verifyToken, type Session, type Role } from '@/lib/auth';

type Me = { user: { sub: string; role: Role; name?: string; email?: string } | null };

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

export async function GET(_req: NextRequest) {
  try {
    const c = await cookies(); // Next 15

    // 1) Bevorzugt: auth-JWT lesen + verifizieren
    const jwt = c.get('auth')?.value;
    const sess = await verifyToken(jwt);

    if (sess?.sub) {
      const sub = String(sess.sub);
      let role: Role = sess.role; // enthält auch 'teamleiter'
      let name: string | undefined = sess.name || undefined;
      let email: string | undefined = undefined;

      // 1a) DB überschreibt Rolle/Name/Email, wenn vorhanden
      if (isUUID(sub)) {
        const rows = await sql<{ role: string | null; name: string | null; email: string | null }[]>`
          select role, name, email
          from public.app_users
          where user_id = ${sub}::uuid
          limit 1
        `;
        if (rows[0]) {
          const r = rows[0];
          // Rolle hart mappen (Quelle der Wahrheit ist DB)
          if (r.role === 'admin' || r.role === 'moderator' || r.role === 'teamleiter' || r.role === 'user') {
            role = r.role as Role;
          } else {
            role = 'user';
          }
          name  = (r.name  ?? name)  || undefined;
          email = (r.email ?? email) || undefined;
        }
      }

      return NextResponse.json<Me>({ user: { sub, role, name, email } });
    }

    // 2) Fallback: einfache Cookies (legacy)
    const sub   = c.get('user_id')?.value || null;
    const roleC = c.get('user_role')?.value as Role | undefined; // darf 'teamleiter' sein
    let   name  = c.get('user_name')?.value || undefined;
    let   email = c.get('user_email')?.value || undefined;

    if (!sub || !roleC) {
      return NextResponse.json<Me>({ user: null }, { status: 200 });
    }

    // 2a) DB-Fallback, falls name/email fehlen
    if ((!name || !email) && isUUID(sub)) {
      const rows = await sql<{ name: string | null; email: string | null }[]>`
        select name, email
        from public.app_users
        where user_id = ${sub}::uuid
        limit 1
      `;
      if (rows[0]) {
        name  = (rows[0].name  ?? name)  || undefined;
        email = (rows[0].email ?? email) || undefined;
      }
    }

    // Rolle aus Cookie übernehmen (inkl. teamleiter)
    const role: Role =
      roleC === 'admin' || roleC === 'moderator' || roleC === 'teamleiter' || roleC === 'user'
        ? roleC
        : 'user';

    return NextResponse.json<Me>({ user: { sub, role, name, email } });
  } catch (e) {
    console.error('[me GET]', e);
    return NextResponse.json<Me>({ user: null }, { status: 200 });
  }
}
