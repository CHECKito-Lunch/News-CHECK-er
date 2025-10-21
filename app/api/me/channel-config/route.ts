/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/me/channel-config/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

async function getCurrentUserUUID(req: NextRequest): Promise<string | null> {
  const me = await requireUser(req).catch(() => null);
  if (!me) return null;

  const cand = (me as any)?.sub ?? (me as any)?.user?.sub ?? (me as any)?.user?.user_id;
  if (isUUID(cand)) return cand;

  const rawId = (me as any)?.user?.id ?? (me as any)?.id;
  const numericId = Number(rawId);
  if (Number.isFinite(numericId)) {
    const r = await sql<{ user_id: string | null }[]>`
      select user_id from public.app_users where id = ${numericId} limit 1
    `;
    return r[0]?.user_id ?? null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const uuid = await getCurrentUserUUID(req);
    if (!uuid) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // Wichtig: numeric als string tippen
    const rows = await sql<{ channel: string; label: string; target: string }[]>`
      select channel, label, target
      from public.user_channel_config
      where user_id = ${uuid}::uuid
      order by channel
    `;

    const map: Record<string, { label: string; target: number }> = {};
    for (const r of rows ?? []) map[r.channel] = { label: r.label, target: Number(r.target) };

    return NextResponse.json({ ok: true, config: map });
  } catch (e) {
    console.error('[me/channel-config GET]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
