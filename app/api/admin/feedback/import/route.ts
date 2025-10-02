// app/api/admin/feedback/import/route.ts
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (d: any, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const me = await getAdminFromCookies(req).catch(() => null);
  if (!me) return json({ ok: false, error: 'unauthorized' }, 401);

  // Body lesen
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const user_id_raw = String(body?.user_id ?? '').trim();
  if (!user_id_raw) return json({ ok: false, error: 'user_id_required' }, 400);

  // ➜ Ziel-UUID des Users ermitteln:
  // - Wenn schon eine UUID, direkt nutzen
  // - Wenn eine numerische ID (app_users.id), dann die passende UUID nachschlagen
  let user_uuid: string | null = null;

  if (UUID_RE.test(user_id_raw)) {
    user_uuid = user_id_raw;
  } else {
    const asNum = Number(user_id_raw);
    if (!Number.isFinite(asNum)) {
      return json({ ok: false, error: 'invalid_user_id' }, 400);
    }
    const rows = await sql<{ user_id: string | null }[]>`
      select user_id from public.app_users where id = ${asNum} limit 1
    `;
    user_uuid = rows[0]?.user_id ?? null;
  }

  if (!user_uuid) {
    return json({ ok: false, error: 'user_uuid_not_found' }, 404);
  }

  // Rows absichern (Array erzwingen)
  const rowsInput = body?.rows;
  const rowsArr: any[] = Array.isArray(rowsInput)
    ? rowsInput
    : rowsInput
    ? [rowsInput]
    : [];

  if (rowsArr.length === 0) return json({ ok: true, inserted: 0 });

  // Payload als JSON-Text (später zu jsonb gecastet)
  const payload = JSON.stringify(rowsArr);

  // Import: feedback_at -> ::date (passt zur Tabelle),
  // Null-Handling & Defaults bleiben wie gehabt
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
      ${user_uuid}::uuid,
      nullif(r.feedback_at,'')::date,       -- ⬅️ wichtig: ::date statt ::timestamptz
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

  return json({ ok: true, inserted: result.length });
}
