export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const isUUID = (s:unknown):s is string => typeof s==='string' && /^[0-9a-f-]{36}$/i.test(s);

export async function GET(req: NextRequest) {
  const me = await getUserFromCookies(req).catch(()=>null);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get('scope');    // 'global' | 'team' | null
  const teamId = searchParams.get('team_id'); // optional

  // Default: globale + alle team-labels des Teams des Nutzers (falls vorhanden)
  let rows:any[] = [];

  if (scope === 'global') {
    rows = await sql/*sql*/`select id, name, slug, color, scope, team_id from public.feedback_labels where scope='global' order by name`;
  } else if (scope === 'team') {
    const tid = teamId ? Number(teamId) : null;
    if (!tid) {
      // Team des Users ermitteln
      const t = await sql/*sql*/`select team_id from public.team_memberships where user_id=${me.user_id}::uuid and active limit 1`;
      if (t.length === 0) return NextResponse.json({ ok:true, items: [] });
      rows = await sql/*sql*/`select id, name, slug, color, scope, team_id from public.feedback_labels where scope='team' and team_id=${t[0].team_id} order by name`;
    } else {
      rows = await sql/*sql*/`select id, name, slug, color, scope, team_id from public.feedback_labels where scope='team' and team_id=${tid} order by name`;
    }
  } else {
    // Gemischt: global + team des Users
    const t = await sql/*sql*/`select team_id from public.team_memberships where user_id=${me.user_id}::uuid and active limit 1`;
    const tid = t[0]?.team_id ?? null;
    rows = await sql/*sql*/`
      select id, name, slug, color, scope, team_id
      from public.feedback_labels
      where scope='global' or (scope='team' and team_id=${tid})
      order by scope asc, name asc
    `;
  }

  return NextResponse.json({ ok:true, items: rows });
}

export async function POST(req: NextRequest) {
  const me = await getUserFromCookies(req).catch(()=>null);
  if (!me) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

  let b:any={};
  try { b = await req.json(); } catch {}
  const name = String(b?.name ?? '').trim();
  const color = b?.color ? String(b.color) : null;
  const scope = (b?.scope === 'team' ? 'team' : (b?.scope === 'global' ? 'global' : null));
  const team_id = b?.team_id != null ? Number(b.team_id) : null;

  if (!name) return NextResponse.json({ ok:false, error:'missing_name' }, { status:400 });

  // Berechtigungen: admin darf global/team, teamleiter darf nur team-labels für sein Team
  if (scope === 'global') {
    if (me.role !== 'admin') return NextResponse.json({ ok:false, error:'forbidden_global' }, { status:403 });
  }

  let effectiveTeamId: number | null = null;
  if (scope === 'team') {
    if (me.role === 'admin') {
      if (!Number.isFinite(team_id)) return NextResponse.json({ ok:false, error:'missing_team_id' }, { status:400 });
      effectiveTeamId = team_id!;
    } else if (me.role === 'teamleiter') {
      // Team des TL auflösen
      const t = await sql/*sql*/`
        select team_id from public.team_memberships
        where user_id=${me.user_id}::uuid and is_teamleiter and active
        limit 1
      `;
      if (t.length === 0) return NextResponse.json({ ok:false, error:'no_teamlead' }, { status:403 });
      effectiveTeamId = t[0].team_id;
    } else {
      return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });
    }
  }

  const slug = name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'').slice(0,64) || 'label';
  const ins = await sql/*sql*/`
    insert into public.feedback_labels (name, slug, color, scope, team_id, created_by)
    values (${name}, ${slug}, ${color}, ${scope ?? 'global'}, ${effectiveTeamId}, ${me.user_id}::uuid)
    returning id, name, slug, color, scope, team_id
  `;
  return NextResponse.json({ ok:true, item: ins[0] });
}
