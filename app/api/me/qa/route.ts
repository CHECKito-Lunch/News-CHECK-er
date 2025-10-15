// app/api/me/qa/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

export const dynamic = 'force-dynamic';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

function toISODateOnly(d: string | null): string | null {
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
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get('from');
    const toParam   = searchParams.get('to');

    // --- Auth + UUID auflösen (robust) ---
    const me = await getUserFromRequest(req);
    const authError = me && 'error' in me ? (me as any).error : undefined;
    if (authError) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

    const cand =
      (me as any)?.sub ??
      (me as any)?.user?.sub ??
      (me as any)?.user?.user_id ??
      (me as any)?.id ??
      (me as any)?.user?.id;

    const sb = await supabaseServer();

    let uuid: string | null = null;
    if (isUUID(cand)) {
      uuid = cand;
    } else {
      const numericId = Number(cand);
      if (Number.isFinite(numericId)) {
        const { data: row, error: mapErr } = await sb
          .from('app_users')
          .select('user_id')
          .eq('id', numericId)
          .limit(1)
          .single();
        if (mapErr) {
          return NextResponse.json({ ok:false, error:'resolve_uuid_failed' }, { status:500 });
        }
        uuid = row?.user_id ?? null;
      }
    }
    if (!uuid || !isUUID(uuid)) {
      return NextResponse.json({ ok:false, error:'invalid_user_uuid' }, { status:400 });
    }

    // --- Query ---
    let q = sb
      .from('qa_incidents')
      .select('id, ts, incident_type, category, severity, description, booking_number_hash')
      .eq('user_id', uuid)
      .order('ts', { ascending: false });

    // Datumsfilter: YYYY-MM-DD → inkl./exkl. sauber lösen
    if (fromParam) {
      const fromDateOnly = toISODateOnly(fromParam);
      if (fromDateOnly) {
        q = q.gte('ts', fromDateOnly); // interpretiert als 00:00Z
      } else {
        q = q.gte('ts', fromParam);
      }
    }
    if (toParam) {
      const toDateOnly = toISODateOnly(toParam);
      if (toDateOnly) {
        const toPlus1 = addOneDayISO(toDateOnly);
        q = q.lt('ts', toPlus1); // exklusiv
      } else {
        q = q.lte('ts', toParam);
      }
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });

    return NextResponse.json({ ok:true, items: data ?? [] });
  } catch (e) {
    console.error('[me/qa GET]', e);
    return NextResponse.json({ ok:false, error:'internal' }, { status:500 });
  }
}
