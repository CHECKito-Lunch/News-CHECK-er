import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
// Optional: Zugriffsschutz
// import { getUserFromRequest } from '@/lib/auth';

type Params = { params: { id: string } };

// -------- GET /api/admin/posts/:id ------------------------------------------
export async function GET(_req: Request, { params }: Params) {
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Falls du keine View hast: nimm 'posts' und joine einzeln
  const { data, error } = await supabaseAdmin
    .from('posts_view')
    .select(`
      id, title, slug, summary, content, status,
      pinned_until, effective_from, vendor_id,
      created_at, updated_at, author_name,
      categories:post_categories ( category:categories ( id, name, color ) ),
      badges:post_badges ( badge:badges ( id, name, color, kind ) ),
      sources:post_sources ( url, label, sort_order )
    `)
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const categories = (data?.categories ?? []).map((c: any) => c.category);
  const badges = (data?.badges ?? []).map((b: any) => b.badge);

  return NextResponse.json({ data: { ...data, categories, badges } });
}

// -------- PATCH /api/admin/posts/:id ----------------------------------------
export async function PATCH(req: Request, { params }: Params) {
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Optional: Zugriffsschutz
  // const user = await getUserFromRequest(req);
  // if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.post) return NextResponse.json({ error: 'Missing payload' }, { status: 400 });

  // 1) Post-Felder
  const { error: upErr } = await supabaseAdmin.from('posts').update(body.post).eq('id', id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // 2) Relationen (optional – nur wenn du sie mitschickst)
  // Kategorien
  if (Array.isArray(body.categoryIds)) {
    // Clear + Insert minimal (ersetzt sauber; nutze upserts wenn vorhanden)
    await supabaseAdmin.from('post_categories').delete().eq('post_id', id);
    if (body.categoryIds.length) {
      const rows = body.categoryIds.map((cid: number) => ({ post_id: id, category_id: cid }));
      await supabaseAdmin.from('post_categories').insert(rows);
    }
  }

  // Badges
  if (Array.isArray(body.badgeIds)) {
    await supabaseAdmin.from('post_badges').delete().eq('post_id', id);
    if (body.badgeIds.length) {
      const rows = body.badgeIds.map((bid: number) => ({ post_id: id, badge_id: bid }));
      await supabaseAdmin.from('post_badges').insert(rows);
    }
  }

  // Quellen
  if (Array.isArray(body.sources)) {
    await supabaseAdmin.from('post_sources').delete().eq('post_id', id);
    if (body.sources.length) {
      const rows = body.sources.map((s: any) => ({ post_id: id, ...s }));
      await supabaseAdmin.from('post_sources').insert(rows);
    }
  }

  return NextResponse.json({ ok: true, id });
}

// -------- DELETE /api/admin/posts/:id ---------------------------------------
export async function DELETE(_req: Request, { params }: Params) {
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Optional: Zugriffsschutz
  // const user = await getUserFromRequest(req);
  // if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Reihenfolge: erst Relationen, dann Haupttabelle (falls keine FK ON DELETE CASCADE)
  await supabaseAdmin.from('post_sources').delete().eq('post_id', id);
  await supabaseAdmin.from('post_badges').delete().eq('post_id', id);
  await supabaseAdmin.from('post_categories').delete().eq('post_id', id);

  const { error } = await supabaseAdmin.from('posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

// (Optional) wenn du konsequent dynamic willst:
// export const dynamic = 'force-dynamic';
