import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

export async function GET() {
  const s = supabaseAdmin();
  const { data, error } = await s.from(T.badges).select('id,name,color,kind').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const s = supabaseAdmin();
  const body = await req.json(); // { name, color?, kind? }
  const { error } = await s.from(T.badges).insert({
    name: body.name,
    color: body.color ?? null,
    kind: body.kind ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
