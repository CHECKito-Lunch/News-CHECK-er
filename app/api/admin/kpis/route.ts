import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

// GET /api/admin/kpis
export async function GET() {
  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.kpis)
    .select('id,key,label,value,unit,trend,color,sort,updated_at,created_at')
    .order('sort', { ascending: true })
    .order('label', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/admin/kpis
export async function POST(req: Request) {
  const s = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const key = String(body.key ?? '').trim();
  const label = String(body.label ?? '').trim();
  const value = String(body.value ?? '').trim();
  const unit = (body.unit ?? '') || null;
  const trend = (body.trend ?? null) as 'up'|'down'|'flat'|null;
  const color = (body.color ?? '') || null;

  if (!key || !label || !value) {
    return NextResponse.json({ error: 'key, label und value sind erforderlich.' }, { status: 400 });
  }

  // sort automatisch hinter das letzte Element
  const { data: mx } = await s.from(T.kpis).select('sort').order('sort', { ascending: false }).limit(1).maybeSingle();
  const sort = (mx?.sort ?? 0) + 10;

  const { data, error } = await s
    .from(T.kpis)
    .insert({ key, label, value, unit, trend, color, sort })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}