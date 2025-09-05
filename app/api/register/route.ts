// app/api/register/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = (body.email ?? '') as string;
    const password  = (body.password ?? '') as string;
    const name      = (body.name ?? '') as string;

    const email = emailRaw.trim().toLowerCase();

    if (!email.endsWith('@check24.de')) {
      return NextResponse.json({ error: 'Nur @check24.de erlaubt' }, { status: 403 });
    }
    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Name, E-Mail und Passwort sind erforderlich.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Passwort zu kurz (min. 8 Zeichen).' }, { status: 400 });
    }

    const s = supabaseAdmin(); // MUSS den Service-Role-Key nutzen

    // 1) Existiert in app_users schon jemand mit der E-Mail?
    const { data: exists } = await s.from(T.appUsers).select('id').eq('email', email).maybeSingle();
    if (exists) {
      return NextResponse.json({ error: 'Nutzer existiert bereits.' }, { status: 409 });
    }

    // 2) Auth-User in Supabase Authentication anlegen
    const created = await s.auth.admin.createUser({
      email,
      password,
      email_confirm: true,                   // E-Mail als bestätigt markieren
      user_metadata: { name },               // optional: Name in Meta
    });
    if (created.error || !created.data.user) {
      return NextResponse.json(
        { error: created.error?.message || 'Auth-User konnte nicht angelegt werden.' },
        { status: 400 }
      );
    }
    const authUserId = created.data.user.id;

    // 3) app_users-Eintrag erzeugen (ohne eigenes Passwort-Hashing!)
    const { error: insErr } = await s.from(T.appUsers).insert({
      email,
      name,
      role: 'user',     // Standardrolle
      active: false,    // Freischalten durch Admin
      user_id: authUserId,
    });
    if (insErr) {
      // Rollback-Idee: Auth-User wieder löschen (optional)
      await s.auth.admin.deleteUser(authUserId).catch(() => {});
      return NextResponse.json({ error: 'Fehler beim Anlegen (DB).' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
