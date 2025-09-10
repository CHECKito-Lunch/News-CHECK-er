// app/api/profile/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request) {
  try {
    const { userId, email } = await requireUser();
    const { name } = await req.json().catch(() => ({}));
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 });
    }

    const s = supabaseAdmin();

    // 1) app_users.name aktualisieren (falls vorhanden)
    await s.from('app_users').update({ name, updated_at: new Date().toISOString() })
      .or(`user_id.eq.${userId}${email ? `,email.eq.${email}` : ''}`);

    // 2) Auth-Metadaten
    await s.auth.admin.updateUserById(userId, { user_metadata: { full_name: name, name } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e?.status || 500;
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status });
  }
}
