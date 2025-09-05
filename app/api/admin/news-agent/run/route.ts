// app/api/admin/news-agent/run/route.ts
import { NextResponse } from 'next/server';
import { runAgent } from '@/lib/newsAgent';
import { isCronAuthorized, getDryFlag } from '@/lib/server/cronSecret';
import { requireAdmin } from '@/lib/requireAdmin';

export async function POST(req: Request) {
  try {
    const dry = getDryFlag(req);

    // 1) Cron/Server darf alles (dry oder live)
    if (isCronAuthorized(req)) {
      const result = await runAgent({ dry, force: true });
      return NextResponse.json({ ok: true, ...result });
    }

    // 2) Admin/Moderator in der UI: nur DRY-RUN erlauben
    const u = await requireAdmin(req);
    if (u && dry) {
      const result = await runAgent({ dry: true, force: true });
      return NextResponse.json({ ok: true, ...result });
    }

    // sonst blocken
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
