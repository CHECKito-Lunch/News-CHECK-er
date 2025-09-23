// app/api/news/[slug]/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// params kann Promise oder Objekt sein
function prettyParams(p: unknown): Promise<{ slug: string }> {
  const maybe = p as any;
  return maybe && typeof maybe.then === 'function' ? maybe : Promise.resolve(maybe);
}

type ImageRow = { path?: string | null; title?: string | null; sort_order?: number | null };

export async function GET(req: NextRequest, ctx: any) {
  const { slug } = await prettyParams((ctx as any)?.params);

  const s = await supabaseServer();
  const nowIso = new Date().toISOString();
  const isPreview = req.nextUrl.searchParams.get('preview') === '1';

  // Basis-Query: Bilder nur als Pfad/Metadaten (DB: post_images)
  let query = s
    .from('posts')
    .select(
      `
      id, slug, title, summary, content, created_at, effective_from, pinned_until, author_id,
      vendor:vendor_id ( id, name ),
      post_categories ( category:category_id ( id, name, color ) ),
      post_badges     ( badge:badge_id ( id, name, color, kind ) ),
      sources:post_sources ( url, label, sort_order ),
      images:post_images ( path, title, sort_order )
    `
    )
    .eq('slug', slug)
    // Status: live => published+scheduled, Preview => alles
    .in('status', isPreview ? ['draft', 'published', 'scheduled'] : ['published', 'scheduled']);

  // Zeitfenster live: effective_from <= now() ODER NULL (sofort sichtbar)
  if (!isPreview) {
    query = query.or(`effective_from.lte.${nowIso},effective_from.is.null`);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    console.error('[/api/news/[slug]] not found', { slug, error: error?.message, isPreview, nowIso });
    return NextResponse.json(
      { data: null, error: error?.message ?? 'not_found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Autorname optional nachladen
  let author_name: string | null = null;
  if ((data as any).author_id) {
    const { data: u } = await s
      .from('app_users')
      .select('name')
      .eq('user_id', (data as any).author_id)
      .maybeSingle();
    author_name = u?.name ?? null;
  }

  // Bild-URLs aus Storage-Pfaden + Sortierung
  const imgs: ImageRow[] = Array.isArray((data as any).images) ? (data as any).images : [];
  const storage = s.storage.from('uploads'); // Bucket-Name ggf. anpassen
  const images = imgs
    .map((im) => {
      const url = im?.path ? storage.getPublicUrl(im.path).data.publicUrl : null;
      return url
        ? {
            url,
            caption: im?.title ?? null,
            sort_order: Number.isFinite(Number(im?.sort_order)) ? Number(im!.sort_order) : null,
          }
        : null;
    })
    .filter(
      (x): x is { url: string; caption: string | null; sort_order: number | null } => x !== null
    )
    .sort((a, b) => {
      const A = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const B = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      return A - B;
    });

  const payload = { ...data, author_name, images };

  return NextResponse.json({ data: payload }, { headers: { 'Cache-Control': 'no-store' } });
}
