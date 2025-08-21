import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function GET() {
  const s = supabaseAdmin();
  const [vendors, categories, badges] = await Promise.all([
    s.from(T.vendors).select('id,name').order('name'),
    s.from(T.categories).select('id,name,color').order('name'),
    s.from(T.badges).select('id,name,color,kind').order('name'),
  ]);
  const err = vendors.error || categories.error || badges.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  return NextResponse.json({
    vendors: vendors.data ?? [],
    categories: categories.data ?? [],
    badges: badges.data ?? [],
  });
}
