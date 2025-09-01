// app/api/admin/news-agent/run/route.ts
import { requireAdmin } from '@/lib/requireAdmin';
import { runAgent } from '@/lib/newsAgent';

export async function POST(req: Request) {
  const u = await requireAdmin(req);
  if (!u) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const dry = searchParams.get('dry') === '1';
    const out = await runAgent({ force: true, dry });
    return Response.json(out);
  } catch (e:any) {
    return new Response(JSON.stringify({
      error: e?.message || 'run failed',
      hint: 'Prüfe OPENAI_API_KEY / NEWS_API_KEY und Netzwerkkonnektivität.',
    }), { status: 500 });
  }
}
