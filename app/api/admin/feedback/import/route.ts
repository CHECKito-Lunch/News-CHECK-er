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

  // user_id muss UUID sein (kommt vom Select im Admin-UI)
  const user_id_raw = String(body?.user_id ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user_id_raw)) {
    return NextResponse.json({ ok: false, error: 'user_id_must_be_uuid' }, { status: 400 });
  }

  // rows muss ein Array sein
  const rowsIn: unknown = body?.rows;
  const rowsArr: IncomingRow[] = Array.isArray(rowsIn) ? (rowsIn as IncomingRow[]) : [];
  if (rowsArr.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  // Frontend liefert bereits Strings/Zahlen – wir validieren/konvertieren DB-seitig.
  // Wichtig: Wir schicken IMMER ein echtes JSON-Array.
  const payload = JSON.stringify(rowsArr);

  try {
    const inserted = await sql<{ inserted: number }[]>`
      with src as (
        -- robust: egal was kommt, wir arbeiten auf Array-Elementen
        select jsonb_array_elements(${payload}::jsonb) as j
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

        -- Datum (NOT NULL in DB) aus ts
        (j->>'ts')::date,

        -- Channel aus feedbacktyp
        nullif(j->>'feedbacktyp',''),

        -- Bewertungen: nur 1..5 zulassen, sonst NULL
        case when (j->>'bewertung')::int between 1 and 5 then (j->>'bewertung')::int else null end,
        case when (j->>'beraterfreundlichkeit')::int between 1 and 5 then (j->>'beraterfreundlichkeit')::int else null end,
        case when (j->>'beraterqualifikation')::int between 1 and 5 then (j->>'beraterqualifikation')::int else null end,
        case when (j->>'angebotsattraktivitaet')::int between 1 and 5 then (j->>'angebotsattraktivitaet')::int else null end,

        nullif(j->>'kommentar',''),
        nullif(j->>'template_name',''),

        -- booleans aus "ja"/"nein", "true"/"false", "1"/"0"
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
      -- nur Zeilen mit gültigem Datum einfügen (DB verlangt NOT NULL)
      where (j->>'ts')::date is not null
      returning 1 as inserted
    `;

    return NextResponse.json({ ok: true, inserted: inserted.length });
  } catch (e: any) {
    console.error('[feedback/import]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
