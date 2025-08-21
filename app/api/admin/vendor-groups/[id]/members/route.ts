import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { T } from '@/lib/tables';

function getGroupId(ctx: any): number | null {
  const id = Number(ctx?.params?.id);
  return Number.isFinite(id) ? id : null;
}

export async function POST(req: Request, ctx: any) {
  const groupId = getGroupId(ctx);
  if (groupId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const vendor_id = Number((body as any)?.vendor_id);
  if (!Number.isFinite(vendor_id)) {
    return NextResponse.json({ error: 'vendor_id must be a number' }, { status: 400 });
  }

  const s = supabaseAdmin();
  const { error } = await s
    .from(T.vendorGroupMembers)
    .insert({ group_id: groupId, vendor_id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: any) {
  const groupId = getGroupId(ctx);
  if (groupId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const vendor_id = Number((body as any)?.vendor_id);
  if (!Number.isFinite(vendor_id)) {
    return NextResponse.json({ error: 'vendor_id must be a number' }, { status: 400 });
  }

  const s = supabaseAdmin();
  const { error } = await s
    .from(T.vendorGroupMembers)
    .delete()
    .eq('group_id', groupId)
    .eq('vendor_id', vendor_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}