export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (data: unknown, status = 200) =>
  new NextResponse(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export async function GET(req: NextRequest) {
  const me = await getUserFromCookies().catch(()=>null);
  if (!me) return json({ ok:false, error:'unauthorized' }, 401);

  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get('owner_id');

  const rows = await sql/*sql*/`
    select feedback_id, mark
    from public.feedback_marks
    where viewer_user_id = ${me.user_id}::uuid
      and (${ownerId ? sql`owner_user_id = ${ownerId}::uuid` : sql`true`})
  `;
  return json({ ok:true, items: rows });
}

export async function POST(req: NextRequest) {
  const me = await getUserFromCookies().catch(()=>null);
  if (!me) return json({ ok:false, error:'unauthorized' }, 401);

  const b = await req.json().catch(()=>null) as { feedback_id?: number|string; mark?: number; owner_id?: string };
  const fid = Number(b?.feedback_id);
  const mark = Number(b?.mark ?? 0); // -1 | 0 | 1 | 2
  if (!Number.isFinite(fid) || ![-1,0,1,2].includes(mark)) return json({ ok:false, error:'bad_input' }, 400);

  if (mark === 0) {
    await sql/*sql*/`
      delete from public.feedback_marks
      where viewer_user_id = ${me.user_id}::uuid and feedback_id = ${fid}::bigint
    `;
  } else {
    await sql/*sql*/`
      insert into public.feedback_marks (viewer_user_id, feedback_id, owner_user_id, mark)
      values (${me.user_id}::uuid, ${fid}::bigint, ${b?.owner_id||null}, ${mark})
      on conflict (viewer_user_id, feedback_id)
      do update set mark = excluded.mark, owner_user_id = excluded.owner_user_id
    `;
  }
  return json({ ok:true });
}
