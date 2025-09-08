import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const jar = await cookies();
  const now = new Date().toISOString();

  jar.set({
    name: 'last_seen_at',
    value: now,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 Tage
  });

  return NextResponse.json({ ok: true, last_seen_at: now });
}
