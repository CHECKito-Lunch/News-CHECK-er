// app/api/admin/polls/[id]/votes/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { listVotes } from '@/lib/server/polls';

export async function GET(req: Request, ctx: any) {
  await requireAdmin(req);

  const { id } = ctx.params as { id: string };

  const { searchParams } = new URL(req.url);
  const limit  = Math.max(1, Math.min(500, Number(searchParams.get('limit')  ?? 100)));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

  const data = await listVotes(id, limit, offset);
  return NextResponse.json({ data, limit, offset });
}
