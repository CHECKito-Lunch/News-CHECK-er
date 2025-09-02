import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

// GET /api/admin/termine
export async function GET() {
  const s = supabaseAdmin();
  const { data, error } = await s
    .from(T.termine)
    .select('id,title,starts_at,ends_at,date,all_day,icon,color')
    .order('starts_at', { ascending: true, nullsFirst: true })
    .order('date', { ascending: true, nullsFirst: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r: any) => {
    const starts_at = r.starts_at ?? (r.date ? new Date(r.date as string).toISOString() : null);
    return {
      id: r.id,
      title: r.title,
      starts_at,
      ends_at: r.ends_at ?? null,
      all_day: !!r.all_day,
      icon: r.icon ?? null,
      color: r.color ?? null,
    };
  });

  return NextResponse.json({ data: rows });
}

// POST /api/admin/termine
// body: { title: string; starts_at: string (ISO); ends_at?: string|null; all_day?: boolean; icon?: string|null; color?: string|null }
export async function POST(req: Request) {
  const s = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  const title = String(body.title ?? '').trim();
  const starts_at_raw = body.starts_at ? String(body.starts_at) : '';
  const ends_at_raw = body.ends_at === null || body.ends_at === undefined ? null : String(body.ends_at);
  const all_day = !!body.all_day;
  const icon = typeof body.icon === 'string' && body.icon.trim() ? body.icon : null;
  const color = typeof body.color === 'string' && body.color.trim() ? body.color : null;

  if (!title) return NextResponse.json({ error: 'Titel ist erforderlich.' }, { status: 400 });
  if (!starts_at_raw) return NextResponse.json({ error: 'starts_at ist erforderlich.' }, { status: 400 });

  let starts_at: string;
  try { starts_at = new Date(starts_at_raw).toISOString(); }
  catch { return NextResponse.json({ error: 'starts_at ist kein gültiges Datum.' }, { status: 400 }); }

  const ends_at = ends_at_raw ? new Date(ends_at_raw).toISOString() : null;
  const date = starts_at.slice(0, 10); // für Legacy NOT NULL

  const insert: any = { title, starts_at, ends_at, date, all_day, icon, color };
  const { data, error } = await s.from(T.termine).insert(insert).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
