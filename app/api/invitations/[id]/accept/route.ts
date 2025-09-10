// app/api/invitations/[id]/accept/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;

    const s = supabaseAdmin();
    const { data: inv, error: iErr } = await s
      .from('group_invitations')
      .select('group_id, invited_user')
      .eq('id', id)
      .maybeSingle();
    if (iErr || !inv) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    if (inv.invited_user !== userId) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

    await s.from('group_members').insert({ group_id: inv.group_id, user_id: userId });
    await s.from('group_invitations').delete().eq('id', id);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e?.status || 401;
    return NextResponse.json({ ok: false, error: e?.message || 'unauthorized' }, { status });
  }
}
