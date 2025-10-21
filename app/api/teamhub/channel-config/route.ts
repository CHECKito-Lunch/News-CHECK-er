/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/teamhub/channel-config/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { requireUser } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

const isUUID = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const toTwo = (n: number) => Math.round(n * 100) / 100;
const notBlank = (s: string) => s.trim().length > 0;

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

/** Admin-Check: passt auf dein Schema (app_users.role); „safe“ mit Fallback */
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const rows = await sql<{ is_admin: boolean }[]>`
      select exists (
        select 1
        from public.app_users
        where user_id = ${userId}::uuid
          and role in ('admin','teamleiter')
      ) as is_admin
    `;
    return rows[0]?.is_admin === true;
  } catch (e: any) {
    console.warn('[isAdmin] fallback=false', { code: e?.code, msg: e?.message });
    return false;
  }
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

    // ACL: Owner selbst ODER Admin
    if (ownerId !== meUUID && !(await isAdmin(meUUID))) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    // numeric als string tippen
    const rows = await sql<{ channel: string; label: string; target: string }[]>`
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

    const body = (await req.json().catch(() => null)) as {
      owner_id?: string;
      upserts?: Array<{ channel: string; label?: string; target?: number }>;
    };

    if (!isUUID(body?.owner_id) || !Array.isArray(body?.upserts)) {
      return NextResponse.json({ ok: false, error: 'owner_id (uuid) and upserts[] required' }, { status: 400 });
    }

    // ACL: Owner selbst ODER Admin darf für andere schreiben
    const admin = await isAdmin(meUUID);
    if (body.owner_id !== meUUID && !admin) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    // Normalisieren + clampen + runden + strenger Filter
    const prepared = (body.upserts ?? [])
      .map((u) => {
        const channel = String(u.channel ?? '').trim().toLowerCase(); // Key normalisieren
        const label = String((u.label ?? u.channel ?? '').toString()).trim();
        const rawTarget = Number.isFinite(Number(u.target)) ? Number(u.target) : 4.5;
        const target = toTwo(clamp(rawTarget, 1, 5));
        return {
          user_id: body.owner_id!, // FK -> app_users.user_id
          channel,
          label,
          target,
          updated_by: meUUID, // FK -> app_users.user_id
        };
      })
      .filter((r) => notBlank(r.channel) && notBlank(r.label));

    if (prepared.length === 0) {
      return NextResponse.json({ ok: false, error: 'upserts[] empty after normalization' }, { status: 400 });
    }

    // Arrays für UNNEST bauen
    const user_ids   = prepared.map(r => r.user_id);
    const channels   = prepared.map(r => r.channel);
    const labels     = prepared.map(r => r.label);
    const targets    = prepared.map(r => r.target);
    const updatedbys = prepared.map(r => r.updated_by);

    // Längenkonsistenz (defensiv)
    const n = prepared.length;
    if (![user_ids, channels, labels, targets, updatedbys].every(a => a.length === n)) {
      return NextResponse.json({ ok: false, error: 'payload length mismatch' }, { status: 400 });
    }

    // UNNEST-Insert (robust, keine jsonb_to_recordset/VALUES-Interpolation)
    await sql`
      with data as (
        select
          unnest(${user_ids}::uuid[])   as user_id,
          unnest(${channels}::text[])   as channel,
          unnest(${labels}::text[])     as label,
          unnest(${targets}::numeric[]) as target,
          unnest(${updatedbys}::uuid[]) as updated_by
      )
      insert into public.user_channel_config (user_id, channel, label, target, updated_by)
      select user_id, channel, label, target, updated_by
      from data
      on conflict (user_id, channel) do update
      set label = excluded.label,
          target = excluded.target,
          updated_by = excluded.updated_by
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const code = e?.code as string | undefined;
    if (code === '23503') {
      return NextResponse.json({ ok: false, error: 'foreign key violation (owner_id/updated_by not found)' }, { status: 400 });
    }
    if (code === '22P02') {
      return NextResponse.json({ ok: false, error: 'invalid input syntax' }, { status: 400 });
    }
    console.error('[teamhub/channel-config POST]', {
      code: e?.code,
      detail: e?.detail,
      hint: e?.hint,
      message: e?.message,
    });
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
