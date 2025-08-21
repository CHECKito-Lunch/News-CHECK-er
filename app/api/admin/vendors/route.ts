import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient'; // Server-only (Service Role)
import { T } from '@/lib/tables'; // { vendors: 'vendors', ... }

export async function GET() {
  const s = supabaseAdmin();
  const { data, error } = await s.from(T.vendors).select('id,name').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const s = supabaseAdmin();
  const body = await req.json(); // { name: string }
  if (!body?.name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const { error } = await s.from(T.vendors).insert({ name: body.name });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}