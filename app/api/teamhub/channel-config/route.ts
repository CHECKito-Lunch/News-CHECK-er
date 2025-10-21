/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/teamhub/channel-config/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

/**
 * Optional: falls du eine Berechtigungsprüfung brauchst, dass der aktuelle User
 * für owner_id schreiben/lesen darf, ist hier der Hook.
 * Aktuell: nur "eingeloggt sein" wird verlangt (Parität zur me/feedback-Route).
 */
async function getCurrentUserUUID(req: NextRequest): Promise<string | null> {
  const me = await requireUser(req).catch(() => null);
  if (!me) return null;

  // UUID aus Token ziehen (wie in deiner me/feedback-Route)
  const cand = (me as any)?.sub ?? (me as any)?.user?.sub ?? (me as any)?.user?.user_id;
  if (isUUID(cand)) return cand;

  // Fallback: numerische user-id -> uuid aus app_users mappen
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
    const meUUID = await getCurrentUserUUID(req);
    if (!meUUID) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get('owner_id');
    if (!isUUID(ownerId)) {
      return NextResponse.json({ ok: false, error: 'owner_id required (uuid)' }, { status: 400 });
    }

    const rows = await sql<{ channel: string; label: string; target: number }[]>`
      select channel, label, target
      from public.user_channel_config
      where user_id = ${ownerId}::uuid
      order by channel
    `;

    const map: Record<string, { label: string; target: number }> = {};
    for (const r of rows ?? []) map[r.channel] = { label: r.label, target: Number(r.target) };

    return NextResponse.json({ ok: true, config: map });
  } catch (e) {
    console.error('[teamhub/channel-config GET]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const meUUID = await getCurrentUserUUID(req);
    if (!meUUID) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null) as {
      owner_id?: string;
      upserts?: Array<{ channel: string; label?: string; target?: number }>;
    };

    if (!isUUID(body?.owner_id) || !Array.isArray(body?.upserts)) {
      return NextResponse.json({ ok: false, error: 'owner_id (uuid) and upserts[] required' }, { status: 400 });
    }

    // Normalisieren + clampen
    const prepared = (body.upserts ?? []).map((u) => ({
      user_id: body.owner_id!,
      channel: String(u.channel || '').trim(),
      label: String((u.label ?? u.channel ?? '').toString()).trim(),
      target: clamp(Number.isFinite(Number(u.target)) ? Number(u.target) : 4.5, 1, 5),
      updated_by: meUUID,
    })).filter(r => r.channel && r.label);

    if (prepared.length === 0) {
      return NextResponse.json({ ok: false, error: 'upserts[] empty after normalization' }, { status: 400 });
    }

    // Batch-Upsert in einem Statement
    await sql`
      insert into public.user_channel_config (user_id, channel, label, target, updated_by)
      select * from jsonb_to_recordset(${JSON.stringify(prepared)}::jsonb)
        as x(user_id uuid, channel text, label text, target numeric, updated_by uuid)
      on conflict (user_id, channel) do update
      set label = excluded.label,
          target = excluded.target,
          updated_by = excluded.updated_by
    `;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[teamhub/channel-config POST]', e);
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
