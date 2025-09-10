// app/api/groups/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { userId } = await requireUser(req);
    const s = supabaseAdmin();

    // Offene Gruppen (falls es eine Spalte visibility gibt)
    const { data: openGroups, error: gErr } = await s
      .from('groups')
      .select('id,name,description,visibility,memberCount:is_member_count') // memberCount optional via View
      .or('visibility.eq.public,visibility.is.null'); // fallback, wenn Spalte fehlt: or entfernen
    if (gErr) throw gErr;

    // Meine Mitgliedschaften
    const { data: my, error: mErr } = await s
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);
    if (mErr) throw mErr;

    const myIds = new Set((my ?? []).map(x => Number(x.group_id)));

    const out = (openGroups ?? []).map(g => ({
      id: Number(g.id),
      name: g.name,
      description: g.description ?? null,
      memberCount: (g as any).memberCount ?? null,
      isMember: myIds.has(Number(g.id)),
    }));

    return NextResponse.json({ ok: true, data: out });
  } catch (e: any) {
    const status = e?.status || 401;
    return NextResponse.json({ ok: false, error: e?.message || 'unauthorized' }, { status });
  }
}
