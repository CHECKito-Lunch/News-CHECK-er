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

type NormalizedRow = {
  feedback_at: string | null;     // 'YYYY-MM-DD'
  channel: string | null;         // aus feedbacktyp
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
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const user_id_raw = String(body?.user_id ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user_id_raw)) {
    return NextResponse.json({ ok: false, error: 'user_id_must_be_uuid' }, { status: 400 });
  }

  const rowsIn: unknown = body?.rows;
  const rowsArr: IncomingRow[] = Array.isArray(rowsIn) ? rowsIn as IncomingRow[] : [];
  if (rowsArr.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  // ---- Helpers
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
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.trunc(n) : null;
  };
  const toISODate = (v: any): string | null => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    // unterstützt z.B. '2024-10-01', '01.10.2024', '01/10/2024', '2024-10-01T12:34'
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  };

  // ---- Normalisieren ins DB-Schema
  const normalized: NormalizedRow[] = rowsArr.map((r) => ({
    feedback_at: toISODate(r.ts),
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
  }))
  // DB verlangt feedback_at NOT NULL → bereits hier filtern
  .filter(r => !!r.feedback_at);

  if (normalized.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: rowsArr.length });
  }

  // ---- Bulk-Insert via jsonb_to_recordset (immer echtes Array)
  const payload = JSON.stringify(normalized);

  try {
    const result = await sql<{ inserted: number }[]>`
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
        nullif(s.channel,''),
        (case when s.rating_overall between 1 and 5 then s.rating_overall else null end),
        (case when s.rating_friend  between 1 and 5 then s.rating_friend  else null end),
        (case when s.rating_qual    between 1 and 5 then s.rating_qual    else null end),
        (case when s.rating_offer   between 1 and 5 then s.rating_offer   else null end),
        nullif(s.comment_raw,''),
        nullif(s.template_name,''),
        s.reklamation,
        s.resolved,
        nullif(s.note,'')
      from src s
      returning 1 as inserted
    `;

    return NextResponse.json({ ok: true, inserted: result.length });
  } catch (e: any) {
    console.error('[feedback/import]', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
