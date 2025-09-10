// app/api/password/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { userId } = await requireUser();
    const { newPassword } = await req.json().catch(() => ({}));
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json({ ok: false, error: 'weak_password' }, { status: 400 });
    }
    const s = supabaseAdmin();
    const { error } = await s.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e?.status || 500;
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status });
  }
}
