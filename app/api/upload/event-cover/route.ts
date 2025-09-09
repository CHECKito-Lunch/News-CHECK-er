export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase-server';

async function requireAdmin() {
  const s = await supabaseServer();
  const { data } = await s.auth.getUser();
  if (!data?.user) throw new Response('Unauthorized', { status: 401 });
  // … dein Admin-Check nach Wunsch
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  await requireAdmin();

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ ok: false, error: 'file_missing' }, { status: 400 });

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `covers/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const admin = supabaseAdmin();
  const { error } = await admin.storage
    .from('events')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const { data: pub } = admin.storage.from('events').getPublicUrl(path);
  return NextResponse.json({ ok: true, url: pub.publicUrl, path });
}
