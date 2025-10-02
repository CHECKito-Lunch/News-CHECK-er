// app/api/admin/feedback/import/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (d:any, s=200) => new Response(JSON.stringify(d), {
  status: s,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

export async function POST(req: NextRequest) {
  const me = await getAdminFromCookies(req).catch(() => null);
  if (!me) return json({ ok:false, error:'unauthorized' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok:false, error:'invalid json' }, 400);
  }

  const user_id = String(body?.user_id || '');
  if (!user_id) return json({ ok:false, error:'user_id required' }, 400);

  // ✅ rows hart absichern
  const rowsInput = body?.rows;
  const rowsArr: any[] =
    Array.isArray(rowsInput) ? rowsInput
    : rowsInput ? [rowsInput]
    : [];

  // Wenn leer: nichts tun (oder 204)
  if (rowsArr.length === 0) return json({ ok:true, inserted: 0 });

  // ✅ SQL: Parameter auf Array „zwingen“
  // jsonb_typeof(...) checkt den Typ; wenn nicht "array", wrappen wir mit jsonb_build_array(...)
  const payload = JSON.stringify(rowsArr);

  const result = await sql<{ inserted: number }[]>`
    with src as (
      select * from jsonb_to_recordset(
        case
          when jsonb_typeof(${payload}::jsonb) = 'array'
            then ${payload}::jsonb
          else jsonb_build_array(${payload}::jsonb)
        end
      ) as r(
        feedback_at       text,
        channel           text,
        rating_overall    int,
        rating_friend     int,
        rating_qual       int,
        rating_offer      int,
        comment_raw       text,
        template_name     text,
        reklamation       boolean,
        resolved          boolean,
        note              text
      )
    )
    insert into public.user_feedback (
      user_id,
      feedback_at,
      channel,
      rating_overall,
      rating_friend,
      rating_qual,
      rating_offer,
      comment_raw,
      template_name,
      reklamation,
      resolved,
      note
    )
    select
      ${user_id}::uuid,
      nullif(r.feedback_at,'')::timestamptz,
      nullif(r.channel,''),
      nullif(r.rating_overall,0),
      nullif(r.rating_friend,0),
      nullif(r.rating_qual,0),
      nullif(r.rating_offer,0),
      nullif(r.comment_raw,''),
      nullif(r.template_name,''),
      coalesce(r.reklamation,false),
      coalesce(r.resolved,false),
      nullif(r.note,'')
    from src r
    returning 1 as inserted
  `;

  return json({ ok:true, inserted: result.length });
}
