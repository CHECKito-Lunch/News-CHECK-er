export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const folder = (form.get('folder') as string | null) ?? 'news';

    if (!file) return NextResponse.json({ error: 'no_file' }, { status: 400 });

    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin';
    const safeName = file.name.replace(/[^\w\-.]+/g, '_').slice(0, 70);
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safeName}`;

    const s = supabaseAdmin();
    const up = await s.storage.from('uploads').upload(key, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

    const pub = s.storage.from('uploads').getPublicUrl(key);
    return NextResponse.json({ path: key, url: pub.data.publicUrl });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message ?? 'upload_failed' }, { status: 500 });
  }
}
