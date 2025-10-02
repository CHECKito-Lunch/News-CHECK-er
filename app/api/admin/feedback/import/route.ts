// app/api/admin/feedback/import/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

type IncomingRow = {
  ts?: string | number | null;
  bewertung?: number | string | null;
  beraterfreundlichkeit?: number | string | null;
  beraterqualifikation?: number | string | null;
  angebotsattraktivitaet?: number | string | null;
  kommentar?: string | null;
  template_name?: string | null;
  rekla?: 'ja'|'nein'|string|null;
  geklaert?: 'ja'|'nein'|string|null;
  feedbacktyp?: string | null;
  note?: string | null;
};

type NormalizedRow = {
  feedback_at: string;        // YYYY-MM-DD (bereits validiert)
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

export async function POST(req: NextRequest) {
  const admin = await getAdminFromCookies(req).catch(() => null);
  if (!admin) return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok:false, error:'invalid_json' }, { status: 400 }); }

  const userId = String(body?.user_id ?? '').trim();
  const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRx.test(userId)) return NextResponse.json({ ok:false, error:'user_id_must_be_uuid' }, { status: 400 });

  // rows tolerant parsen
  let rowsVal: unknown = body?.rows;
  if (typeof rowsVal === 'string') { try { rowsVal = JSON.parse(rowsVal); } catch {} }
  const rowsArr: IncomingRow[] =
    Array.isArray(rowsVal) ? rowsVal.filter(x => x && typeof x === 'object') as IncomingRow[] :
    rowsVal && typeof rowsVal === 'object' ? [rowsVal as IncomingRow] : [];

  if (rowsArr.length === 0) return NextResponse.json({ ok:true, inserted: 0, skipped: 0 });

  // ------ Helper
  const toStr = (v:any): string | null => { const s = String(v ?? '').trim(); return s ? s : null; };
  const toInt1to5 = (v:any): number | null => {
    const n = Number(String(v ?? '').replace(',','.').trim());
    return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.trunc(n) : null;
  };
  const toBool = (v:any): boolean | null => {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return null;
    if (['ja','yes','y','true','1'].includes(s)) return true;
    if (['nein','no','n','false','0'].includes(s)) return false;
    return null;
  };
  // Excel-Serienzahl → Date
  const excelSerialToISO = (v:number): string | null => {
    if (!Number.isFinite(v)) return null;
    // Excel origin 1899-12-30 (mit Bug-Offset)
    const ms = (v - 25569) * 86400000; // 25569 Tage bis 1970-01-01
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
  };
  // Viele Formate → YYYY-MM-DD
  const toISODate = (v:any): string | null => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return excelSerialToISO(v);
    const raw = String(v).trim();

    // 1) DD.MM.YYYY[ HH:MM]
    let m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
    if (m) {
      const dd = m[1].padStart(2,'0'); const mm = m[2].padStart(2,'0');
      const yyyy = m[3].length===2 ? ('20'+m[3]) : m[3];
      const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
      return isNaN(d.getTime()) ? null : `${yyyy}-${mm}-${dd}`;
    }

    // 2) DD/MM/YYYY oder YYYY/MM/DD
    m = raw.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
    if (m) {
      let a = m[1], b = m[2], c = m[3];
      // Heuristik: vierstellig → Jahr
      let yyyy: string, mm: string, dd: string;
      if (a.length === 4) { yyyy = a; mm = b.padStart(2,'0'); dd = c.padStart(2,'0'); }
      else if (c.length === 4) { yyyy = c; mm = b.padStart(2,'0'); dd = a.padStart(2,'0'); }
      else { // fallback: DD/MM/YY → 20YY
        yyyy = '20' + c.padStart(2,'0'); mm = b.padStart(2,'0'); dd = a.padStart(2,'0');
      }
      const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
      return isNaN(d.getTime()) ? null : `${yyyy}-${mm}-${dd}`;
    }

    // 3) ISO-ähnlich (YYYY-MM-DD[THH:MM...])
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
  };

  // ------ Normalisieren (Datum VORHER fixen!)
  const normalized: NormalizedRow[] = rowsArr
    .map(r => {
      const date = toISODate(r.ts);
      return {
        feedback_at: date!, // filtern gleich danach
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
      };
    })
    .filter(r => !!r.feedback_at); // jetzt sicher vorhanden

  if (normalized.length === 0) {
    return NextResponse.json({ ok:true, inserted: 0, skipped: rowsArr.length });
  }

  // JSON-Array erzeugen
  const payload = JSON.stringify(normalized);

  try {
    const res = await sql<{ inserted: number }[]>`
      with raw as (
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
        ${userId}::uuid,
        (j->>'feedback_at')::date,          -- bereits YYYY-MM-DD
        nullif(j->>'channel',''),
        case when (j->>'rating_overall')::int between 1 and 5 then (j->>'rating_overall')::int else null end,
        case when (j->>'rating_friend')::int  between 1 and 5 then (j->>'rating_friend')::int  else null end,
        case when (j->>'rating_qual')::int    between 1 and 5 then (j->>'rating_qual')::int    else null end,
        case when (j->>'rating_offer')::int   between 1 and 5 then (j->>'rating_offer')::int   else null end,
        nullif(j->>'comment_raw',''),
        nullif(j->>'template_name',''),
        case when lower(coalesce(j->>'reklamation','')) in ('true','1','ja','yes','y') then true
             when lower(coalesce(j->>'reklamation','')) in ('false','0','nein','no','n') then false
             else null end,
        case when lower(coalesce(j->>'resolved','')) in ('true','1','ja','yes','y') then true
             when lower(coalesce(j->>'resolved','')) in ('false','0','nein','no','n') then false
             else null end,
        nullif(j->>'note','')
      from src
      where (j->>'feedback_at') is not null
      returning 1 as inserted
    `;

    return NextResponse.json({ ok:true, inserted: res.length, skipped: rowsArr.length - res.length });
  } catch (e:any) {
    console.error('[feedback/import] k:', e);
    return NextResponse.json({ ok:false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
