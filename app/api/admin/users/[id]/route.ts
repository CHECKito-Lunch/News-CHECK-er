// app/api/admin/users/[id]/password/route.ts
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const s = supabaseAdmin();
  const id = Number(ctx.params.id);
  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? '');

  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Passwort ist erforderlich (mind. 8 Zeichen).' }, { status: 400 });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const { error } = await s.from(T.appUsers).update({ password_hash }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}