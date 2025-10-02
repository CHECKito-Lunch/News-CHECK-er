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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObj(v: unknown): v is Record<string, any> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function toInt(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function toBool(v: any): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['ja','yes','true','wahr','1','y','j'].includes(s)) return true;
    if (['nein','no','false','falsch','0','n'].includes(s)) return false;
  }
  return null;
}
function toDateString(v: any): string | null {
  // akzeptiert ISO, 'YYYY-MM-DD', oder TS/Datum; gibt 'YYYY-MM-DD' zurück
  if (!v) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    // häufigster Fall: bereits Datum
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
    return null;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}

// … oben bleibt gleich …
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

  // rows robust absichern (auch wenn ein einzelnes Objekt kommt)
  const rowsInput = body?.rows;
  const rowsArr: any[] =
    Array.isArray(rowsInput) ? rowsInput
    : rowsInput && typeof rowsInput === 'object' ? [rowsInput]
    : [];

  if (rowsArr.length === 0) return json({ ok:true, inserted: 0 });

  const payload = JSON.stringify(rowsArr);

  const result = await sql<{ inserted: number }[]>`
    with data as (
      select case
        when jsonb_typeof(${payload}::jsonb) = 'array'  then ${payload}::jsonb
        when jsonb_typeof(${payload}::jsonb) = 'object' then jsonb_build_array(${payload}::jsonb)
        else '[]'::jsonb
      end as j
    ),
    elems as (
      select elem
      from data, lateral jsonb_array_elements(j) as elem
      where jsonb_typeof(elem) = 'object'
    ),
    casted as (
      select
        nullif(elem->>'ts','')::timestamptz               as ts_raw,
        nullif(elem->>'feedbacktyp','')                   as channel,
        nullif((elem->>'bewertung')::int,0)               as rating_overall,
        nullif((elem->>'beraterfreundlichkeit')::int,0)   as rating_friend,
        nullif((elem->>'beraterqualifikation')::int,0)    as rating_qual,
        nullif((elem->>'angebotsattraktivitaet')::int,0)  as rating_offer,
        nullif(elem->>'kommentar','')                     as comment_raw,
        nullif(elem->>'template_name','')                 as template_name,
        case lower(coalesce(elem->>'rekla',''))
          when 'ja' then true
          when 'nein' then false
          else null
        end                                               as reklamation,
        case lower(coalesce(elem->>'geklaert',''))
          when 'ja' then true
          when 'nein' then false
          else null
        end                                               as resolved,
        nullif(elem->>'note','')                          as note
      from elems
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
      (ts_raw)::date,                                    -- deine Tabelle hat "date": casten
      channel,
      rating_overall,
      rating_friend,
      rating_qual,
      rating_offer,
      comment_raw,
      template_name,
      coalesce(reklamation,false),
      coalesce(resolved,false),
      note
    from casted
    returning 1 as inserted
  `;

  return json({ ok:true, inserted: result.length });
}
