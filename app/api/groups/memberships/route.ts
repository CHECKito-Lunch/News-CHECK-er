// app/api/groups/memberships/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { userId } = await requireUser();
    const s = supabaseAdmin();
    const { data, error } = await s.from('group_members').select('group_id').eq('user_id', userId);
    if (error) throw error;
    const groupIds = (data ?? []).map(r => Number(r.group_id));
    return NextResponse.json({ ok: true, groupIds });
  } catch (e: any) {
    const status = e?.status || 401;
    return NextResponse.json({ ok: false, error: e?.message || 'unauthorized' }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await requireUser();
    const { groupId, action } = await req.json().catch(() => ({}));
    if (!groupId) return NextResponse.json({ ok: false, error: 'groupId_required' }, { status: 400 });

    const s = supabaseAdmin();

    if (action === 'join') {
      const { error } = await s.from('group_members').insert({ group_id: groupId, user_id: userId });
      if (error) throw error;
    } else if (action === 'leave') {
      const { error } = await s.from('group_members').delete().match({ group_id: groupId, user_id: userId });
      if (error) throw error;
    } else {
      return NextResponse.json({ ok: false, error: 'invalid_action' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e?.status || 401;
    return NextResponse.json({ ok: false, error: e?.message || 'unauthorized' }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const { userId } = await requireUser();
    const { groupIds } = await req.json().catch(() => ({}));
    if (!Array.isArray(groupIds)) {
      return NextResponse.json({ ok: false, error: 'groupIds_required' }, { status: 400 });
    }

    const s = supabaseAdmin();
    // alles entfernen…
    await s.from('group_members').delete().eq('user_id', userId);
    // … und neu setzen
    if (groupIds.length) {
      const rows = groupIds.map((gid: number) => ({ group_id: gid, user_id: userId }));
      await s.from('group_members').insert(rows);
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e?.status || 401;
    return NextResponse.json({ ok: false, error: e?.message || 'unauthorized' }, { status });
  }
}
