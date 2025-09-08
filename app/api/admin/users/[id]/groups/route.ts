export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const uid = Number(params.id);
  if (!uid) return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });

  // map numeric "app_users.id" -> uuid "app_users.user_id" falls nötig
  const user = await sql<{ user_id: string }[]>`
    select user_id from public.app_users where id = ${uid}
  `;
  if (user.length === 0) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const sub = user[0].user_id;

  const rows = await sql<{ group_id: string }[]>`
    select group_id from public.group_members where user_id = ${sub}::uuid order by group_id
  `;
  const groupIds = rows.map(r => Number(r.group_id));
  return NextResponse.json({ ok: true, groupIds });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const uid = Number(params.id);
  if (!uid) return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const desired: number[] = Array.isArray(body.groupIds) ? body.groupIds.map(Number).filter(Boolean) : [];

  const user = await sql<{ user_id: string }[]>`select user_id from public.app_users where id = ${uid}`;
  if (user.length === 0) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const sub = user[0].user_id;

  const currentRows = await sql<{ group_id: string }[]>`
    select group_id from public.group_members where user_id = ${sub}::uuid
  `;
  const current = new Set(currentRows.map(r => Number(r.group_id)));
  const want = new Set(desired);

  const toAdd = [...want].filter(id => !current.has(id));
  const toDel = [...current].filter(id => !want.has(id));

  await sql.begin(async (trx) => {
    for (const id of toAdd) {
      await trx`
        insert into public.group_members (group_id, user_id, role)
        values (${id}::bigint, ${sub}::uuid, 'member')
        on conflict (group_id, user_id) do nothing;
      `;
    }
    if (toDel.length > 0) {
      await trx`
        delete from public.group_members
        where user_id = ${sub}::uuid and group_id = any(${toDel}::bigint[]);
      `;
    }
  });

  return NextResponse.json({ ok: true, added: toAdd, removed: toDel });
}
