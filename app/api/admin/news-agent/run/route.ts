import { NextResponse } from 'next/server';
import { runAgent } from '@/lib/newsAgent';
import { isCronAuthorized, getDryFlag } from '@/lib/server/cronSecret';
import { requireAdmin } from '@/lib/requireAdmin';

export async function POST(req: Request) {
  try {
    const dry = getDryFlag(req);

    if (isCronAuthorized(req)) {
      const result = await runAgent({ dry, force: true });
      return NextResponse.json({ ok: true, ...result });
    }

    const u = await requireAdmin(req);
    if (u && dry) {
      const result = await runAgent({ dry: true, force: true });
      return NextResponse.json({ ok: true, ...result });
    }

    // Mini-Diagnose (hilft dir im Log/Response):
    const haveServerSecret =
      !!process.env.NEWS_AGENT_CRON_SECRET?.trim() || !!process.env.CRON_SECRET?.trim();

    return NextResponse.json(
      { error: 'Unauthorized', hint: haveServerSecret ? 'bad header/bearer/key' : 'missing server secret' },
      { status: 401 }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}