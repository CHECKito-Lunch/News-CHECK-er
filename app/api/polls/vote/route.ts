import { NextRequest, NextResponse } from 'next/server';
import {
  voterHashFromRequest,
  upsertMeta,
  voteSingle,
  voteMulti,
  getCounts,
  getSupabaseServer,
} from '@/lib/server/polls';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { pollId, optionIndex, optionIndices, postId, postSlug, question, options } = body;

  if (!pollId) return NextResponse.json({ error: 'pollId missing' }, { status: 400 });

  await upsertMeta(pollId, question, options);

  const sb = await getSupabaseServer();
  const { data: meta } = await sb.from('polls').select('multi_choice').eq('id', pollId).maybeSingle();
  const multi = !!meta?.multi_choice;

  const voterHash = await voterHashFromRequest(req, pollId);

  try {
    if (multi) {
      if (!Array.isArray(optionIndices)) {
        return NextResponse.json({ error: 'optionIndices[] required' }, { status: 400 });
      }
      await voteMulti({ pollId, optionIndices, voterHash, postId, postSlug });
    } else {
      if (typeof optionIndex !== 'number') {
        return NextResponse.json({ error: 'optionIndex required' }, { status: 400 });
      }
      await voteSingle({ pollId, optionIndex, voterHash, postId, postSlug });
    }

    const counts = await getCounts(pollId);
    return NextResponse.json({ ok: true, counts });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'vote failed' }, { status: 400 });
  }
}