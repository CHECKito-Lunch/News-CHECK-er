// /app/api/admin/categories/[id]/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = {};
  if ('name' in body) update.name = body.name;
  if ('color' in body) update.color = body.color;
  if ('show_vendor_filter' in body) update.show_vendor_filter = !!body.show_vendor_filter;
  if ('show_badges_filter' in body) update.show_badges_filter = !!body.show_badges_filter;
  if ('show_search_filter' in body) update.show_search_filter = !!body.show_search_filter;

  const s = supabaseAdmin();
  const { error } = await s.from('categories').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
