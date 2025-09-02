import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> } // ✅ Promise-Typ
) {
  const { slug } = await ctx.params;

  const s = supabaseAdmin();
  const { data, error } = await s
    .from('posts') // ggf. Tabellen-/View-Namen anpassen
    .select('id')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    return NextResponse.json({ id: null }, { status: 404 });
  }
  return NextResponse.json({ id: data.id });
}