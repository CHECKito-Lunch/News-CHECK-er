// /app/api/admin/categories/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  const s = supabaseAdmin();
  const { data, error } = await s
    .from('categories')
    .select('id,name,color,show_vendor_filter,show_badges_filter,show_search_filter')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name, color, show_vendor_filter = true, show_badges_filter = true, show_search_filter = true } = body;

  if (!name) return NextResponse.json({ error: 'Name fehlt' }, { status: 400 });

  const s = supabaseAdmin();
  const { data, error } = await s
    .from('categories')
    .insert([{ name, color, show_vendor_filter, show_badges_filter, show_search_filter }])
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data?.id ?? null });
}
