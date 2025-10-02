// app/api/admin/feedback/import/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

type IncomingRow = {
  ts?: string | null;
  bewertung?: number | null;
  beraterfreundlichkeit?: number | null;
  beraterqualifikation?: number | null;
  angebotsattraktivitaet?: number | null;
  kommentar?: string | null;
  template_name?: string | null;
  rekla?: 'ja' | 'nein' | string | null;
  geklaert?: 'ja' | 'nein' | string | null;
  feedbacktyp?: string | null;
  note?: string | null;
};

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookies(req).catch(() => null);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  // UUID-Check
  const user_id_raw = String(body?.user_id ?? '').trim();
  const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRx.test(user_id_raw)) {
    return NextResponse.json({ ok: false, error: 'user_id_must_be_uuid' }, { status: 400 });
  }

  // -------- rows robust normalisieren (Array<Object>)
  let rowsVal: unknown = body?.rows;

  // Falls als String geliefert (double-encoded), versuchen zu parsen
  if (typeof rowsVal === 'string') {
    try {
      rowsVal = JSON.parse(rowsVal);
    } catch {
      // ignorieren – behandeln wir unten
    }
  }

  // Auf Array<Object> bringen
  let rowsArr: IncomingRow[] = [];
  if (Array.isArray(rowsVal)) {
    rowsArr = rowsVal.filter((x) => x && typeof x === 'object') as IncomingRow[];
  } else if (rowsVal && typeof rowsVal === 'object') {
    rowsArr = [rowsVal as IncomingRow];
  } else {
    rowsArr = [];
  }

  if (rowsArr.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: 0 });
  }

  const payload = JSON.stringify(rowsArr); // garantiert: JSON-Array

  try {
    const res = await sql<{ inserted: number }[]>`
      with raw as (
        -- Fallback: wenn wider Erwarten kein Array, wrappe zu Array
        select case
                 when jsonb_typeof(${payload}::jsonb) = 'array'
                   then ${payload}::jsonb
                 else jsonb_build_array(${payload}::jsonb)
               end as arr
      ),
      src as (
        select jsonb_array_elements(arr) as j
        from raw
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
        ${user_id_raw}::uuid,
        -- NOT NULL: nur Zeilen mit gültigem Datum
        (j->>'ts')::date,
        nullif(j->>'feedbacktyp',''),
        case when (j->>'bewertung')::int between 1 and 5 then (j->>'bewertung')::int else null end,
        case when (j->>'beraterfreundlichkeit')::int between 1 and 5 then (j->>'beraterfreundlichkeit')::int else null end,
        case when (j->>'beraterqualifikation')::int between 1 and 5 then (j->>'beraterqualifikation')::int else null end,
        case when (j->>'angebotsattraktivitaet')::int between 1 and 5 then (j->>'angebotsattraktivitaet')::int else null end,
        nullif(j->>'kommentar',''),
        nullif(j->>'template_name',''),
        case
          when lower(coalesce(j->>'rekla','')) in ('ja','yes','y','true','1') then true
          when lower(coalesce(j->>'rekla','')) in ('nein','no','n','false','0') then false
          else null
        end,
        case
          when lower(coalesce(j->>'geklaert','')) in ('ja','yes','y','true','1') then true
          when lower(coalesce(j->>'geklaert','')) in ('nein','no','n','false','0') then false
          else null
        end,
        nullif(j->>'note','')
      from src
      where (j->>'ts')::date is not null
      returning 1 as inserted
    `;

    return NextResponse.json({ ok: true, inserted: res.length });
  } catch (e: any) {
    console.error('[feedback/import] k:', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
