// app/api/admin/feedback/import/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

type IncomingRow = Record<string, any>;

type NormalizedRow = {
  ts_iso: string | null;           // vollständiger Zeitstempel (ISO, mit Zeit)
  feedback_at: string;             // YYYY-MM-DD (abgeleitet aus ts_iso)
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

/* ===== Header-Mapping (inkl. Mojibake) ===== */
const headerMap: Record<string, string> = {
  'Datum': 'ts',
  'Bewertung': 'bewertung',
  'Beraterfreundlichkeit': 'beraterfreundlichkeit',
  'Beraterqualifikation': 'beraterqualifikation',
  'Beratungsangebotsattraktivität': 'angebotsattraktivitaet',
  'Kommentar': 'kommentar',
  'Template Name': 'template_name',
  'Rekla': 'rekla',
  'Anliegen geklärt?': 'geklaert',
  'Feedbacktyp': 'feedbacktyp',
  'Interner Kommentar': 'note',
  // Mojibake-Varianten
  'Beratungsangebotsattraktivit√§t': 'angebotsattraktivitaet',
  'Anliegen gekl√§rt?': 'geklaert',
};

function mapHeaders(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = headerMap[k] ?? headerMap[k.trim()] ?? k;
    out[key] = v;
  }
  return out;
}

/* ===== Helfer ===== */
const isUUID = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s ?? '').trim());

const toStr = (v: any): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

const fixMojibake = (s: string | null): string | null => {
  if (!s) return s;
  return s
    .replace(/Ã¤/g,'ä').replace(/Ã„/g,'Ä')
    .replace(/Ã¶/g,'ö').replace(/Ã–/g,'Ö')
    .replace(/Ã¼/g,'ü').replace(/Ãœ/g,'Ü')
    .replace(/ÃŸ/g,'ß')
    .replace(/â€“/g,'–').replace(/â€”/g,'—')
    .replace(/â€ž/g,'„').replace(/â€œ/g,'“')
    .replace(/Â·/g,'·').replace(/Â /g,' ')
    .replace(/â€¦/g,'…')
    .trim();
};

const toBool = (v: any): boolean | null => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (['ja','yes','y','true','1'].includes(s)) return true;
  if (['nein','no','n','false','0'].includes(s)) return false;
  return null;
};

const toInt1to5 = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',','.'));
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= 1 && i <= 5 ? i : null;
};

// dd.mm.yy(yy) [hh:mm] | dd/mm/yy(yy) [hh:mm] | ISO/locale –→ ISO mit Zeit
function toISODateTime(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;

  // 02.01.25 13:56  |  02.01.2025 13:56
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    let [, dd, mm, yy, hh='00', mi='00'] = m;
    let year = Number(yy);
    if (yy.length === 2) year = 2000 + year; // 25 → 2025
    const d = new Date(Date.UTC(year, Number(mm)-1, Number(dd), Number(hh), Number(mi), 0));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // 02/01/25 13:56
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    let [, dd, mm, yy, hh='00', mi='00'] = m;
    let year = Number(yy);
    if (yy.length === 2) year = 2000 + year;
    const d = new Date(Date.UTC(year, Number(mm)-1, Number(dd), Number(hh), Number(mi), 0));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const dateFromISO = (iso: string): string =>
  new Date(iso).toISOString().slice(0,10); // YYYY-MM-DD

/* ===== Route ===== */
export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookies(req).catch(() => null);
  if (!admin) return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok:false, error:'invalid_json' }, { status: 400 }); }

  const user_id_raw = String(body?.user_id ?? '').trim();
  if (!isUUID(user_id_raw)) {
    return NextResponse.json({ ok:false, error:'user_id_must_be_uuid' }, { status: 400 });
  }

  const rowsIn: unknown = body?.rows;
  const rows: IncomingRow[] = Array.isArray(rowsIn) ? rowsIn.map(mapHeaders) : [];
  if (rows.length === 0) return NextResponse.json({ ok:true, inserted: 0, skipped: 0 });

  // Normalisieren
  const normalized: NormalizedRow[] = [];
  let skipped = 0;

  for (const r of rows) {
    const ts_iso = toISODateTime(r.ts ?? r.Datum);
    if (!ts_iso) { skipped++; continue; }         // ohne Zeitstempel überspringen

    normalized.push({
      ts_iso,
      feedback_at: dateFromISO(ts_iso),           // separate Tages-Spalte
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
    });
  }

  if (normalized.length === 0) {
    return NextResponse.json({ ok:true, inserted: 0, skipped });
  }

  try {
    // 1) Batch-intern deduplizieren (gleicher Zeitstempel (minute), channel, ratings, text…)
    // 2) Nur neue Zeilen gegen DB einfügen (NOT EXISTS-Match auf natürlichem Schlüssel)
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
      -- Batch-Dedupe: wir runden auf Minute, damit "13:56:00" vs "13:56" gleich sind
      src_dedup as (
        select distinct on (
          date_trunc('minute', ts_iso),
          coalesce(channel,''),
          coalesce(rating_overall,-1),
          coalesce(rating_friend,-1),
          coalesce(rating_qual,-1),
          coalesce(rating_offer,-1),
          coalesce(comment_raw,''),
          coalesce(template_name,''),
          coalesce(reklamation,false),
          coalesce(resolved,false)
        )
          ts_iso, feedback_at, channel,
          rating_overall, rating_friend, rating_qual, rating_offer,
          comment_raw, template_name, reklamation, resolved, note
        from src
        order by
          date_trunc('minute', ts_iso),
          coalesce(channel,''),
          coalesce(rating_overall,-1),
          coalesce(rating_friend,-1),
          coalesce(rating_qual,-1),
          coalesce(rating_offer,-1),
          coalesce(comment_raw,''),
          coalesce(template_name,''),
          coalesce(reklamation,false),
          coalesce(resolved,false)
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
        d.feedback_at,
        nullif(d.channel,''),
        case when d.rating_overall between 1 and 5 then d.rating_overall else null end,
        case when d.rating_friend  between 1 and 5 then d.rating_friend  else null end,
        case when d.rating_qual    between 1 and 5 then d.rating_qual    else null end,
        case when d.rating_offer   between 1 and 5 then d.rating_offer   else null end,
        nullif(d.comment_raw,''),
        nullif(d.template_name,''),
        d.reklamation,
        d.resolved,
        nullif(d.note,'')
      from src_dedup d
      where not exists (
        select 1
        from public.user_feedback uf
        where uf.user_id = ${user_id_raw}::uuid
          and uf.feedback_at = d.feedback_at
          and coalesce(uf.channel,'') = coalesce(d.channel,'')
          and coalesce(uf.rating_overall,-1) = coalesce(d.rating_overall,-1)
          and coalesce(uf.rating_friend,-1)  = coalesce(d.rating_friend,-1)
          and coalesce(uf.rating_qual,-1)    = coalesce(d.rating_qual,-1)
          and coalesce(uf.rating_offer,-1)   = coalesce(d.rating_offer,-1)
          and coalesce(uf.comment_raw,'')    = coalesce(d.comment_raw,'')
          and coalesce(uf.template_name,'')  = coalesce(d.template_name,'')
          and coalesce(uf.reklamation,false) = coalesce(d.reklamation,false)
          and coalesce(uf.resolved,false)    = coalesce(d.resolved,false)
      )
      returning 1 as inserted
    `;

    return NextResponse.json({ ok:true, inserted: res.length, skipped });
  } catch (e: any) {
    console.error('[feedback/import]', e);
    return NextResponse.json({ ok:false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
