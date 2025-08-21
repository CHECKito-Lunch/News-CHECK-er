import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ ok: true });

  // Falls du andere Cookie-Namen nutzt: hier ergänzen
  const names = ['admin_auth', 'editor_auth'];

  // for...of statt forEach (robuster, falls ein API-Call mal async wäre)
  for (const name of names) {
    // Cookie zuverlässig “entwerten”
    res.cookies.set({
      name,
      value: '',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 0,           // sofort ablaufen
    });

    // alternativ (kurz), löscht ohne Expire-Header:
    // res.cookies.delete(name);
  }

  return res;
}
