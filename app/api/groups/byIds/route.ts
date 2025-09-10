// app/api/groups/byIds/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type Out = {
  id: number;
  name: string;
  description: string | null;
  memberCount: number | null;
  isMember: boolean;
};

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idsParam = (searchParams.get('ids') || '').trim();

    if (!idsParam) {
      return NextResponse.json({ ok: true, data: [] as Out[] });
    }

    // ids parsen & entdoppeln
    const ids = Array.from(
      new Set(
        idsParam
          .split(',')
          .map(s => Number(s.trim()))
          .filter(n => Number.isFinite(n) && n > 0)
      )
    );

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, data: [] as Out[] });
    }

    const ck = await cookies();
    const userId = ck.get('user_id')?.value ?? null;

    const s = supabaseAdmin();

    /* --- 1) BEVORZUGT: RPC (ein Roundtrip) --------------------------- */
    // Siehe SQL unten: get_groups_with_counts(ids bigint[], in_user uuid)
    const { data: rpcData, error: rpcErr } = await s.rpc('get_groups_with_counts', {
      ids,
      in_user: userId, // kann null sein
    });

    if (!rpcErr && Array.isArray(rpcData)) {
      const data: Out[] = rpcData.map((r: any) => ({
        id: Number(r.id),
        name: r.name,
        description: r.description ?? null,
        memberCount: typeof r.member_count === 'number' ? r.member_count : null,
        isMember: !!r.is_member,
      }));
      return NextResponse.json({ ok: true, data });
    }

    /* --- 2) FALLBACK: zwei einfache Queries + Merge ------------------ */
    // groups
    const { data: groups, error: gErr } = await s
      .from('groups')
      .select('id,name,description')
      .in('id', ids);

    if (gErr) throw gErr;

    // members (für Counts + isMember)
    const { data: members, error: mErr } = await s
      .from('group_members')
      .select('group_id,user_id')
      .in('group_id', ids);

    if (mErr) throw mErr;

    const countMap = new Map<number, number>();
    const mySet = new Set<number>();

    for (const row of members ?? []) {
      const gid = Number(row.group_id);
      countMap.set(gid, (countMap.get(gid) ?? 0) + 1);
      if (userId && row.user_id === userId) mySet.add(gid);
    }

    const data: Out[] = (groups ?? []).map(g => ({
      id: Number(g.id),
      name: g.name,
      description: g.description ?? null,
      memberCount: countMap.get(Number(g.id)) ?? 0,
      isMember: mySet.has(Number(g.id)),
    }));

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'server_error' },
      { status: 500 }
    );
  }
}
