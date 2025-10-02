// app/api/admin/feedback/bulk-update/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

// entfernt undefined-Keys und wandelt undefined->null
function cleanPatch(obj: any) {
  const allowed = [
    'id','channel','rating_overall','rating_friend','rating_qual','rating_offer',
    'comment_raw','template_name','reklamation','resolved','note'
  ] as const;
  const out: Record<string, any> = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      const v = obj[k];
      out[k] = (v === undefined) ? null : v;
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookies(req).catch(() => null);
  if (!admin) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  let body:any = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok:false, error:'invalid_json' }, { status:400 });
  }

  const user_id = body?.user_id;
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (!isUUID(user_id)) return NextResponse.json({ ok:false, error:'user_id_must_be_uuid' }, { status:400 });
  if (rawItems.length === 0) return NextResponse.json({ ok:true, updated: 0 });

  // 💡 hier säubern: keine undefined in sqlJson!
  const items = rawItems.map(cleanPatch);

  const result = await sql<{ updated:number }[]>`
    with src as (
      select *
      from jsonb_to_recordset(${sqlJson(items)}) as r(
        id              bigint,
        channel         text,
        rating_overall  int,
        rating_friend   int,
        rating_qual     int,
        rating_offer    int,
        comment_raw     text,
        template_name   text,
        reklamation     boolean,
        resolved        boolean,
        note            text
      )
    )
    update public.user_feedback t set
      channel        = coalesce(s.channel,        t.channel),
      rating_overall = coalesce(s.rating_overall, t.rating_overall),
      rating_friend  = coalesce(s.rating_friend,  t.rating_friend),
      rating_qual    = coalesce(s.rating_qual,    t.rating_qual),
      rating_offer   = coalesce(s.rating_offer,   t.rating_offer),
      comment_raw    = coalesce(s.comment_raw,    t.comment_raw),
      template_name  = coalesce(s.template_name,  t.template_name),
      reklamation    = coalesce(s.reklamation,    t.reklamation),
      resolved       = coalesce(s.resolved,       t.resolved),
      note           = coalesce(s.note,           t.note)
    from src s
    where t.id = s.id and t.user_id = ${user_id}::uuid
    returning 1 as updated
  `;

  return NextResponse.json({ ok:true, updated: result.length });
}