// app/api/register/route.ts
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';
import { v4 as uuidv4 } from 'uuid';


export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const emailRaw = (body.email as string | undefined) || '';
  const password = (body.password as string | undefined) || '';
  const name = (body.name as string | undefined) || '';

  const email = emailRaw.trim().toLowerCase();

  if (!email.endsWith('@check24.de')) {
    return NextResponse.json({ error: 'Nur @check24.de erlaubt' }, { status: 403 });
  }

  if (!email || !password || !name) {
    return NextResponse.json({ error: 'Name, E-Mail und Passwort sind erforderlich.' }, { status: 400 });
  }

  const s = supabaseAdmin();
  const existing = await s.from(T.appUsers).select('id').eq('email', email).maybeSingle();

  if (existing.data) {
    return NextResponse.json({ error: 'Nutzer existiert bereits.' }, { status: 409 });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { error } = await s.from(T.appUsers).insert({
    email,
    name,
    password_hash,
    role: 'user',      // Standardrolle
    active: false,     // Muss durch Admin freigeschaltet werden
    user_id: uuidv4(),
  });

  if (error) {
    console.error(error);
    return NextResponse.json({ error: 'Fehler beim Anlegen.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
