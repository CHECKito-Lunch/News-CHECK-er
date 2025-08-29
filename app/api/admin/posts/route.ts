// app/api/admin/posts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { T } from '@/lib/tables';

export const dynamic = 'force-dynamic';

function sAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE env (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

type Cat = { id: number; name: string; color: string | null };
type Badge = { id: number; name: string; color: string | null; kind: string | null };

type RawPost = {
  id: number;
  title: string;
  slug: string | null;
  summary: string | null;
  content: string | null;
  status: 'draft' | 'scheduled' | 'published';
  author_id: string | null;        // uuid
  pinned_until: string | null;
  effective_from: string | null;
  vendor_id: number | null;
  updated_at: string | null;
  created_at: string | null;
  // Supabase kann hier je nach Join-Form category/badge als Objekt ODER Array liefern
  post_categories: { category: Cat | Cat[] }[] | null;
  post_badges: { badge: Badge | Badge[] }[] | null;
};

export async function GET(req: NextRequest) {
  try {
    const supabase = sAdmin();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? '20')));
    const q = (searchParams.get('q') ?? '').trim();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Wichtig: keine Kommentare in der Select-String-Liste
    let query = supabase
      .from(T.posts)
      .select(
        `
        id, title, slug, summary, content, status,
        author_id,
        pinned_until, effective_from, vendor_id,
        updated_at, created_at,
        post_categories:post_categories(category:${T.categories}(id,name,color)),
        post_badges:post_badges(badge:${T.badges}(id,name,color,kind))
        `,
        { count: 'exact' }
      )
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (q) {
      query = query.or(`title.ilike.%${q}%,slug.ilike.%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error('[posts:list] select error', error);
      return NextResponse.json({ error: error.message, where: 'posts.select' }, { status: 500 });
    }

    const posts = (data ?? []) as RawPost[];

    // unique author uuids
    const authorIds = Array.from(
      new Set(posts.map((p) => p.author_id).filter((v): v is string => !!v))
    );

    let nameByUserId = new Map<string, string>();
    if (authorIds.length) {
      const { data: users, error: uErr } = await supabase
        .from(T.appUsers) // 'app_users'
        .select('user_id,name')
        .in('user_id', authorIds);

      if (uErr) {
        console.error('[posts:list] app_users error', uErr);
      } else if (users) {
        nameByUserId = new Map(
          users.map((u: { user_id: string; name: string | null }) => [u.user_id, u.name ?? ''])
        );
      }
    }

    // Normalisierung: category/badge auf flache Arrays bringen
    const rows = posts.map((p) => {
      const categories: Cat[] = (p.post_categories ?? []).flatMap((pc) =>
        Array.isArray(pc.category) ? pc.category : [pc.category]
      );

      const badges: Badge[] = (p.post_badges ?? []).flatMap((pb) =>
        Array.isArray(pb.badge) ? pb.badge : [pb.badge]
      );

      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        summary: p.summary,
        content: p.content,
        status: p.status,
        pinned_until: p.pinned_until,
        effective_from: p.effective_from,
        vendor_id: p.vendor_id,
        updated_at: p.updated_at,
        created_at: p.created_at,
        author_name: p.author_id ? nameByUserId.get(p.author_id) ?? null : null,
        categories,
        badges,
      };
    });

    return NextResponse.json({ data: rows, total: count ?? 0 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[posts:list] fatal', msg);
    return NextResponse.json(
      { error: msg ?? 'unknown', where: 'fatal-catch' },
      { status: 500 }
    );
  }
}
