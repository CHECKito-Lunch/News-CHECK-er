// app/api/admin/feedback/import/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

/* ===========================
   Input/Output Typen
=========================== */
type IncomingRow = Record<string, any>;

type NormalizedRow = {
  feedback_at: string;             // YYYY-MM-DD (NOT NULL in DB)
  channel: string | null;          // aus Feedbacktyp
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

/* ===========================
   Header-Mapping (inkl. Umlaut-/Mojibake-Varianten)
=========================== */
const headerMap: Record<string, string> = {
  // Normale Header
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

  // Häufige Mojibake-Varianten (Excel/CSV-Encoding)
  'Beratungsangebotsattraktivit√§t': 'angebotsattraktivitaet',
  'Anliegen gekl√§rt?': 'geklaert',
};

// auf interne Keys mappen (case-sensitiv exakt, plus fallback mit trim)
function mapHeaders(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = headerMap[k] ?? headerMap[k.trim()] ?? k;
    out[key] = v;
  }
  return out;
}

/* ===========================
   Helper
=========================== */
const isUUID = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const toStr = (v: any): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
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
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= 1 && i <= 5 ? i : null;
};

// dd.mm.yy(yy) | dd/mm/yy(yy) | yyyy-mm-dd | ISO
function toISODate(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;

  // 1) dd.mm.yy(yy)
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (m) {
    let [_, dd, mm, yy] = m;
    let year = Number(yy);
    if (yy.length === 2) {
      year = 2000 + year; // „25“ → 2025
    }
    const d = new Date(Date.UTC(year, Number(mm) - 1, Number(dd)));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // 2) dd/mm/yy(yy)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    let [_, dd, mm, yy] = m;
    let year = Number(yy);
    if (yy.length === 2) year = 2000 + year;
    const d = new Date(Date.UTC(year, Number(mm) - 1, Number(dd)));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // 3) ISO oder sonstige Date-Parse-Varianten (z.B. 2025-01-02T12:34)
  const d = new Date(s);
  if (!isNaN(d.getTime())) return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);

  return null;
}

/* ===========================
   Route
=========================== */
export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookies(req).catch(() => null);
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const user_id_raw = String(body?.user_id ?? '').trim();
  if (!isUUID(user_id_raw)) {
    return NextResponse.json({ ok: false, error: 'user_id_must_be_uuid' }, { status: 400 });
  }

  const rowsIn: unknown = body?.rows;
  const rows: IncomingRow[] = Array.isArray(rowsIn) ? rowsIn.map(mapHeaders) : [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: 0 });
  }

  // Normalisieren → DB-Shape
  const normalized: NormalizedRow[] = [];
  let skipped = 0;

  for (const r of rows) {
    const feedback_at = toISODate(r.ts ?? r.Datum); // Fallback, falls Mapping verfehlt
    if (!feedback_at) { skipped++; continue; }

    normalized.push({
      feedback_at,
      channel: toStr(r.feedbacktyp),
      rating_overall: toInt1to5(r.bewertung),
      rating_friend: toInt1to5(r.beraterfreundlichkeit),
      rating_qual: toInt1to5(r.beraterqualifikation),
      rating_offer: toInt1to5(r.angebotsattraktivitaet),
      comment_raw: toStr(r.kommentar),
      template_name: toStr(r.template_name),
      reklamation: toBool(r.rekla),
      resolved: toBool(r.geklaert),
      note: toStr(r.note),
    });
  }

  if (normalized.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped });
  }

  // Immer garantiert ein echtes JSON-Array:
  const payload = JSON.stringify(normalized);

  try {
    const res = await sql<{ inserted: number }[]>`
      with src as (
        select *
        from jsonb_to_recordset(${payload}::jsonb) as r(
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
        s.feedback_at,
        nullif(s.channel, ''),
        case when s.rating_overall between 1 and 5 then s.rating_overall else null end,
        case when s.rating_friend  between 1 and 5 then s.rating_friend  else null end,
        case when s.rating_qual    between 1 and 5 then s.rating_qual    else null end,
        case when s.rating_offer   between 1 and 5 then s.rating_offer   else null end,
        nullif(s.comment_raw, ''),
        nullif(s.template_name, ''),
        s.reklamation,
        s.resolved,
        nullif(s.note, '')
      from src s
      returning 1 as inserted
    `;

    return NextResponse.json({ ok: true, inserted: res.length, skipped });
  } catch (e: any) {
    console.error('[feedback/import]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
