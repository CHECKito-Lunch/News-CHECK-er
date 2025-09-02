// app/api/admin/kpis/[id]/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Beispiel: DELETE /api/admin/kpis/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // (Optional) Admin-Guard: Session + Profile prüfen
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: prof } = await sb.from('profiles').select('role').eq('user_id', user.id).single();
  if (prof?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Admin-Operation mit Service-Client
  const admin = supabaseAdmin();
  const { error } = await admin.from('kpis').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}