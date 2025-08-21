import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const c = cookies();

  // Falls du andere Cookie-Namen nutzt, hier ergänzen:
  const names = ['admin_auth', 'editor_auth'];

  names.forEach((name) => {
    c.set({
      name,
      value: '',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 0,
    });
  });

  return NextResponse.json({ ok: true });
}
