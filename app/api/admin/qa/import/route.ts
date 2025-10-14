/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Tabelle: qa_incidents
// Spalten: id, created_at, ts, user_id, agent_name, incident_type, category, severity, description, booking_number_hash

const normText = (s?: string | null) =>
  (s ?? '')
    .replace(/\u00A0/g, ' ')   // NBSP -> Space
    .replace(/\s+/g, ' ')      // Mehrfachspaces -> 1
    .trim() || null;

export async function POST(req: NextRequest){
  const body = await req.json().catch(()=>null) as { user_id:string; rows:any[] } | null;
  if (!body?.user_id || !Array.isArray(body.rows)) {
    return NextResponse.json({ ok:false, error:'bad_request' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Payload bauen (ohne Hashing)
  const payload = body.rows.map((r:any) => {
    const booking = (r.booking_number ?? '').toString().trim();
    return {
      ts: r.ts ?? null, // ISO-String oder null
      user_id: body.user_id,
      agent_name: normText(r.agent_name ?? [r.agent_first, r.agent_last].filter(Boolean).join(' ')),
      incident_type: normText(r.incident_type),
      category: normText(r.category),
      severity: normText(r.severity),
      description: normText(r.description),
      // Spaltenname bleibt "booking_number_hash", inhaltlich aber KEIN Hash mehr:
      booking_number_hash: booking || null,
    };
  });

  if (payload.length === 0) {
    return NextResponse.json({ ok:true, inserted: 0, skipped: 0 });
  }

  // Upsert: Duplikate (gemäß Unique-Constraint) still überspringen
  const { data, error } = await sb
    .from('qa_incidents')
    .upsert(payload, {
      onConflict: 'user_id,ts,description,booking_number_hash',
      ignoreDuplicates: true,
    })
    .select('id'); // damit wir zählen können

  if (error) {
    return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
  }

  const inserted = data?.length ?? 0;
  const skipped = payload.length - inserted;

  return NextResponse.json({ ok:true, inserted, skipped });
}
