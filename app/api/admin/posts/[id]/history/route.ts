import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function parseId(ctx: any): number | null {
  const idStr = ctx?.params?.id as string | undefined;
  const idNum = Number(idStr);
  return Number.isFinite(idNum) ? idNum : null;
}

export async function GET(_req: NextRequest, ctx: any) {
  const id = parseId(ctx);
  if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { data, error } = await s
    .from('post_revisions')
    .select('id, action, changed_at, editor_name, editor_user_id, changes')
    .eq('post_id', id)
    .order('changed_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
