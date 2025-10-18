 
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

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
    const userOrNull = await getUserFromRequest(req);
    if (!userOrNull) {
      return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });
    }

    const sb = supabaseServer();
    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get('mode') || 'list').toLowerCase();

    // ==== MODE: SUMMARY (Rückwärts-Kompatibilität) ====
    if (mode === 'summary') {
      const fromDate = new Date(); fromDate.setDate(fromDate.getDate()-30);
      const from = fromDate.toISOString();

      const { data, error } = await (await sb)
        .from('qa_incidents')
        .select('id, ts, user_id, incident_type, category, agent_name')
        .gte('ts', from)
        .order('ts', { ascending: false });

      if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });

      const total = data?.length ?? 0;
      const byIncidentType = new Map<string, number>();
      const byAgent = new Map<string, number>();
      (data||[]).forEach(r=>{
        if (r.incident_type) byIncidentType.set(r.incident_type, (byIncidentType.get(r.incident_type)||0)+1);
        if (r.agent_name) byAgent.set(r.agent_name, (byAgent.get(r.agent_name)||0)+1);
      });
      const top = (m:Map<string,number>) => [...m.entries()].sort((a,b)=> b[1]-a[1])[0] || null;

      return NextResponse.json({
        ok:true,
        total,
        topIncidentType: top(byIncidentType),
        topAgent: top(byAgent)
      });
    }

    // ==== MODE: LIST (Standard) ====
    const ownerId = searchParams.get('owner_id');
    if (!ownerId || !isUUID(ownerId)) {
      return NextResponse.json({ ok:false, error:'owner_id_required_or_invalid' }, { status: 400 });
    }

    // Optionaler Zeitraum (YYYY-MM-DD)
    const fromISO = toISODate(searchParams.get('from'));
    const toISO   = toISODate(searchParams.get('to'));

    let query = (await sb)
      .from('qa_incidents')
      // Wähle möglichst alle Felder, die im "me/qa" verwendet werden:
      .select('id, ts, user_id, incident_type, category, severity, description, booking_number_hash, agent_name')
      .eq('user_id', ownerId)
      .order('ts', { ascending: false });

    if (fromISO) query = query.gte('ts', fromISO);
    if (toISO)   query = query.lt('ts', addOneDayISO(toISO));

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });

    // Gleiche Form wie /api/me/qa
    return NextResponse.json({ ok:true, items: data || [] });
  } catch (e:any) {
    console.error('[teamhub/qa GET]', e);
    return NextResponse.json({ ok:false, error:'internal' }, { status: 500 });
  }
}
