// app/api/admin/users/[id]/password/route.ts
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> } // 👈 Next 15
) {
  const { id } = await params;
  const userId = Number(id);

  const body = await req.json().catch(() => ({} as { password?: string }));
  const password = typeof body.password === 'string' ? body.password : '';

  if (!userId || Number.isNaN(userId)) {
    return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Passwort ist erforderlich (mind. 8 Zeichen).' }, { status: 400 });
  }

  const password_hash = await bcrypt.hash(password, 12);

  const s = supabaseAdmin();
  const { error } = await s
    .from(T.appUsers)
    .update({ password_hash, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}