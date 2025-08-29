import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function GET() {
  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.kpis)
    .select('id,key,label,value,unit,trend,color,sort,updated_at')
    .order('sort', { ascending: true })
    .order('label', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}