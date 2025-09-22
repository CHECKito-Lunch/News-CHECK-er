// app/api/admin/groups/[id]/invite/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { json } from "@/lib/auth-server";
import { withModerator, getParamNumber } from "@/lib/with-auth";

type CountRow = { n: number };

// WICHTIG: 2. Argument als `any` typisieren, damit Nexts Checker zufrieden ist.
export async function POST(
  req: NextRequest,
  ctx: any // eslint-disable-line @typescript-eslint/no-explicit-any
) {
  // Wrapper hier anwenden, damit die exportierte Signatur exakt passt.
  return withModerator(async (req2, ctx2, me) => {
    // groupId robust entpacken (Helper akzeptiert auch Promise-params)
    const groupId = await getParamNumber(ctx2, "id");
    if (!groupId || groupId <= 0) {
      return json({ error: "Ungültige groupId" }, 400);
    }

    // Body sicher narrieren
    const body = (await req2.json().catch(() => ({}))) as {
      userIds?: unknown[];
      message?: unknown;
    };

    const message =
      typeof body?.message === "string" && body.message.trim()
        ? body.message.trim()
        : null;

    const raw = Array.isArray(body?.userIds) ? body!.userIds! : [];
    if (raw.length === 0) return json({ error: "userIds erforderlich" }, 400);

    const texts = raw.map((x) => String(x ?? "").trim()).filter(Boolean);

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const uuids = Array.from(new Set(texts.filter((t) => uuidRe.test(t))));
    const ints = Array.from(
      new Set(
        texts
          .map((t) => Number(t))
          .filter((n): n is number => Number.isFinite(n))
      )
    );

    if (uuids.length === 0 && ints.length === 0) {
      return json({ error: "Keine gültigen Nutzer" }, 400);
    }

    // Bedingten WHERE-Block bauen (als SQL-Fragment)
    const whereFragment =
      uuids.length && ints.length
        ? sql`(u.user_id::text in ${sql(uuids)} or u.id in ${sql(ints)})`
        : uuids.length
        ? sql`(u.user_id::text in ${sql(uuids)})`
        : sql`(u.id in ${sql(ints)})`;

    // Ein einziges Insert über SELECT, vermeidet N Einzel-Statements
    const rows = await sql<CountRow[]>`
      with candidates as (
        select u.user_id
        from public.app_users u
        where u.active = true
          and ${whereFragment}
      ),
      ins as (
        insert into public.group_invitations (group_id, invited_user_id, invited_by, message)
        select ${groupId}, c.user_id, ${me.sub}::uuid, ${message}
        from candidates c
        where not exists (
          select 1
          from public.group_invitations gi
          where gi.group_id = ${groupId}
            and gi.invited_user_id = c.user_id
            and gi.accepted_at is null
            and gi.declined_at is null
            and gi.revoked_at  is null
        )
        returning 1
      )
      select count(*)::int as n from ins
    `;

    const invited = rows[0]?.n ?? 0;
    return json({ ok: true, invited });
  })(req, ctx);
}

export function GET() {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}
