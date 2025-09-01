// app/api/cron/news-agent/route.ts
import { runAgent } from '@/lib/newsAgent';

export const dynamic = 'force-dynamic';

// Kein Admin-Check hier (kommt von Cron). Optional: simple token prüfen.
export async function GET() {
  try {
    const res = await runAgent({ force: false, dry: false });
    return Response.json({ ok: true, ...res });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e?.message || 'failed' }), { status: 500 });
  }
}
