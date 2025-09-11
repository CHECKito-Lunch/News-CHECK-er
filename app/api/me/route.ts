// app/api/me/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

type Role = 'admin' | 'moderator' | 'user';
type Me = { user: { sub: string; role: Role; name?: string; email?: string } | null };

export async function GET(_req: NextRequest) {
  try {
    const c = await cookies(); // Next 15: async
    const sub   = c.get('user_id')?.value || null;
    const role  = c.get('user_role')?.value as Role | undefined;
    const name  = c.get('user_name')?.value || undefined;
    const email = c.get('user_email')?.value || undefined;

    if (!sub || !role) {
      return NextResponse.json<Me>({ user: null }, { status: 200 });
    }
    return NextResponse.json<Me>({ user: { sub, role, name, email } });
  } catch (e) {
    console.error('[me GET]', e);
    // niemals 500 werfen – lieber neutral antworten
    return NextResponse.json<Me>({ user: null }, { status: 200 });
  }
}
