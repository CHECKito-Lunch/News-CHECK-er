// app/api/admin/vendor-groups/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { T } from '@/lib/tables';

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();

  // ?withMembers=1 / true / yes
  const withMembersRaw = req.nextUrl.searchParams.get('withMembers');
  const withMembers = ['1', 'true', 'yes', 'y'].includes(String(withMembersRaw).toLowerCase());

  const { data: groups, error } = await db
    .from(T.vendorGroups)
    .select('id,name')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!withMembers) {
    return NextResponse.json({ data: groups ?? [] });
  }

  const { data: m, error: e2 } = await db
    .from(T.vendorGroupMembers)
    .select('group_id,vendor_id');

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const byGroup = new Map<number, number[]>();
  (m ?? []).forEach((row) => {
    const arr = byGroup.get(row.group_id) ?? [];
    arr.push(row.vendor_id);
    byGroup.set(row.group_id, arr);
  });

  return NextResponse.json({
    data: (groups ?? []).map((g) => ({ ...g, members: byGroup.get(g.id) ?? [] })),
  });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const payload = (await req.json().catch(() => ({}))) as { name?: string };

  const name = String(payload.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  const { data, error } = await db
    .from(T.vendorGroups)
    .insert({ name })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id });
}
