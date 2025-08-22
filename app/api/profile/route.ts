// app/api/profile/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

type Role = 'admin'|'moderator'|'user';

export async function GET() {
  const c = await cookies();
  const email = c.get('user_email')?.value || '';
  const role = c.get('user_role')?.value as Role | undefined;
  if (!email || !role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.appUsers)
    .select('id,email,name,role, password_hash')
    .eq('email', email)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    data: {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role as Role,
      hasPassword: Boolean((data as any).password_hash),
    }
  });
}

export async function PATCH(req: Request) {
  const c = await cookies();
  const email = c.get('user_email')?.value || '';
  const role = c.get('user_role')?.value as Role | undefined;
  if (!email || !role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(()=>({}));
  const nextEmail: string | undefined = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;
  const nextName: string | null | undefined = typeof body.name === 'string' ? body.name : undefined;

  const update: Record<string, unknown> = {};
  if (typeof nextName !== 'undefined') update.name = nextName ?? null;
  if (typeof nextEmail !== 'undefined') {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) {
      return NextResponse.json({ error: 'Ungültige E-Mail.' }, { status: 400 });
    }
    update.email = nextEmail;
  }

  const s = supabaseAdmin();
  const { error } = await s.from(T.appUsers).update(update).eq('email', email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cookies anpassen, falls E-Mail geändert
  if (typeof nextEmail !== 'undefined' && nextEmail !== email) {
    c.set({ name: 'user_email', value: nextEmail, httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 60*60*24*30 });
  }

  return NextResponse.json({ ok: true });
}