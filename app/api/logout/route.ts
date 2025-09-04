// app/api/logout/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_BASE_URL || 'https://news-check-puce.vercel.app'));
  const common = { path: '/', sameSite: 'lax' as const };

  res.cookies.set({ name: 'auth', value: '', maxAge: 0, ...common });
  res.cookies.set({ name: 'user_role', value: '', maxAge: 0, ...common });

  // Supabase-Cookies ebenfalls entfernen (schadet nicht)
  res.cookies.set({ name: 'sb-access-token', value: '', maxAge: 0, ...common });
  res.cookies.set({ name: 'sb-refresh-token', value: '', maxAge: 0, ...common });

  return res;
}
