/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// TODO: passt den Tabellennamen & Spalten an euer Schema an
// Vorschlag: Tabelle qa_incidents
// Columns: id, created_at, ts, user_id, agent_name, incident_type, category, severity, description, booking_number_hash

export async function POST(req: NextRequest){
  const body = await req.json().catch(()=>null) as { user_id:string; rows:any[] } | null;
  if (!body?.user_id || !Array.isArray(body.rows)) return NextResponse.json({ ok:false, error:'bad_request' }, { status: 400 });

  const sb = supabaseAdmin();

  // optional: Hashing der Buchungsnummer (SHA-256)
  const hash = async (bn: string) => {
    const enc = new TextEncoder().encode(bn.replace(/\D+/g,''));
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  };

  let inserted = 0, skipped = 0;
  const payload = [] as any[];
  for (const r of body.rows){
    const bookingHash = r.booking_number ? `id:${String(r.booking_number).trim()}` : null;

    payload.push({
      ts: r.ts ?? null,
      user_id: body.user_id,
      agent_name: r.agent_name ?? (([r.agent_first, r.agent_last].filter(Boolean).join(' ').trim()) || null),
      incident_type: r.incident_type ?? null,
      category: r.category ?? null,
      severity: r.severity ?? null,
      description: r.description ?? null,
      booking_number_hash: bookingHash,
    });
  }

  if (payload.length === 0) return NextResponse.json({ ok:true, inserted, skipped });

  const { error } = await sb.from('qa_incidents').insert(payload);
  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });

  inserted = payload.length;
  return NextResponse.json({ ok:true, inserted, skipped });
}