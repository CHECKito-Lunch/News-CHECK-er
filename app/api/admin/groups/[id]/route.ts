// app/api/admin/groups/[id]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gid = Number(params.id);
  if (!Number.isFinite(gid)) {
    return NextResponse.json({ ok: false, error: 'invalid_group_id' }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
    const hasDesc = Object.prototype.hasOwnProperty.call(body, 'description');
    const hasActive = Object.prototype.hasOwnProperty.call(body, 'is_active');

    // Wenn nichts geliefert wurde -> 400
    if (!hasName && !hasDesc && !hasActive) {
      return NextResponse.json({ ok: false, error: 'no_fields' }, { status: 400 });
    }

    // Werte (auch null zulassen für description)
    const name = hasName ? (body.name == null ? null : String(body.name).trim()) : null;
    const description = hasDesc ? (body.description == null ? null : String(body.description)) : null;
    const is_active = hasActive ? Boolean(body.is_active) : null;

    await sql`
      update public.groups
      set
        name        = case when ${hasName}  then ${name}       else name end,
        description = case when ${hasDesc}  then ${description} else description end,
        is_active   = case when ${hasActive} then ${is_active}   else is_active end
      where id = ${gid}
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message ?? 'server_error';
    const status = /unique/i.test(msg) ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gid = Number(params.id);
  if (!Number.isFinite(gid)) {
    return NextResponse.json({ ok: false, error: 'invalid_group_id' }, { status: 400 });
  }
  try {
    await sql`delete from public.groups where id = ${gid}`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
