// app/api/me/invitations/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { userId } = await requireUser();
    const s = supabaseAdmin();
    const { data, error } = await s
      .from('group_invitations')
      .select('id, group_id, group_name, message, created_at, invited_by, invited_by_name, invited_by_email')
      .eq('invited_user', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e: any) {
    const status = e?.status || 401;
    return NextResponse.json({ ok: false, error: e?.message || 'unauthorized' }, { status });
  }
}
