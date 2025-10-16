/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/absence/upcoming/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { absenceGet } from '@/lib/absenceio';
import { getUserFromRequest } from '@/lib/getUserFromRequest';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function toISODate(d: Date) { return d.toISOString().slice(0,10); }

export async function GET(req: NextRequest) {
  try {
    // Auth (normaler User erlaubt)
    const me = await getUserFromRequest(req);
    if (!me || 'error' in (me as any)) {
      return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });
    }

    // Zeitraum (Default: heute → +7 Tage)
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || toISODate(new Date());
    const toD  = new Date(from + 'T00:00:00Z'); toD.setUTCDate(toD.getUTCDate() + 7);
    const to   = searchParams.get('to') || toISODate(toD);

    // Team-Mitglieder ermitteln (deine existierende Quelle):
    // Fallback: /api/teamhub/members liefert { user_id, name }
   
    const sb = await supabaseServer();
    const { data: members } = await (await sb)
      .from('teamhub_members_view') // <- falls du eine View hast
      .select('user_id,name,email')  // email nützlich für Mapping
      .eq('owner_id', (me as any).id)
      .limit(200);

    // Falls du keine View hast: optional fallback auf eure bestehende API:
    // const r = await fetch(new URL(req.url).origin + '/api/teamhub/members', { headers: { cookie: req.headers.get('cookie')||'' }});
    // const j = await r.json(); const members = Array.isArray(j?.members)? j.members : [];

    // optional: explizite Filter per Query ?member_user_id=a&member_user_id=b
    const memberFilter = searchParams.getAll('member_user_id');
    const effectiveMembers = (members||[]).filter(m => memberFilter.length===0 || memberFilter.includes(m.user_id));

    // absence.io: Abwesenheiten abfragen
    // Tipp: relations=['assignedToId','typeId'] liefert user + type Objekte
    const res = await absenceGet<{ data:any[]; total:number; skip:number; limit:number }>(
      '/absences',
      {
        start_gte: from,
        end_lte: to,
        limit: 500,
        relations: JSON.stringify(['assignedToId','typeId']),
      }
    );

    // Nur Team-Mitglieder durchlassen (per E-Mail oder Name matchen)
    const emailSet = new Set(
      (effectiveMembers||[]).map((m:any) => (m.email||'').trim().toLowerCase()).filter(Boolean)
    );
    const nameSet = new Set(
      (effectiveMembers||[]).map((m:any) => (m.name||'').trim().toLowerCase()).filter(Boolean)
    );

    const items = (res?.data||[])
      .filter((a:any) => {
        const u = a.assignedTo || a.user || {};
        const email = String(u.email||'').trim().toLowerCase();
        const full  = String([u.firstName,u.lastName].filter(Boolean).join(' ')).trim().toLowerCase();
        return (email && emailSet.has(email)) || (full && nameSet.has(full));
      })
      .map((a:any) => ({
        id: a._id || a.id,
        start: a.start || a.Start,
        end: a.end || a.End,
        user: {
          firstName: a.assignedTo?.firstName,
          lastName:  a.assignedTo?.lastName,
          email:     a.assignedTo?.email,
        },
        type: {
          name: a.type?.name || a.typeName || 'Abwesenheit',
        },
        status: a.status,
      }))
      .sort((x:any,y:any) => new Date(x.start).getTime() - new Date(y.start).getTime());

    return NextResponse.json({ ok:true, from, to, items });
  } catch (e:any) {
    console.error('[absence/upcoming GET]', e);
    return NextResponse.json({ ok:false, error: e?.message || 'internal' }, { status: 500 });
  }
}
