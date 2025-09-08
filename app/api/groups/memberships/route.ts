// app/api/groups/memberships/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUserSub } from '@/lib/me';

export async function POST(req: Request) {
  try {
    const sub = await requireUserSub();
    const body = await req.json().catch(() => ({}));
    const groupId = Number(body.groupId);
    const action = body.action as 'join' | 'leave';

    if (!groupId || !['join','leave'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    }

    if (action === 'join') {
      await sql`
        insert into public.group_members (group_id, user_id, role)
        values (${groupId}::bigint, ${sub}::uuid, 'member')
        on conflict (group_id, user_id) do nothing;
      `;
    } else {
      await sql`
        delete from public.group_members
        where group_id = ${groupId}::bigint and user_id = ${sub}::uuid;
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    const code = msg === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}



export async function GET() {
  try {
    const sub = await requireUserSub();
    const rows = await sql<{ group_id: string }[]>`
      select group_id
      from public.group_members
      where user_id = ${sub}::uuid
      order by group_id asc;
    `;
    const groupIds = rows.map(r => Number(r.group_id));
    return NextResponse.json({ ok: true, groupIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    const code = msg === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}

export async function PUT(req: Request) {
  try {
    const sub = await requireUserSub();
    const body = await req.json().catch(() => ({}));
    const desired: number[] = Array.isArray(body.groupIds) ? body.groupIds.map(Number).filter(Boolean) : [];

    // Aktuell
    const currentRows = await sql<{ group_id: string }[]>`
      select group_id from public.group_members where user_id = ${sub}::uuid;
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    const code = msg === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}