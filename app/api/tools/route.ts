import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

// GET /api/tools
export async function GET() {
  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.tools)
    .select('id,title,icon,href,sort')
    .order('sort', { ascending: true })
    .order('title', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
