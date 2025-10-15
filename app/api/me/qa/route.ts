/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/me/qa/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

function toISODate(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}
function addOneDayISO(dateYYYYMMDD: string) {
  const dt = new Date(dateYYYYMMDD + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req).catch(() => null);
    if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

    // UUID wie in /api/me/feedback ermitteln
    let uuid: string | null = null;
    const cand = (me as any)?.sub ?? (me as any)?.user?.sub ?? (me as any)?.user?.user_id;
    if (isUUID(cand)) {
      uuid = cand;
    } else {
      const rawId = (me as any)?.user?.id ?? (me as any)?.id;
      const numericId = Number(rawId);
      if (Number.isFinite(numericId)) {
        const r = await sql<{ user_id: string | null }[]>`
          select user_id from public.app_users where id = ${numericId} limit 1
        `;
        uuid = r[0]?.user_id ?? null;
      }
    }
    if (!uuid || !isUUID(uuid)) {
      return NextResponse.json({ ok:false, error:'invalid_user_uuid' }, { status:400 });
    }

    const { searchParams } = new URL(req.url);
    const fromISO = toISODate(searchParams.get('from'));
    const toISO   = toISODate(searchParams.get('to'));

    let q = sql/*sql*/`
      select
        id, ts, incident_type, category, severity, description, booking_number_hash
      from public.qa_incidents
      where user_id = ${uuid}::uuid
    `;
    if (fromISO) q = sql/*sql*/`${q} and ts >= ${fromISO}::date`;
    if (toISO)   q = sql/*sql*/`${q} and ts < (${toISO}::date + interval '1 day')`;

    q = sql/*sql*/`${q} order by ts desc`;

    const rows = await q;
    return NextResponse.json({ ok:true, items: rows });
  } catch (e) {
    console.error('[me/qa GET]', e);
    return NextResponse.json({ ok:false, error:'internal' }, { status:500 });
  }
}
