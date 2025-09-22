// app/api/admin/groups/[id]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';
import bcrypt from 'bcryptjs';

const json = <T,>(d: T, s = 200) => NextResponse.json<T>(d, { status: s });

function getId(url: string): number | null {
  try {
    const p = new URL(url).pathname.split('/').filter(Boolean);
    const id = Number(p[p.length - 1]);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await getAdminFromCookies())) return json({ ok: false, error: 'forbidden' }, 401);

  const id = getId(req.url);
  if (!id) return json({ ok: false, error: 'invalid_id' }, 400);

  // Body robust lesen & als Map typisieren
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // ❗ Wichtig: niemals undefined ins SQL geben → auf null normalisieren
  const name: string | null =
    Object.prototype.hasOwnProperty.call(b, 'name') ? ((b['name'] as string | null | undefined) ?? null) : null;

  const description: string | null =
    Object.prototype.hasOwnProperty.call(b, 'description') ? ((b['description'] as string | null | undefined) ?? null) : null;

  const is_active: boolean | null =
    Object.prototype.hasOwnProperty.call(b, 'is_active') ? !!b['is_active'] : null;

  const is_private: boolean | null =
    Object.prototype.hasOwnProperty.call(b, 'is_private') ? !!b['is_private'] : null;

  const clear_pw: boolean = !!b?.['clear_password'];
  const new_pw_raw: string = (b?.['password'] ?? '').toString().trim();
  const hash: string | null = new_pw_raw ? await bcrypt.hash(new_pw_raw, 10) : null;

  try {
    await sql`
      update public.groups set
        name               = coalesce(${name}::text, name),
        description        = coalesce(${description}::text, description),
        is_active          = coalesce(${is_active}::bool, is_active),
        is_private         = coalesce(${is_private}::bool, is_private),
        join_password_hash = case
                               when ${clear_pw} then null
                               when ${hash}::text is not null then ${hash}
                               else join_password_hash
                             end
      where id = ${id}
    `;
    return json({ ok: true });
  } catch (e: unknown) {
    console.error('[admin/groups PATCH]', e);
    const msg = e instanceof Error ? e.message : 'server_error';
    return json({ ok: false, error: msg }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminFromCookies())) return json({ ok: false, error: 'forbidden' }, 401);

  const id = getId(req.url);
  if (!id) return json({ ok: false, error: 'invalid_id' }, 400);

  try {
    // Reihenfolge: erst memberships, dann group
    await sql`delete from public.group_members where group_id = ${id}`;
    await sql`delete from public.groups where id = ${id}`;
    return json({ ok: true });
  } catch (e: unknown) {
    console.error('[admin/groups DELETE]', e);
    const msg = e instanceof Error ? e.message : 'server_error';
    return json({ ok: false, error: msg }, 500);
  }
}
