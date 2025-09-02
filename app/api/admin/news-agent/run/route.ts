// app/api/admin/news-agent/run/route.ts
import { NextResponse } from 'next/server';
import { runAgent } from '@/lib/newsAgent';
import { isCronAuthorized, getDryFlag } from '@/lib/server/cronSecret';

export async function POST(req: Request) {
  try {
    const dry = getDryFlag(req);

    // ✅ Secret-Bypass für Cron
    if (isCronAuthorized(req)) {
      const result = await runAgent({ dry, force: true });
      return NextResponse.json({ ok: true, ...result });
    }

    // ❌ Falls kein Secret: hier könntest du Session prüfen, wenn nötig.
    // (oder Admin-Zugriff per UI erlauben – wie vorher)
    // Sonst gleich ablehnen:
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
