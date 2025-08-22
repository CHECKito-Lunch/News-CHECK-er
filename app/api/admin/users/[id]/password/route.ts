// app/api/admin/users/[id]/password/route.ts
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> } // 👈 wichtig in Next 15
) {
  const { id } = await params;

  const { password } = await req.json().catch(() => ({} as { password?: string }));
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Passwort (mind. 8 Zeichen) erforderlich.' }, { status: 400 });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const s = supabaseAdmin();
  const { error } = await s
    .from(T.appUsers)
    .update({ password_hash, updated_at: new Date().toISOString() })
    .eq('id', Number(id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}