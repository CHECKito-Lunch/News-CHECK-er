// app/api/travel-news/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseClient';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(50, Number(url.searchParams.get('limit') ?? 20));
  const sb = supabaseServer();
  const { data, error } = await sb
    .from('travel_news')
    .select('id, headline, summary, impact, source_url, published_at, created_at')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}
