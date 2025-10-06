export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

type IncomingRow = Record<string, any>;

type NormalizedRow = {
  ts_iso: string;             // volle Zeit (ISO)
  feedback_at: string;        // YYYY-MM-DD
  channel: string | null;
  rating_overall: number | null;
  rating_friend: number | null;
  rating_qual: number | null;
  rating_offer: number | null;
  comment_raw: string | null;
  template_name: string | null;
  reklamation: boolean | null;
  resolved: boolean | null;
  note: string | null;
  booking_number: string | null;
  agent_first: string | null;
  agent_last: string | null;
  agent_name: string | null;
};

const headerMap: Record<string, string> = {
  'Datum': 'ts',
  'Bewertung': 'bewertung',
  'Beraterfreundlichkeit': 'beraterfreundlichkeit',
  'Beraterqualifikation': 'beraterqualifikation',
  'Beratungsangebotsattraktivität': 'angebotsattraktivitaet',
  'Beratungsangebotsattraktivit√§t': 'angebotsattraktivitaet',
  'Kommentar': 'kommentar',
  'Template Name': 'template_name',
  'Rekla': 'rekla',
  'Anliegen geklärt?': 'geklaert',
  'Anliegen gekl√§rt?': 'geklaert',
  'Feedbacktyp': 'feedbacktyp',
  'Interner Kommentar': 'note',
  'Erhalten': 'ts',
  'Buchungsnummer': 'booking_number',
  'Beratervorname': 'agent_first',
  'Beraternachname': 'agent_last',
  'Berater': 'agent_name',
};

function mapHeaders(r: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(r)) out[headerMap[k] ?? headerMap[k.trim()] ?? k] = v;
  return out;
}

const cleanBooking = (v: any): string | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const digits = s.replace(/\D+/g, '');
  return digits || null;
};

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const toStr = (v: any) => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

const fixMojibake = (s: string | null) =>
  s
    ? s
        .replace(/Ã¤/g, 'ä').replace(/Ã„/g, 'Ä')
        .replace(/Ã¶/g, 'ö').replace(/Ã–/g, 'Ö')
        .replace(/Ã¼/g, 'ü').replace(/Ãœ/g, 'Ü')
        .replace(/ÃŸ/g, 'ß')
        .replace(/â€“/g, '–').replace(/â€”/g, '—')
        .replace(/â€ž/g, '„').replace(/â€œ/g, '“')
        .replace(/Â·/g, '·').replace(/Â /g, ' ')
        .replace(/â€¦/g, '…')
        .trim()
    : s;

const toBool = (v: any): boolean | null => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === '–' || s === '-') return null;
  if (['ja','yes','y','true','1','x','✓','✔'].includes(s)) return true;
  if (['nein','no','n','false','0'].includes(s)) return false;
  return null;
};

const toInt1to5 = (v: any): number | null => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= 1 && i <= 5 ? i : null;
};

// dd.mm.yy(yy)[ hh:mm] | dd/mm/yy(yy)[ hh:mm] | ISO → ISO
function toISODateTime(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    let [, dd, mm, yy, hh = '00', mi = '00'] = m;
    let year = +yy;
    if (yy.length === 2) year = 2000 + year;
    const d = new Date(Date.UTC(year, +mm - 1, +dd, +hh, +mi, 0));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    let [, dd, mm, yy, hh = '00', mi = '00'] = m;
    let year = +yy;
    if (yy.length === 2) year = 2000 + year;
    const d = new Date(Date.UTC(year, +mm - 1, +dd, +hh, +mi, 0));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const dateFromISO = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookies(req).catch(() => null);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const BOOKING_KEY = process.env.BOOKING_KEY;
  if (!BOOKING_KEY) {
    return NextResponse.json({ ok: false, error: 'booking_key_missing_env' }, { status: 500 });
  }

  let body: any = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }); }

  const user_id = String(body?.user_id ?? '').trim();
  if (!isUUID(user_id))
    return NextResponse.json({ ok: false, error: 'user_id_must_be_uuid' }, { status: 400 });

  const rowsIn: unknown = body?.rows;
  const rows: IncomingRow[] = Array.isArray(rowsIn) ? rowsIn.map(mapHeaders) : [];
  if (rows.length === 0) return NextResponse.json({ ok: true, inserted: 0, skipped: 0 });

  const normalized: NormalizedRow[] = [];
  let skipped = 0;

  for (const r of rows) {
    const ts_iso = toISODateTime(r.ts ?? r.Datum);
    if (!ts_iso) { skipped++; continue; } // ohne Zeitstempel nicht importieren

    const booking = cleanBooking(r.booking_number);
    const first = toStr(r.agent_first);
    const last = toStr(r.agent_last);
    const fullFromParts = [first, last].filter(Boolean).join(' ').trim() || null;
    const agentName = toStr(r.agent_name) ?? fullFromParts;

    normalized.push({
      ts_iso,
      feedback_at: dateFromISO(ts_iso),
      channel: toStr(r.feedbacktyp),
      rating_overall: toInt1to5(r.bewertung),
      rating_friend: toInt1to5(r.beraterfreundlichkeit),
      rating_qual: toInt1to5(r.beraterqualifikation),
      rating_offer: toInt1to5(r.angebotsattraktivitaet),
      comment_raw: fixMojibake(toStr(r.kommentar)),
      template_name: fixMojibake(toStr(r.template_name)),
      reklamation: toBool(r.rekla),
      resolved: toBool(r.geklaert),
      note: toStr(r.note),
      booking_number: booking,
      agent_first: first,
      agent_last: last,
      agent_name: agentName,
    });
  }

  if (normalized.length === 0) return NextResponse.json({ ok: true, inserted: 0, skipped });

  try {
    const res = await sql<{ inserted: number }[]>`
with src as (
  select *
  from jsonb_to_recordset(${sqlJson(normalized)}) as r(
    ts_iso          timestamptz,
    feedback_at     date,
    channel         text,
    rating_overall  int,
    rating_friend   int,
    rating_qual     int,
    rating_offer    int,
    comment_raw     text,
    template_name   text,
    reklamation     boolean,
    resolved        boolean,
    note            text,
    booking_number  text,
    agent_first     text,
    agent_last      text,
    agent_name      text
  )
),
agent_src as (
  select
    s.*,
    nullif(trim(regexp_replace(
      coalesce(s.agent_name, trim(concat_ws(' ', s.agent_first, s.agent_last))),
      '\\s+', ' ', 'g'
    )), '') as agent_full_norm
  from src s
),
matched as (
  select
    a.*,
    au.user_id as matched_user_id
  from agent_src a
  left join public.app_users au
    on au.active = true
   and trim(regexp_replace(lower(coalesce(au.name,'')),'\\s+',' ','g'))
       = trim(regexp_replace(lower(coalesce(a.agent_full_norm,'')),'\\s+',' ','g'))
),
prep as (
  select
    coalesce(m.matched_user_id, ${user_id}::uuid) as user_id,
    m.feedback_at,
    m.ts_iso as feedback_ts,
    nullif(m.channel,'') as channel,
    case when m.rating_overall between 1 and 5 then m.rating_overall else null end as rating_overall,
    case when m.rating_friend  between 1 and 5 then m.rating_friend  else null end as rating_friend,
    case when m.rating_qual    between 1 and 5 then m.rating_qual    else null end as rating_qual,
    case when m.rating_offer   between 1 and 5 then m.rating_offer   else null end as rating_offer,
    nullif(m.comment_raw,'')   as comment_raw,
    nullif(m.template_name,'') as template_name,
    m.reklamation,
    m.resolved,
    nullif(m.note,'')          as note,

    case
      when m.booking_number is not null and m.booking_number <> ''
      then encode(digest(m.booking_number || '|' || ${process.env.BOOKING_KEY}, 'sha256'),'hex')
      else null
    end as booking_number_hash,

    case
      when m.booking_number is not null and m.booking_number <> ''
      then pgp_sym_encrypt(m.booking_number, ${process.env.BOOKING_KEY})
      else null
    end as booking_number_enc,

    md5(
      coalesce(to_char(date_trunc('minute', m.ts_iso),'YYYY-MM-DD HH24:MI'),'') || '|' ||
      coalesce(m.channel,'')           || '|' ||
      coalesce(m.rating_overall,-1)    || '|' ||
      coalesce(m.rating_friend,-1)     || '|' ||
      coalesce(m.rating_qual,-1)       || '|' ||
      coalesce(m.rating_offer,-1)      || '|' ||
      coalesce(m.comment_raw,'')       || '|' ||
      coalesce(m.template_name,'')     || '|' ||
      coalesce(m.reklamation::text,'') || '|' ||
      coalesce(m.resolved::text,'')    || '|' ||
      coalesce(
        case when m.booking_number is not null and m.booking_number <> ''
             then encode(digest(m.booking_number || '|' || ${process.env.BOOKING_KEY}, 'sha256'),'hex')
             else '' end
      ,'')
    ) as import_fp
  from matched m
)
insert into public.user_feedback (
  user_id, feedback_at, feedback_ts, channel,
  rating_overall, rating_friend, rating_qual, rating_offer,
  comment_raw, template_name, reklamation, resolved, note,
  booking_number_hash, booking_number_enc,
  import_fp
)
select
  p.user_id, p.feedback_at, p.feedback_ts, p.channel,
  p.rating_overall, p.rating_friend, p.rating_qual, p.rating_offer,
  p.comment_raw, p.template_name, p.reklamation, p.resolved, p.note,
  p.booking_number_hash, p.booking_number_enc,
  p.import_fp
from prep p
on conflict (user_id, import_fp) do nothing
returning 1 as inserted
`;
    return NextResponse.json({ ok: true, inserted: res.length, skipped });
  } catch (e: any) {
    console.error('[feedback/import]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
