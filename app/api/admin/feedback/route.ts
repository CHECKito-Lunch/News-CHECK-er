// app/api/admin/feedback/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAdminFromCookies } from '@/lib/admin-auth';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

export async function GET(req: NextRequest) {
  const admin = await getAdminFromCookies(req).catch(() => null);
  if (!admin) return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const user_id = searchParams.get('user_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!isUUID(user_id)) {
    return NextResponse.json({ ok:false, error:'user_id_must_be_uuid' }, { status:400 });
  }

  let q = sql`
    select
      id,
      feedback_at,
      feedback_ts,              -- ✨ volle Zeit (timestamptz) falls vorhanden
      channel,
      rating_overall,
      rating_friend,
      rating_qual,
      rating_offer,
      comment_raw,
      template_name,
      reklamation,
      resolved,
      note,
      booking_number_hash       -- ✨ für den BO-Link
    from public.user_feedback
    where user_id = ${user_id}::uuid
  `;
  if (from) q = sql`${q} and feedback_at >= ${from}::date`;
  if (to)   q = sql`${q} and feedback_at < (${to}::date + interval '1 day')`;
  q = sql`${q} order by coalesce(feedback_ts, feedback_at::timestamp) desc, id desc limit 1000`;

  const rows = await q;

  const items = rows.map((r: any) => ({
    id: r.id,
    ts: r.feedback_ts ?? r.feedback_at, // ✨ Frontend-Feld „ts“ für Modal (mit Uhrzeit)
    feedback_at: r.feedback_at,
    channel: r.channel,
    rating_overall: r.rating_overall,
    rating_friend: r.rating_friend,
    rating_qual: r.rating_qual,
    rating_offer: r.rating_offer,
    comment_raw: r.comment_raw,
    template_name: r.template_name,
    reklamation: r.reklamation,
    resolved: r.resolved,
    note: r.note,
    booking_number_hash: r.booking_number_hash ?? null, // ✨ BO-Link-Daten
  }));

  return NextResponse.json({ ok:true, items });
}