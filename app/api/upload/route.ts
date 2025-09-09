export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase-server';
import { sql } from '@/lib/db';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function isAdmin() {
  const s = await supabaseServer();
  const { data } = await s.auth.getUser();
  if (!data?.user) return { ok: false as const, code: 401 };
  const [me] = await sql<{ role: string }[]>`
    select role from public.app_users where user_id=${data.user.id} and active=true limit 1
  `;
  if (me?.role !== 'admin') return { ok: false as const, code: 403 };
  return { ok: true as const };
}

export async function POST(req: Request) {
  try {
    const auth = await isAdmin();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.code === 401 ? 'unauthorized' : 'forbidden' }, { status: auth.code });
    }

    const form = await req.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ ok: false, error: 'no_files' }, { status: 400 });

    const admin = supabaseAdmin();
    const uploaded: string[] = [];

    for (const file of files) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await admin.storage
        .from('events')
        .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

      const { data } = admin.storage.from('events').getPublicUrl(path);
      uploaded.push(data.publicUrl);
    }

    return NextResponse.json({ ok: true, urls: uploaded });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'server_error' }, { status: 500 });
  }
}
