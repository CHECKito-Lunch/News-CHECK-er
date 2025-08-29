// app/api/admin/travel-news/keywords/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseClient';

// RLS: nur Admins (wie bei deinen anderen Admin-Endpoints)
export async function GET() {
  const sb = supabaseServer();
  const { data, error } = await sb.from('travel_news_keywords').select('*').order('term');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { term?: string; enabled?: boolean; lang?: string };
  if (!body?.term || !body.term.trim()) {
    return NextResponse.json({ error: 'term required' }, { status: 400 });
  }
  const sb = supabaseServer();
  const { data, error } = await sb
    .from('travel_news_keywords')
    .insert({ term: body.term.trim(), enabled: body.enabled ?? true, lang: body.lang ?? 'de' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as { id: number; term?: string; enabled?: boolean; lang?: string };
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sb = supabaseServer();
  const updates: Record<string, any> = {};
  if (body.term !== undefined) updates.term = body.term.trim();
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.lang !== undefined) updates.lang = body.lang;

  const { data, error } = await sb
    .from('travel_news_keywords')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const sb = supabaseServer();
  const { error } = await sb.from('travel_news_keywords').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
