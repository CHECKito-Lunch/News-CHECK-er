// app/api/profile/password/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';
import bcrypt from 'bcryptjs';

type Role = 'admin'|'moderator'|'user';

export async function POST(req: Request) {
  const c = cookies();
  const email = c.get('user_email')?.value || '';
  const role = c.get('user_role')?.value as Role | undefined;
  if (!email || !role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(()=>({}));
  const current = body.current as string | null;
  const next = body.next as string | undefined;

  if (!next || next.length < 8) return NextResponse.json({ error: 'Passwort zu kurz.' }, { status: 400 });

  const s = supabaseAdmin();
  const { data, error } = await s.from(T.appUsers).select('id,password_hash').eq('email', email).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const hasHash = Boolean((data as any).password_hash);
  if (hasHash) {
    if (!current) return NextResponse.json({ error: 'Aktuelles Passwort erforderlich.' }, { status: 400 });
    const ok = await bcrypt.compare(current, (data as any).password_hash as string);
    if (!ok) return NextResponse.json({ error: 'Aktuelles Passwort falsch.' }, { status: 400 });
  }

  const newHash = await bcrypt.hash(next, 10);
  const { error: upErr } = await s.from(T.appUsers).update({ password_hash: newHash }).eq('id', data.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}