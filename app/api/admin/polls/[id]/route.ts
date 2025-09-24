// app/api/admin/polls/[id]/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getPoll, patchPoll, deletePoll } from '@/lib/server/polls';

export async function GET(req: Request, ctx: any) {
  await requireAdmin(req);
  const { id } = ctx.params as { id: string };

  const data = await getPoll(id);
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, ctx: any) {
  await requireAdmin(req);
  const { id } = ctx.params as { id: string };

  const patch = await req.json();
  const data = await patchPoll(id, patch);
  return NextResponse.json({ data });
}

export async function DELETE(req: Request, ctx: any) {
  await requireAdmin(req);
  const { id } = ctx.params as { id: string };

  await deletePoll(id);
  return NextResponse.json({ ok: true });
}
