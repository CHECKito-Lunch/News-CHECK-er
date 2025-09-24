// app/api/admin/kpis/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';
// Optional: Admin-Gate
// import { requireAdmin } from '@/lib/requireAdmin';

type Payload = {
  key: string;
  label: string;
  value: string;
  unit?: string | null;
  trend?: 'up' | 'down' | 'flat' | null;
  color?: string | null;
  sort?: number;

  // neu:
  compare_value?: number | null;
  compare_label?: string | null;
  chart_type?: 'bar' | 'line' | null;   // 'none' wird auf null gemappt
  history?: number[] | null;
};

export async function GET() {
  // await requireAdmin(req)  // falls du Zugriffe beschränken willst
  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.kpis)
    .select('id,key,label,value,unit,trend,color,sort,compare_value,compare_label,chart_type,history,updated_at')
    .order('sort', { ascending: true })
    .order('label', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  // await requireAdmin(req)
  const body = (await req.json().catch(() => ({}))) as Partial<Payload>;

  // Pflichtfelder prüfen
  if (!body.key?.trim() || !body.label?.trim() || !body.value?.trim()) {
    return NextResponse.json({ error: 'key, label und value sind erforderlich.' }, { status: 400 });
  }

  // Normalisieren
  const chartType =
    body.chart_type === 'bar' || body.chart_type === 'line'
      ? body.chart_type
      : null;

  const row: Payload = {
    key: body.key.trim(),
    label: body.label.trim(),
    value: body.value.trim(), // bleibt Text (z.B. "12,98")
    unit: body.unit ?? null,
    trend: (body.trend as any) ?? null,
    color: body.color ?? null,
    sort: typeof body.sort === 'number' ? body.sort : 0,
    compare_value:
      typeof body.compare_value === 'number' && Number.isFinite(body.compare_value)
        ? body.compare_value
        : null,
    compare_label: body.compare_label?.trim() || null,
    chart_type: chartType,
    history: Array.isArray(body.history)
      ? body.history.filter((n) => typeof n === 'number' && Number.isFinite(n))
      : null,
  };

  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.kpis)
    .insert([row])
    .select('id,key,label,value,unit,trend,color,sort,compare_value,compare_label,chart_type,history,updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
