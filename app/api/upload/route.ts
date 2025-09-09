// app/api/admin/uploads/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getAdminFromCookies } from '@/lib/admin-auth';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  if (!getAdminFromCookies())
    return NextResponse.json({ ok:false, error:'forbidden' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok:false, error:'form_required' }, { status: 400 });

  const files = form.getAll('files') as File[];
  if (!files.length) return NextResponse.json({ ok:false, error:'no_files' }, { status: 400 });

  const s = supabaseAdmin();
  const bucket = 'uploads'; // muss existieren & public sein
  const folder = `events/${new Date().toISOString().slice(0,10)}`;

  const urls: string[] = [];
  for (const f of files) {
    const path = `${folder}/${randomUUID()}-${f.name}`;
    const { error } = await s.storage.from(bucket).upload(path, f, {
      contentType: f.type || 'application/octet-stream',
      upsert: false,
    });
    if (error) {
      console.error('[uploads] upload failed', error);
      return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
    }
    const { data } = s.storage.from(bucket).getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return NextResponse.json({ ok:true, urls });
}
