// app/api/news/[slug]/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Next 14/15: params kann Objekt ODER Promise sein
function prettyParams(p: unknown): Promise<{ slug: string }> {
  const maybe = p as any;
  return maybe && typeof maybe.then === "function" ? maybe : Promise.resolve(maybe);
}

type ImageRow = {
  path?: string | null; // wir selektieren nur path (robust)
};

export async function GET(req: NextRequest, ctx: any) {
  const { slug } = await prettyParams((ctx as any)?.params);

  const s = await supabaseServer();
  const nowIso = new Date().toISOString();
  const isPreview = req.nextUrl.searchParams.get("preview") === "1";

  // --- Hauptquery: images NUR mit path (kein caption/sort_order/url -> schema-agnostisch)
  let query = s
    .from("posts")
    .select(`
      id, slug, title, summary, content, created_at, effective_from, pinned_until, author_id,
      vendor:vendor_id ( id, name ),
      post_categories ( category:category_id ( id, name, color ) ),
      post_badges     ( badge:badge_id ( id, name, color, kind ) ),
      sources:post_sources ( url, label, sort_order ),
      images:post_images ( path )
    `)
    .eq("slug", slug)
    .eq("status", "published");

  if (!isPreview) {
    query = query.lte("effective_from", nowIso);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    console.error("[/api/news/[slug]] not found", { slug, err: error?.message, isPreview, nowIso });
    return NextResponse.json(
      { data: null, error: error?.message ?? "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Autorennamen optional nachladen
  let author_name: string | null = null;
  if (data.author_id) {
    const { data: u } = await s.from("app_users").select("name").eq("user_id", data.author_id).maybeSingle();
    author_name = u?.name ?? null;
  }

  // Bild-URLs aus Storage-Pfaden ableiten
  const imgs: ImageRow[] = Array.isArray((data as any).images) ? ((data as any).images as ImageRow[]) : [];
  const storage = s.storage.from("uploads"); // ggf. Bucket-Name anpassen

  const images = imgs
    .map((im) => {
      const url = im?.path ? storage.getPublicUrl(im.path).data.publicUrl : null;
      return url ? { url, caption: null as string | null, sort_order: null as number | null } : null;
    })
    .filter((x): x is { url: string; caption: string | null; sort_order: number | null } => x !== null);

  const payload = { ...data, author_name, images };

  return NextResponse.json(
    { data: payload },
    { headers: { "Cache-Control": "no-store" } }
  );
}
