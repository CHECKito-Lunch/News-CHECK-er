// app/api/admin/stats/route.ts
import { NextResponse } from 'next/server';
import { Pool, QueryResultRow } from 'pg';

export const dynamic = 'force-dynamic';

// ---------- Pool Singleton (verhindert Verbindungsflut bei HMR) ----------
declare global {
  // eslint-disable-next-line no-var
  var __PG_POOL__: Pool | undefined;
}

function needsSSL(cs?: string) {
  if (!cs) return false;
  // Supabase Pooler nutzt sslmode=required; außerdem häufig Port 6543
  return cs.includes('sslmode=require') || cs.includes('sslmode=required') || cs.includes('supabase.com') || cs.includes(':6543/');
}

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
const pool =
  global.__PG_POOL__ ||
  new Pool({
    connectionString,
    // SSL immer aktivieren, wenn Pooler/sslmode=required erkannt
    ssl: needsSSL(connectionString) ? { rejectUnauthorized: false } : undefined,
    // optional: Timeouts gegen Hänger
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
if (!global.__PG_POOL__) global.__PG_POOL__ = pool;

// ---------- Types ----------
type AuthAgg = {
  dau_24h: number;
  mau_30d: number;
  signups_today: number;
  users_with_mfa: number;
};
type DayValue = { day: string; value: number };
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

function toDaySeries(rows: { day: string; n: number }[]): DayValue[] {
  return rows.map((r) => ({ day: String(r.day), value: Number(r.n) || 0 }));
}

// ---------- Safe Query Helper ----------
async function safeQuery<T extends QueryResultRow>(
  sql: string,
  label: string,
  defaults: T[] = [],
) {
  const client = await pool.connect();
  try {
    // kurze Statement-Timeouts setzen (nur pro Verbindung)
    await client.query(`SET LOCAL statement_timeout = '8s'`);
    return await client.query<T>(sql);
  } catch (err) {
    console.error(`[stats:${label}]`, err);
    return { rows: defaults } as { rows: T[] };
  } finally {
    client.release();
  }
}

export async function GET() {
  // 0) Ping: DB erreichbar?
  {
    const ping = await safeQuery<{ one: number }>(`SELECT 1 AS one;`, 'ping', [{ one: 0 }]);
    if (!ping.rows.length) {
      return NextResponse.json({ error: 'db_unreachable' }, { status: 500 });
    }
  }

  // 1) AUTH KPIs (optional abschaltbar, falls keine Rechte auf auth.*)
  const DISABLE_AUTH = process.env.STATS_DISABLE_AUTH === '1';

  let auth: AuthAgg = { dau_24h: 0, mau_30d: 0, signups_today: 0, users_with_mfa: 0 };
  let dauTrend: DayValue[] = [];

  if (!DISABLE_AUTH) {
    const authAggRes = await safeQuery<AuthAgg>(
      `
      WITH
      dau AS (
        SELECT COUNT(*)::int AS dau_24h
        FROM auth.identities
        WHERE last_sign_in_at >= NOW() - INTERVAL '24 hours'
      ),
      mau AS (
        SELECT COUNT(*)::int AS mau_30d
        FROM auth.identities
        WHERE last_sign_in_at >= NOW() - INTERVAL '30 days'
      ),
      signups_today AS (
        SELECT COUNT(*)::int AS signups_today
        FROM auth.identities
        WHERE created_at::date = CURRENT_DATE
      ),
      mfa_users AS (
        SELECT COUNT(DISTINCT user_id)::int AS users_with_mfa
        FROM auth.mfa_factors
        WHERE status = 'verified'
      )
      SELECT dau_24h, mau_30d, signups_today, users_with_mfa
      FROM dau, mau, signups_today, mfa_users;
      `,
      'auth_agg',
      [{ dau_24h: 0, mau_30d: 0, signups_today: 0, users_with_mfa: 0 }],
    );
    auth = authAggRes.rows[0] ?? auth;

    const logins7dRes = await safeQuery<{ day: string; n: number }>(
      `
      SELECT DATE(last_sign_in_at) AS day, COUNT(*)::int AS n
      FROM auth.identities
      WHERE last_sign_in_at >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY 1 ORDER BY 1;
      `,
      'auth_logins7d',
      [],
    );
    dauTrend = toDaySeries(logins7dRes.rows);
  }

  // 2) CONTENT / OPERATIONS KPIs
  const contentAggRes = await safeQuery<ContentAgg>(
    `
    WITH
    posts_total AS (
      SELECT COUNT(*)::int AS posts_total FROM posts
    ),
    posts_published_today AS (
      SELECT COUNT(*)::int AS posts_published_today
      FROM posts
      WHERE (status IN ('published','PUBLISHED','PUBLIC'))
        AND COALESCE(published_at, created_at)::date = CURRENT_DATE
    ),
    posts_drafts AS (
      SELECT COUNT(*)::int AS posts_drafts
      FROM posts
      WHERE status IN ('draft','DRAFT')
    ),
    polls_state AS (
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(closes_at, NOW() + INTERVAL '100 years') >= NOW())::int AS polls_open,
        COUNT(*) FILTER (WHERE COALESCE(closes_at, NOW() - INTERVAL '100 years') <  NOW())::int AS polls_closed
      FROM polls
    ),
    events_week AS (
      SELECT COUNT(*)::int AS events_this_week
      FROM events
      WHERE start_at >= date_trunc('week', NOW())
        AND start_at <  date_trunc('week', NOW()) + INTERVAL '7 days'
    ),
    registrations AS (
      SELECT COUNT(*)::int AS registrations_total FROM event_registrations
    ),
    avg_participants AS (
      SELECT NULLIF(ROUND(AVG(cnt))::int, 0) AS avg_participants_30d
      FROM (
        SELECT event_id, COUNT(*)::int AS cnt
        FROM event_registrations
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY event_id
      ) t
    ),
    termine_next AS (
      SELECT COUNT(*)::int AS termine_next_7d
      FROM termine
      WHERE start_at >= NOW() AND start_at < NOW() + INTERVAL '7 days'
    ),
    vendors_total AS (
      SELECT COUNT(*)::int AS vendors_total FROM vendors
    ),
    active_vendors AS (
      SELECT COUNT(DISTINCT vendor_id)::int AS active_vendors_30d
      FROM posts
      WHERE (status IN ('published','PUBLISHED','PUBLIC'))
        AND COALESCE(published_at, created_at) >= NOW() - INTERVAL '30 days'
    ),
    groups_total AS (
      SELECT COUNT(*)::int AS groups_total FROM groups
    ),
    groups_with_members AS (
      SELECT COUNT(*)::int AS groups_with_members
      FROM groups_with_stats
      WHERE COALESCE(member_count,0) > 0
    ),
    badges_total AS (
      SELECT COUNT(*)::int AS badges_total FROM post_badges
    ),
    categories_with_posts AS (
      SELECT COUNT(DISTINCT category_id)::int AS categories_with_posts FROM post_categories
    )
    SELECT
      pt.posts_total,
      ppt.posts_published_today,
      pd.posts_drafts,
      ps.polls_open, ps.polls_closed,
      ew.events_this_week,
      r.registrations_total,
      ap.avg_participants_30d,
      tn.termine_next_7d,
      vt.vendors_total,
      av.active_vendors_30d,
      gt.groups_total,
      gwm.groups_with_members,
      bt.badges_total,
      cwp.categories_with_posts
    FROM posts_total pt,
         posts_published_today ppt,
         posts_drafts pd,
         polls_state ps,
         events_week ew,
         registrations r,
         avg_participants ap,
         termine_next tn,
         vendors_total vt,
         active_vendors av,
         groups_total gt,
         groups_with_members gwm,
         badges_total bt,
         categories_with_posts cwp;
    `,
    'content_agg',
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
      } as ContentAgg,
    ],
  );
  const content = contentAggRes.rows[0];

  // 3) Post-Trend 7d (optional)
  const posts7dRes = await safeQuery<{ day: string; n: number }>(
    `
    SELECT DATE(COALESCE(published_at, created_at)) AS day, COUNT(*)::int AS n
    FROM posts
    WHERE COALESCE(published_at, created_at) >= CURRENT_DATE - INTERVAL '6 days'
    GROUP BY 1 ORDER BY 1;
    `,
    'posts_trend7d',
    [],
  );
  const postsTrend = toDaySeries(posts7dRes.rows);

  return NextResponse.json({ auth, content, dauTrend, postsTrend, auth_disabled: DISABLE_AUTH });
}
