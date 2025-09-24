// app/api/admin/kpis/[id]/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

export async function GET(_req: Request, context: any) {
  const id = Number(context?.params?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.kpis)
    .select(
      'id,key,label,value,unit,trend,color,sort,compare_value,compare_label,chart_type,history,updated_at'
    )
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, context: any) {
  const id = Number(context?.params?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const b = await req.json().catch(() => ({} as any));
  const patch: Record<string, any> = {};

  if (typeof b.key === 'string') patch.key = b.key.trim();
  if (typeof b.label === 'string') patch.label = b.label.trim();
  if (typeof b.value === 'string') patch.value = b.value.trim();
  if (b.unit !== undefined) patch.unit = b.unit || null;
  if (['up', 'down', 'flat', null].includes(b.trend)) patch.trend = b.trend ?? null;
  if (b.color !== undefined) patch.color = b.color || null;
  if (typeof b.sort === 'number') patch.sort = b.sort;

  if (b.compare_value !== undefined) {
    patch.compare_value =
      typeof b.compare_value === 'number' && Number.isFinite(b.compare_value)
        ? b.compare_value
        : null;
  }
  if (b.compare_label !== undefined) patch.compare_label = b.compare_label?.trim() || null;

  if (b.chart_type !== undefined) {
    patch.chart_type = b.chart_type === 'bar' || b.chart_type === 'line' ? b.chart_type : null;
  }
  if (b.history !== undefined) {
    patch.history = Array.isArray(b.history)
      ? b.history.filter((n: any) => typeof n === 'number' && Number.isFinite(n))
      : null;
  }

  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.kpis)
    .update(patch)
    .eq('id', id)
    .select(
      'id,key,label,value,unit,trend,color,sort,compare_value,compare_label,chart_type,history,updated_at'
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, context: any) {
  const id = Number(context?.params?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const s = supabaseAdmin();
  const { error } = await s.from(T.kpis).delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
