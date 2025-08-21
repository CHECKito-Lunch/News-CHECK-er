// app/api/news/[slug]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Serverseitiger Client (Service Role Key nur im Server verwenden)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Vendor   = { id: number; name: string };
type Category = { id: number; name: string; color: string | null };
type Badge    = { id: number; name: string; color: string | null; kind: string | null };

// Rohantwort-Form (Supabase kann verschachtelte Arrays liefern)
type RawPost = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  content: string | null;
  priority: number | null;
  pinned_until: string | null;
  effective_from: string | null;
  vendor?: Vendor | Vendor[] | null;
  post_categories?: Array<{ category: Category | Category[] | null }> | null;
  post_badges?: Array<{ badge: Badge | Badge[] | null }> | null;
};

// Hilfsfunktionen zum Normalisieren
function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
function arr<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

// Next 15: params kann async sein → Promise im Typ + await
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;

  const { data, error } = await supabase
    .from('posts')
    .select(`
      id, slug, title, summary, content, priority, pinned_until, effective_from,
      vendor:vendors(id,name),
      post_categories:post_categories(category:categories(id,name,color)),
      post_badges:post_badges(badge:badges(id,name,color,kind))
    `)
    .eq('slug', slug)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const raw = data as unknown as RawPost;

  const vendor = firstOrNull<Vendor>(raw.vendor);

  const post_categories = arr(raw.post_categories).map((pc) => {
    const category = firstOrNull<Category>(pc.category);
    return category ? { category } : null;
  }).filter((x): x is { category: Category } => x !== null);

  const post_badges = arr(raw.post_badges).map((pb) => {
    const badge = firstOrNull<Badge>(pb.badge);
    return badge ? { badge } : null;
  }).filter((x): x is { badge: Badge } => x !== null);

  const payload = {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    summary: raw.summary,
    content: raw.content,
    priority: raw.priority,
    pinned_until: raw.pinned_until,
    effective_from: raw.effective_from,
    vendor,
    post_categories,
    post_badges,
  };

  return NextResponse.json({ data: payload });
}
