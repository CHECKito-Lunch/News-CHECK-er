// app/api/meta/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function GET() {
  const s = supabaseServer();

  const [v, c, b] = await Promise.all([
    s.from(T.vendors).select('id, name').order('name', { ascending: true }),
    s.from(T.categories).select('id, name, color').order('name', { ascending: true }),
    s.from(T.badges).select('id, name, color, kind').order('name', { ascending: true }),
  ]);

  if (v.error) return NextResponse.json({ error: v.error.message }, { status: 500 });
  if (c.error) return NextResponse.json({ error: c.error.message }, { status: 500 });
  if (b.error) return NextResponse.json({ error: b.error.message }, { status: 500 });

  return NextResponse.json({
    vendors: v.data ?? [],
    categories: c.data ?? [],
    badges: b.data ?? [],
  });
}
