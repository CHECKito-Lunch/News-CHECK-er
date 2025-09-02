// app/api/termine/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

// GET /api/termine
// Liefert das alte Frontend-Shape: { id, title, date } (date = starts_at)
export async function GET() {
  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.termine)
    .select('id,title,starts_at,date')
    .order('starts_at', { ascending: true, nullsFirst: true })
    .order('date', { ascending: true, nullsFirst: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    // Frontend erwartet "date": string → wir nutzen starts_at (Fallback: date)
    date: (r.starts_at ?? (r.date ? new Date(r.date).toISOString() : null)) as string | null,
  }));

  return NextResponse.json({ data: rows });
}
