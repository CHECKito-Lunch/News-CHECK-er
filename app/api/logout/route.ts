import { NextResponse } from 'next/server';

export async function POST() {
  // Cookies per Response löschen (maxAge: 0)
  const res = NextResponse.json({ ok: true });
  const gone = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 0 };

  res.cookies.set('user_role', '', gone);
  res.cookies.set('user_email', '', gone);
  res.cookies.set('user_name', '', gone);

  return res;
}