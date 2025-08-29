// /app/api/admin/categories/[id]/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const update: any = {};
  if ('name' in body) update.name = body.name;
  if ('color' in body) update.color = body.color;
  if ('show_vendor_filter'  in body) update.show_vendor_filter  = !!body.show_vendor_filter;
  if ('show_badges_filter'  in body) update.show_badges_filter  = !!body.show_badges_filter;
  if ('show_search_filter'  in body) update.show_search_filter  = !!body.show_search_filter;

  const s = supabaseAdmin();
  const { error } = await s.from('categories').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
