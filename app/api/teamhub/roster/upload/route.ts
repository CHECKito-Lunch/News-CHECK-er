/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlJson } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (d: unknown, s=200) => NextResponse.json(d, { status:s });

type RowIn = {
  date_raw: string;   // kann ISO, dd.mm.yyyy oder Excel-Serienzahl als String enthalten
  start_raw: string;  // HH:MM oder Excel-Fraktion (0.5)
  end_raw: string;
  employee: string;
  role?: string|null;
  note?: string|null;
};

function toISODate(s: string): string | null {
  if (!s) return null;
  const t = s.trim();
  // Excel-Serienzahl?
  const n = Number(t);
  if (Number.isFinite(n) && n>0 && t === String(n)) {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = (n - 0) * 86400000;
    const d = new Date(epoch + ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
  }
  // dd.mm.yyyy
  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    const dd = +m[1], MM = +m[2], yy = +m[3];
    const year = m[3].length === 2 ? (2000+yy) : yy;
    const d = new Date(Date.UTC(year, MM-1, dd));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
  }
  // ISO oder parsebar
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
}

function toHHMM(s: string): string | null {
  if (!s) return null;
  const t = s.trim();
  // Excel-Fraktion
  const n = Number(t);
  if (Number.isFinite(n) && n>0 && n<2 && t === String(n)) {
    const min = Math.round(n*24*60);
    const h = Math.floor(min/60), m = min%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  // HH:MM
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = Math.min(23, Math.max(0, parseInt(m[1],10)));
    const mi = Math.min(59, Math.max(0, parseInt(m[2],10)));
    return `${String(hh).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;
  }
  return null;
}

export async function POST(req: NextRequest){
  try {
    const me = await getUserFromCookies().catch(()=>null);
    if (!me) return json({ ok:false, error:'unauthorized' }, 401);
    if (me.role !== 'teamleiter' && me.role !== 'admin') {
      return json({ ok:false, error:'forbidden' }, 403);
    }

    const form = await req.formData();
    const teamId = Number(form.get('team_id') ?? NaN);
    const rowsRaw = String(form.get('rows') ?? '[]');
    const rows: RowIn[] = JSON.parse(rowsRaw);

    if (!Number.isFinite(teamId) || teamId<=0) return json({ ok:false, error:'invalid team_id' }, 400);
    if (!Array.isArray(rows) || rows.length===0) return json({ ok:false, error:'no_rows' }, 400);

    // Prüfen: ist requester Teamleiter dieses Teams?
    const can = await sql<{ok:boolean}[]>/*sql*/`
      select exists(
        select 1 from public.team_memberships tm
        where tm.team_id = ${teamId}::bigint
          and tm.user_id = ${me.user_id}::uuid
          and tm.is_teamleiter and tm.active
      ) as ok
    `;
    if (!can?.[0]?.ok && me.role !== 'admin') return json({ ok:false, error:'forbidden' }, 403);

    // Normalisieren
    const norm = rows.map(r => {
      const date = toISODate(String(r.date_raw||''));
      const startHHMM = toHHMM(String(r.start_raw||''));
      const endHHMM   = toHHMM(String(r.end_raw||''));
      const emp = String(r.employee||'').trim();
      return {
        roster_date: date,                 // YYYY-MM-DD
        start_time:  startHHMM,            // HH:MM
        end_time:    endHHMM,              // HH:MM
        employee_name: emp || null,
        role: (r.role ?? null) ? String(r.role).trim() : null,
        note: (r.note ?? null) ? String(r.note).trim() : null,
      };
    }).filter(x => x.roster_date && x.start_time && x.end_time && x.employee_name) as Array<{
      roster_date:string; start_time:string; end_time:string; employee_name:string; role:string|null; note:string|null;
    }>;

    if (norm.length===0) return json({ ok:false, error:'no_valid_rows' }, 400);

    // Versuch: Mitarbeiter -> user_id matchen (per Name) innerhalb des Teams
    // (einfacher Normalizer: lower/kompakte Spaces)
    const res = await sql/*sql*/`
      with src as (
        select * from jsonb_to_recordset(${sqlJson(norm)}) as r(
          roster_date text, start_time text, end_time text,
          employee_name text, role text, note text
        )
      ),
      team_users as (
        select au.user_id, trim(regexp_replace(lower(coalesce(au.name,'')),'\\s+',' ','g')) as nm
        from public.app_users au
        join public.team_memberships tm on tm.user_id = au.user_id
        where tm.team_id = ${teamId}::bigint and tm.active = true and au.active = true
      ),
      prep as (
        select
          ${teamId}::bigint as team_id,
          s.roster_date::date as roster_date,
          s.start_time::time  as start_time,
          s.end_time::time    as end_time,
          s.employee_name,
          tu.user_id as user_id,
          nullif(s.role,'') as role,
          nullif(s.note,'') as note,
          ${me.user_id}::uuid as created_by
        from src s
        left join team_users tu
          on tu.nm = trim(regexp_replace(lower(coalesce(s.employee_name,'')),'\\s+',' ','g'))
      )
      insert into public.team_roster (team_id, roster_date, start_time, end_time, employee_name, user_id, role, note, created_by)
      select team_id, roster_date, start_time, end_time, employee_name, user_id, role, note, created_by
      from prep
      returning id
    `;

    return json({ ok:true, inserted: Array.isArray(res) ? res.length : 0 });
  } catch (e:any) {
    console.error('[roster/upload]', e);
    return json({ ok:false, error: e?.message ?? 'server_error' }, 500);
  }
}
