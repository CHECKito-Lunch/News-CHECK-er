// app/api/admin/news-agent/logs/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/requireAdmin';

export async function GET(req: Request) {
  const u = await requireAdmin(req);
  if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('agent_runs')
    .select('id, ran_at, took_ms, found, inserted, dry_run, note')
    .order('ran_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const mapped = (data ?? []).map(r => ({
    id: r.id,
    ranAt: r.ran_at ? new Date(r.ran_at).toISOString() : null,
    tookMs: typeof r.took_ms === 'number' ? r.took_ms : Number(r.took_ms ?? 0),
    found: r.found ?? 0,
    inserted: r.inserted ?? 0,
    dryRun: !!r.dry_run,
    note: r.note ?? null,
  }));

  return NextResponse.json({ data: mapped });
}
