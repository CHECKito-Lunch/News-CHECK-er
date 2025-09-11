// /app/api/news/slug/[slug]/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// Next 14 & 15: params kann Objekt ODER Promise sein – wir unterstützen beides
type Ctx =
  | { params: { slug: string } }
  | { params: Promise<{ slug: string }> };

function prettyParams(p: any): Promise<{ slug: string }> {
  return (p && typeof p.then === 'function') ? p : Promise.resolve(p);
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { slug } = await prettyParams((ctx as any).params);

  const s = await supabaseServer();
  const nowIso = new Date().toISOString();

  // Alles was die Detailseite braucht: Vendor, Kategorien, Badges, Quellen, Bilder
  const { data, error } = await s
    .from('posts')
    .select(`
      id, slug, title, summary, content, created_at, effective_from, pinned_until, author_id,
      vendor:vendor_id ( id, name ),
      post_categories ( category:category_id ( id, name, color ) ),
      post_badges     ( badge:badge_id ( id, name, color, kind ) ),
      sources:post_sources ( url, label, sort_order ),
      images:post_images ( url, path, caption, sort_order )
    `)
    .eq('slug', slug)
    .eq('status', 'published')
    .lte('effective_from', nowIso)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { data: null, error: error?.message ?? 'not_found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Autorennamen auflösen (optional)
  let author_name: string | null = null;
  if (data.author_id) {
    const { data: u } = await s
      .from('app_users')
      .select('name')
      .eq('user_id', data.author_id)
      .maybeSingle();
    author_name = u?.name ?? null;
  }

  // Bild-URLs normalisieren: falls nur "path" in post_images steht -> public URL aus Storage bauen
  const imgs = Array.isArray((data as any).images) ? (data as any).images : [];
  const storage = s.storage.from('uploads');
  const images = imgs
    .map((im: any) => {
      const url =
        im?.url ||
        (im?.path ? storage.getPublicUrl(im.path).data.publicUrl : null);
      return url
        ? { url, caption: im?.caption ?? null, sort_order: im?.sort_order ?? null }
        : null;
    })
    .filter(Boolean);

  const payload = {
    ...data,
    author_name,
    images,
  };

  return NextResponse.json(payload ? { data: payload } : { data: null }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
