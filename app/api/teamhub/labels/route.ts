/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// app/api/teamhub/labels/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth';

const json = (d: unknown, s = 200) => NextResponse.json(d, { status: s });

// simple slugify, lower, replace spaces/umlauts, remove non-url chars
function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/ß/g, 'ss')
    .replace(/[ä]/g, 'ae')
    .replace(/[ö]/g, 'oe')
    .replace(/[ü]/g, 'ue')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// ensure unique slug (feedback_labels.slug UNIQUE)
async function makeUniqueSlug(base: string) {
  let slug = base;
  let i = 0;
  // @ts-ignore – using tagged template sql from your db helper
  const exists = async (s: string) => {
    const r = await sql/*sql*/`select 1 from public.feedback_labels where slug = ${s} limit 1`;
    return Array.isArray(r) && r.length > 0;
  };
  while (await exists(slug)) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

/* -------------------------------- GET --------------------------------- */
/**
 * Liefert:
 *  - globale Labels (scope='global')
 *  - team-scoped Labels für alle Teams, in denen der eingeloggte User Teamleiter ist
 * Optional: ?team_id=<bigint> filtert Team-Labels auf ein Team
 */
export async function GET(req: NextRequest) {
  try {
    const me = await getUserFromCookies().catch(() => null);
    if (!me) return json({ ok: false, error: 'unauthorized' }, 401);

    const { searchParams } = new URL(req.url);
    const teamIdParam = searchParams.get('team_id'); // optional
    const teamFilter = teamIdParam ? Number(teamIdParam) : null;

    // Teams, die ich (aktiver) Teamleiter bin
    const myTeams = await sql<Array<{ team_id: string }>>/*sql*/`
      select distinct tm.team_id::text as team_id
      from public.team_memberships tm
      where tm.user_id = ${me.user_id}::uuid
        and tm.is_teamleiter
        and tm.active
    `;

    const allowedTeamIds = new Set((myTeams ?? []).map((t: { team_id: any; }) => t.team_id));
    if (teamFilter !== null && !allowedTeamIds.has(String(teamFilter))) {
      // Kein Zugriff auf dieses Team
      return json({ ok: true, items: [] });
    }

    const rows = await sql<Array<{ id: string; name: string; color: string | null; scope: string; team_id: string | null }>>/*sql*/`
      with my_team_labels as (
        select l.id::text, l.name, l.color, l.scope, l.team_id::text
        from public.feedback_labels l
        where l.scope = 'team'::text
          ${teamFilter !== null
            ? sql`and l.team_id = ${teamFilter}::bigint`
            : sql`and exists (
                select 1 from public.team_memberships tm
                where tm.team_id = l.team_id
                  and tm.user_id = ${me.user_id}::uuid
                  and tm.is_teamleiter and tm.active
              )`
          }
      ),
      global_labels as (
        select l.id::text, l.name, l.color, l.scope, null::text as team_id
        from public.feedback_labels l
        where l.scope = 'global'::text
      )
      select * from my_team_labels
      union all
      select * from global_labels
      order by name asc nulls last
    `;

    return json({ ok: true, items: rows ?? [] });
  } catch (err: any) {
    console.error('teamhub/labels GET error:', err?.message || err);
    return json({ ok: false, error: err?.message ?? 'internal_error' }, 500);
  }
}

/* -------------------------------- POST -------------------------------- */
/**
 * Body: { name: string, color?: string, team_id: string|number }
 * - legt ein TEAM-Label an (scope='team')
 * - prüft, ob Requester Teamleiter in diesem Team ist
 * - generiert einzigartigen slug
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getUserFromCookies().catch(() => null);
    if (!me) return json({ ok: false, error: 'unauthorized' }, 401);

    // nur admin oder teamleiter dürfen Team-Labels erzeugen
    if (me.role !== 'teamleiter' && me.role !== 'admin') {
      return json({ ok: false, error: 'forbidden' }, 403);
    }

    const body = await req.json().catch(() => null);
    const nameRaw = String(body?.name ?? '').trim();
    const color = (body?.color ?? null) as string | null;
    const teamId = body?.team_id != null ? Number(body.team_id) : NaN;

    if (!nameRaw || !Number.isFinite(teamId)) {
      return json({ ok: false, error: 'missing name or team_id' }, 400);
    }

    // Ist der User Teamleiter dieses Teams?
    const can = await sql<Array<{ ok: boolean }>>/*sql*/`
      select exists(
        select 1 from public.team_memberships tm
        where tm.user_id = ${me.user_id}::uuid
          and tm.team_id = ${teamId}::bigint
          and tm.is_teamleiter
          and tm.active
      ) as ok
    `;
    const allowed = Boolean(can?.[0]?.ok);
    if (!allowed && me.role !== 'admin') {
      return json({ ok: false, error: 'forbidden' }, 403);
    }

    const base = slugify(nameRaw);
    const slug = await makeUniqueSlug(base || 'label');

    const ins = await sql<Array<{ id: string }>>/*sql*/`
      insert into public.feedback_labels (name, slug, color, scope, team_id, created_by)
      values (${nameRaw}, ${slug}, ${color}, 'team', ${teamId}::bigint, ${me.user_id}::uuid)
      returning id::text
    `;

    return json({ ok: true, id: ins?.[0]?.id ?? null });
  } catch (err: any) {
    console.error('teamhub/labels POST error:', err?.message || err);
    // UNIQUE violation → freundliche Meldung
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('duplicate key') && msg.includes('feedback_labels_slug_key')) {
      return json({ ok: false, error: 'slug_conflict' }, 409);
    }
    return json({ ok: false, error: err?.message ?? 'internal_error' }, 500);
  }
}
