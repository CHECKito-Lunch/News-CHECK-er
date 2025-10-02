// app/api/admin/feedback/import/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

type IncomingRow = Record<string, any>;

type NormalizedRow = {
  ts_iso: string;          // vollständiger Zeitstempel (ISO, mit Zeit)
  feedback_at: string;     // YYYY-MM-DD
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
};

const headerMap: Record<string,string> = {
  'Datum':'ts',
  'Bewertung':'bewertung',
  'Beraterfreundlichkeit':'beraterfreundlichkeit',
  'Beraterqualifikation':'beraterqualifikation',
  'Beratungsangebotsattraktivität':'angebotsattraktivitaet',
  'Beratungsangebotsattraktivit√§t':'angebotsattraktivitaet', // Mojibake
  'Kommentar':'kommentar',
  'Template Name':'template_name',
  'Rekla':'rekla',
  'Anliegen geklärt?':'geklaert',
  'Anliegen gekl√§rt?':'geklaert', // Mojibake
  'Feedbacktyp':'feedbacktyp',
  'Interner Kommentar':'note',
};
function mapHeaders(r:Record<string,any>) {
  const out:Record<string,any> = {};
  for (const [k,v] of Object.entries(r)) out[headerMap[k] ?? headerMap[k.trim()] ?? k] = v;
  return out;
}

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const toStr = (v:any) => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};
const fixMojibake = (s:string|null) =>
  s ? s
      .replace(/Ã¤/g,'ä').replace(/Ã„/g,'Ä')
      .replace(/Ã¶/g,'ö').replace(/Ã–/g,'Ö')
      .replace(/Ã¼/g,'ü').replace(/Ãœ/g,'Ü')
      .replace(/ÃŸ/g,'ß')
      .replace(/â€“/g,'–').replace(/â€”/g,'—')
      .replace(/â€ž/g,'„').replace(/â€œ/g,'“')
      .replace(/Â·/g,'·').replace(/Â /g,' ')
      .replace(/â€¦/g,'…')
      .trim()
    : s;

const toBool = (v:any): boolean|null => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === '–' || s === '-') return null;
  if (['ja','yes','y','true','1','x','✓','✔'].includes(s)) return true;
  if (['nein','no','n','false','0'].includes(s)) return false;
  return null;
};
const toInt1to5 = (v:any): number|null => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',','.'));
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i>=1 && i<=5 ? i : null;
};

// dd.mm.yy(yy)[ hh:mm] | dd/mm/yy(yy)[ hh:mm] | ISO → ISO mit Zeit
function toISODateTime(v:any): string|null {
  const s = String(v ?? '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    let [, dd, mm, yy, hh='00', mi='00'] = m;
    let year = +yy; if (yy.length===2) year = 2000 + year;
    const d = new Date(Date.UTC(year, +mm-1, +dd, +hh, +mi, 0));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    let [, dd, mm, yy, hh='00', mi='00'] = m;
    let year = +yy; if (yy.length===2) year = 2000 + year;
    const d = new Date(Date.UTC(year, +mm-1, +dd, +hh, +mi, 0));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
const dateFromISO = (iso:string) => new Date(iso).toISOString().slice(0,10);

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookies(req).catch(()=>null);
  if (!admin) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  let body:any={};
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok:false, error:'invalid_json' }, { status:400 });
  }

  const user_id = String(body?.user_id ?? '').trim();
  if (!isUUID(user_id)) return NextResponse.json({ ok:false, error:'user_id_must_be_uuid' }, { status:400 });

  const rowsIn: unknown = body?.rows;
  const rows: IncomingRow[] = Array.isArray(rowsIn) ? rowsIn.map(mapHeaders) : [];
  if (rows.length===0) return NextResponse.json({ ok:true, inserted:0, skipped:0 });

  const normalized: NormalizedRow[] = [];
  let skipped = 0;

  for (const r of rows) {
    const ts_iso = toISODateTime(r.ts ?? r.Datum);
    if (!ts_iso) { skipped++; continue; }         // ohne Zeitstempel nicht importieren

    normalized.push({
      ts_iso,
      feedback_at: dateFromISO(ts_iso),
      channel: toStr(r.feedbacktyp),
      rating_overall: toInt1to5(r.bewertung),
      rating_friend:  toInt1to5(r.beraterfreundlichkeit),
      rating_qual:    toInt1to5(r.beraterqualifikation),
      rating_offer:   toInt1to5(r.angebotsattraktivitaet),
      comment_raw:   fixMojibake(toStr(r.kommentar)),
      template_name: fixMojibake(toStr(r.template_name)),
      reklamation: toBool(r.rekla),
      resolved:    toBool(r.geklaert),
      note: toStr(r.note),
    });
  }
  if (normalized.length===0) return NextResponse.json({ ok:true, inserted:0, skipped });

  try {
    // Upsert via import_fp (Fingerprint) – enthält Minute des Zeitstempels + restliche Felder
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
          note            text
        )
      ),
      prep as (
        select
          ${user_id}::uuid                  as user_id,
          feedback_at,
          nullif(channel,'')                as channel,
          case when rating_overall between 1 and 5 then rating_overall else null end as rating_overall,
          case when rating_friend  between 1 and 5 then rating_friend  else null end as rating_friend,
          case when rating_qual    between 1 and 5 then rating_qual    else null end as rating_qual,
          case when rating_offer   between 1 and 5 then rating_offer   else null end as rating_offer,
          nullif(comment_raw,'')            as comment_raw,
          nullif(template_name,'')          as template_name,
          reklamation,
          resolved,
          nullif(note,'')                   as note,
          -- Fingerprint: Minute-genauer Zeitstempel + alle relevanten Inhalte
          md5(
            coalesce(to_char(date_trunc('minute', ts_iso),'YYYY-MM-DD HH24:MI'),'') || '|' ||
            coalesce(channel,'')           || '|' ||
            coalesce(rating_overall,-1)    || '|' ||
            coalesce(rating_friend,-1)     || '|' ||
            coalesce(rating_qual,-1)       || '|' ||
            coalesce(rating_offer,-1)      || '|' ||
            coalesce(comment_raw,'')       || '|' ||
            coalesce(template_name,'')     || '|' ||
            coalesce(reklamation::text,'') || '|' ||
            coalesce(resolved::text,'')
          ) as import_fp
        from src
      )
      insert into public.user_feedback (
        user_id, feedback_at, channel,
        rating_overall, rating_friend, rating_qual, rating_offer,
        comment_raw, template_name, reklamation, resolved, note, import_fp
      )
      select
        p.user_id, p.feedback_at, p.channel,
        p.rating_overall, p.rating_friend, p.rating_qual, p.rating_offer,
        p.comment_raw, p.template_name, p.reklamation, p.resolved, p.note, p.import_fp
      from prep p
      on conflict (user_id, import_fp) do nothing
      returning 1 as inserted
    `;

    return NextResponse.json({ ok:true, inserted: res.length, skipped });
  } catch (e:any) {
    console.error('[feedback/import]', e);
    return NextResponse.json({ ok:false, error: e?.message ?? 'server_error' }, { status:500 });
  }
}
