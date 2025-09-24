// app/api/admin/polls/[id]/close/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { setClosedAt } from '@/lib/server/polls';

export async function POST(req: Request, ctx: any) {
  await requireAdmin(req);

  const { id } = ctx.params as { id: string };

  const { closedAt } = await req.json().catch(() => ({} as { closedAt?: string | null }));
  const at =
    closedAt === null
      ? null
      : closedAt
      ? new Date(closedAt).toISOString()
      : new Date().toISOString();

  const data = await setClosedAt(id, at);
  return NextResponse.json({ data });
}
