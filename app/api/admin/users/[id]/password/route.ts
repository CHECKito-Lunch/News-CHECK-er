// app/api/admin/users/[id]/password/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyToken, AUTH_COOKIE, type Role } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function resolveRoleFromCookies(): Promise<Role | null> {
  const jar = await cookies();
  let role = jar.get('user_role')?.value as Role | undefined;
  if (!role) {
    const jwt = jar.get(AUTH_COOKIE)?.value;
    if (jwt) {
      const session = await verifyToken(jwt).catch(() => null);
      role = (session?.role as Role) ?? undefined;
    }
  }
  return (role ?? null) as Role | null;
}

export async function PATCH(req: Request, { params }: any) {
  try {
    // Admin-/Moderator-Guard
    const role = await resolveRoleFromCookies();
    if (role !== 'admin' && role !== 'moderator') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const password = (body?.password || '') as string;
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: 'Passwort ist zu kurz (min. 8 Zeichen).' },
        { status: 400 }
      );
    }

    const id = Number(params?.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
    }

    const s = supabaseAdmin();

    // app_users → user_id ermitteln (per ID)
    const { data: row, error: fetchErr } = await s
      .from('app_users')
      .select('user_id, email')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!row?.user_id) {
      return NextResponse.json(
        { error: 'Kein Auth-User für diesen Eintrag (user_id fehlt).' },
        { status: 400 }
      );
    }

    // Passwort setzen
    const { error: updErr } = await s.auth.admin.updateUserById(row.user_id, { password });
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    await s.from('app_users')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
