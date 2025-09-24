// app/api/admin/polls/route.ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { listPolls, upsertPoll, type PollRow } from '@/lib/server/polls';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Alle Polls auflisten */
export async function GET(req: Request) {
  await requireAdmin(req);
  const data = await listPolls();
  return NextResponse.json({ data });
}

/** Poll anlegen/überschreiben (Upsert) */
export async function POST(req: Request) {
  await requireAdmin(req);

  const body = (await req.json().catch(() => ({}))) as Partial<PollRow>;

  // Validierung + Defaults (nur Felder aus PollRow!)
  const options =
    Array.isArray(body.options)
      ? body.options.map(s => String(s)).filter(s => s.trim() !== '')
      : [];

  const poll: PollRow = {
    id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : nanoid(12),
    question: String(body.question ?? 'Deine Frage?'),
    options: options.length > 0 ? options : ['Option A', 'Option B'],
    multi_choice: !!body.multi_choice,
    max_choices:
      Number.isFinite(body.max_choices as number) && (body.max_choices as number) > 0
        ? Number(body.max_choices)
        : 1,
    allow_change: body.allow_change !== false, // Default: true
    closed_at: body.closed_at ? new Date(body.closed_at as any).toISOString() : null,
  };

  // Safety: Single-Choice erzwingt max_choices = 1
  if (!poll.multi_choice) poll.max_choices = 1;

  const data = await upsertPoll(poll);
  return NextResponse.json({ data }, { status: 201 });
}
