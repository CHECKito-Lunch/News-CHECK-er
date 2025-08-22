import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const c = cookies();
  const opts = { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 0 as const };
  c.set({ name: 'role', value: '', ...opts });
  c.set({ name: 'user_email', value: '', ...opts });
  c.set({ name: 'user_name', value: '', ...opts });
  return NextResponse.json({ ok: true });
}
