/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

type Role = 'admin' | 'moderator' | 'teamleiter' | 'user';

// Aggregation für Teamhub: letzte 30 Tage – Anzahl, Top-Kategorie, Top-Agent (optional)
export async function GET(req: NextRequest){
  const userOrNull = await getUserFromRequest(req);
  if (!userOrNull) return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });
  const user = userOrNull;

  const sb = supabaseServer();

  // TODO: Teams ermitteln. Hier: Dummy – alle Vorfälle des Teams des Users.
  // Erwartet wird eine team_id auf dem User oder eine Team-Members-Relation.
  // Passe diesen Teil an eure Teamstruktur an (siehe vorhandene /api/teamhub/* Routen).

  const fromDate = new Date(); fromDate.setDate(fromDate.getDate()-30);
  const from = fromDate.toISOString();

  const { data, error } = await (await sb)
    .from('qa_incidents')
    .select('id, ts, user_id, incident_type, category, agent_name')
    .gte('ts', from)
    .order('ts', { ascending: false });

  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });

  // simple Agg
  const total = data?.length ?? 0;
  const byIncidentType = new Map<string, number>();
  const byAgent = new Map<string, number>();
  (data||[]).forEach(r=>{
    if (r.incident_type) byIncidentType.set(r.incident_type, (byIncidentType.get(r.incident_type)||0)+1);
    if (r.agent_name) byAgent.set(r.agent_name, (byAgent.get(r.agent_name)||0)+1);
  });

  const top = (m:Map<string,number>) => [...m.entries()].sort((a,b)=> b[1]-a[1])[0] || null;

  return NextResponse.json({ ok:true, total, topIncidentType: top(byIncidentType), topAgent: top(byAgent) });
}