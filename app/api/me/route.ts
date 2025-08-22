// app/api/me/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function GET() {
  const c = cookies();
  const email = c.get('user_email')?.value || '';
  const role = (c.get('user_role')?.value as 'admin'|'moderator'|'user'|undefined) || undefined;

  if (!email || !role) return NextResponse.json({ user: null });

  // Name aus DB holen (optional)
  const s = supabaseAdmin();
  const { data } = await s.from(T.appUsers).select('name').eq('email', email).single();

  return NextResponse.json({
    user: { sub: email, role, name: data?.name ?? null }
  });
}
