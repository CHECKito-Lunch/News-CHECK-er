// app/api/admin/stats/route.ts
import { NextResponse } from 'next/server';
import { Pool, QueryResultRow } from 'pg';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------- Pool Singleton ----------
declare global {
  // eslint-disable-next-line no-var
  var __PG_POOL__: Pool | undefined;
}
const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;

const pool =
  global.__PG_POOL__ ||
  new Pool({
    connectionString,
    // Supabase Pooler/sslmode=required → SSL erzwingen
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (!global.__PG_POOL__) global.__PG_POOL__ = pool;

// ---------- Helper ----------
async function q<T extends QueryResultRow>(sql: string, label: string, defaults: T[]) {
  const client = await pool.connect();
  try {
    await client.query(`SET LOCAL statement_timeout = '8s'`);
    return await client.query<T>(sql);
  } catch (err) {
    console.error(`[stats:${label}]`, err);
    return { rows: defaults } as { rows: T[] };
  } finally {
    client.release();
  }
}

type ContentAgg = {
  posts_total: number;
  posts_published_today: number;
  posts_drafts: number;
  polls_open: number;
  polls_closed: number;
  events_this_week: number;
  registrations_total: number;
  avg_participants_30d: number | null;
  termine_next_7d: number;
  vendors_total: number;
  active_vendors_30d: number;
  groups_total: number;
  groups_with_members: number;
  badges_total: number;
  categories_with_posts: number;
};

export async function GET() {
  try {
    // 0) Ping
    const ping = await q<{ one: number }>(`SELECT 1 AS one;`, 'ping', [{ one: 0 }]);
    if (!ping.rows.length) {
      return NextResponse.json({ error: 'db_unreachable' }, { status: 500 });
    }

    // 1) Nur Content-KPIs; alles crash-sicher via to_regclass()
    //    Falls es eine Tabelle (noch) nicht gibt, liefert CASE 0 zurück statt zu crashen.
    const content = await q<ContentAgg>(
      `
      SELECT
        -- posts
        CASE WHEN to_regclass('public.posts') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM posts) END                                     AS posts_total,
        CASE WHEN to_regclass('public.posts') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM posts
                   WHERE (status IN ('published','PUBLISHED','PUBLIC'))
                     AND COALESCE(published_at, created_at)::date = CURRENT_DATE) END       AS posts_published_today,
        CASE WHEN to_regclass('public.posts') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM posts WHERE status IN ('draft','DRAFT')) END    AS posts_drafts,

        -- polls
        CASE WHEN to_regclass('public.polls') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM polls
                   WHERE COALESCE(closes_at, NOW() + INTERVAL '100 years') >= NOW()) END     AS polls_open,
        CASE WHEN to_regclass('public.polls') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM polls
                   WHERE COALESCE(closes_at, NOW() - INTERVAL '100 years') < NOW()) END      AS polls_closed,

        -- events (diese Woche)
        CASE WHEN to_regclass('public.events') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM events
                   WHERE start_at >= date_trunc('week', NOW())
                     AND start_at <  date_trunc('week', NOW()) + INTERVAL '7 days') END      AS events_this_week,

        -- registrations
        CASE WHEN to_regclass('public.event_registrations') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM event_registrations) END                        AS registrations_total,

        -- avg participants (30d)
        CASE WHEN to_regclass('public.event_registrations') IS NULL THEN NULL
             ELSE (SELECT NULLIF(ROUND(AVG(cnt))::int, 0) FROM (
                     SELECT event_id, COUNT(*)::int AS cnt
                     FROM event_registrations
                     WHERE created_at >= NOW() - INTERVAL '30 days'
                     GROUP BY event_id
                  ) t) END                                                                    AS avg_participants_30d,

        -- termine (nächste 7 Tage)
        CASE WHEN to_regclass('public.termine') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM termine
                   WHERE start_at >= NOW() AND start_at < NOW() + INTERVAL '7 days') END     AS termine_next_7d,

        -- vendors
        CASE WHEN to_regclass('public.vendors') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM vendors) END                                     AS vendors_total,

        -- aktive vendors 30d (per posts)
        CASE WHEN to_regclass('public.posts') IS NULL THEN 0
             ELSE (SELECT COUNT(DISTINCT vendor_id)::int
                   FROM posts
                   WHERE (status IN ('published','PUBLISHED','PUBLIC'))
                     AND COALESCE(published_at, created_at) >= NOW() - INTERVAL '30 days') END AS active_vendors_30d,

        -- groups
        CASE WHEN to_regclass('public.groups') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM groups) END                                      AS groups_total,
        CASE WHEN to_regclass('public.groups_with_stats') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM groups_with_stats WHERE COALESCE(member_count,0) > 0) END AS groups_with_members,

        -- badges / categories
        CASE WHEN to_regclass('public.post_badges') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM post_badges) END                                 AS badges_total,
        CASE WHEN to_regclass('public.post_categories') IS NULL THEN 0
             ELSE (SELECT COUNT(DISTINCT category_id)::int FROM post_categories) END          AS categories_with_posts
      ;
      `,
      'content_agg_min',
      [
        {
          posts_total: 0,
          posts_published_today: 0,
          posts_drafts: 0,
          polls_open: 0,
          polls_closed: 0,
          events_this_week: 0,
          registrations_total: 0,
          avg_participants_30d: null,
          termine_next_7d: 0,
          vendors_total: 0,
          active_vendors_30d: 0,
          groups_total: 0,
          groups_with_members: 0,
          badges_total: 0,
          categories_with_posts: 0,
        },
      ],
    );

    // 2) (Optional) einfache Posts-Trend 7d – ebenfalls crash-sicher
    const postsTrendRes = await q<{ day: string; n: number }>(
      `
      SELECT
        day::date AS day,
        CASE WHEN to_regclass('public.posts') IS NULL THEN 0
             ELSE (SELECT COUNT(*)::int FROM posts
                   WHERE DATE(COALESCE(published_at, created_at)) = day::date)
        END AS n
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS day;
      `,
      'posts_trend7d_min',
      [],
    );

    return NextResponse.json({
      // auth block bewusst ausgelassen, bis Rechte geklärt sind
      content: content.rows[0],
      postsTrend: postsTrendRes.rows.map((r) => ({ day: String(r.day), value: Number(r.n) || 0 })),
      auth_disabled: true,
    });
  } catch (err) {
    console.error('[stats:fatal]', err);
    return NextResponse.json({ error: 'stats_query_failed' }, { status: 500 });
  }
}
