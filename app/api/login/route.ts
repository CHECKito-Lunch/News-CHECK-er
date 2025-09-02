// app/api/login/route.ts
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

// erzwinge Node.js Runtime (Supabase Service-Role + bcrypt)
export const runtime = 'nodejs';

type Role = 'admin' | 'moderator' | 'user';
type AppUser = {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  password_hash: string | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = (body.email as string | undefined) || '';
    const password = (body.password as string | undefined) || '';

    const email = emailRaw.trim().toLowerCase();
    if (!email || !password) {
      return NextResponse.json({ error: 'E-Mail und Passwort erforderlich.' }, { status: 400 });
    }

    const s = supabaseAdmin();

    // nur die benötigten Spalten holen
    const { data, error } = await s
      .from(T.appUsers)
      .select('id,email,name,role,password_hash')
      .eq('email', email)
      .single<AppUser>();

    // Einmalige Dummy-Compare, um Timing nicht zu verraten (optional)
    // Falls user nicht existiert oder kein Hash vorhanden:
    if (error || !data || !data.password_hash) {
      // Dummy-Hash-Compare, um gleiche Laufzeit zu erzielen (Option: aus ENV holen)
      await bcrypt.compare(password, '$2a$12$CwTycUXWue0Thq9StjUM0uJ8Yb6m3/6uD3c6q8x5kVn1W9qz3YQy2'); // Hash von "invalid"
      return NextResponse.json({ error: 'Login fehlgeschlagen.' }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, data.password_hash);
    if (!ok) {
      return NextResponse.json({ error: 'Login fehlgeschlagen.' }, { status: 401 });
    }

    // Cookies über die Response setzen (Next 15-konform)
    const res = NextResponse.json({ ok: true });
    const maxAge = 60 * 60 * 8; // 8h Session
    const base = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge };

    res.cookies.set('user_role', String(data.role), base);
    res.cookies.set('user_email', String(data.email), base);
    if (data.name) res.cookies.set('user_name', String(data.name), base);

    // Caching verhindern
    res.headers.set('Cache-Control', 'no-store');

    return res;
  } catch (e) {
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 });
  }
}