// app/api/admin/posts/[id]/history/route.ts  (Pfad beispielhaft)
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const postId = Number(id);
  if (!postId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('post_revisions')
    .select('id, action, changed_at, editor_name, changes')
    .eq('post_id', postId)
    .order('changed_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}