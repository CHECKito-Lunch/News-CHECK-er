// app/api/upload/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getAdminFromCookies } from '@/lib/admin-auth';

function sanitizeName(name: string) {
  // Datei-Namen sicher machen (Umlaute bleiben lesbar, Sonderzeichen -> '_')
  const base = name.replace(/[/\\]/g, '_');
  return base.replace(/[^\w\-.[\]()+ÄÖÜäöüß ]+/g, '_').slice(0, 70);
}

export async function POST(req: NextRequest) {
  // ✅ Admin-Check mit Request
  const admin = await getAdminFromCookies(req);
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 401 });
  }

  try {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ ok: false, error: 'no_form' }, { status: 400 });

    const file = form.get('file') as File | null;
    const folder = (form.get('folder') as string | null) ?? 'news';
    if (!file) return NextResponse.json({ ok: false, error: 'no_file' }, { status: 400 });

    const safeName = sanitizeName(file.name || 'upload.bin');
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

    const s = supabaseAdmin();
    const up = await s.storage.from('uploads').upload(key, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });
    if (up.error) {
      return NextResponse.json({ ok: false, error: up.error.message }, { status: 500 });
    }

    const pub = s.storage.from('uploads').getPublicUrl(key);
    return NextResponse.json({ ok: true, path: key, url: pub.data.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'upload_failed' }, { status: 500 });
  }
}
