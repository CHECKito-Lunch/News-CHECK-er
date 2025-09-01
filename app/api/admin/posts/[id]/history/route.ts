import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const postId = Number(params.id);
  if (!postId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('post_revisions')
    .select('id, action, changed_at, editor_name, changes')
    .eq('post_id', postId)
    .order('changed_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
