// app/api/admin/news-agent/logs/route.ts
import { requireAdmin } from '@/lib/requireAdmin';
import { getLogs } from '@/lib/newsAgent';

export async function GET(req: Request) {
  const u = await requireAdmin(req);
  if (!u) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

  const logs = await getLogs(50);
  return Response.json({ data: logs });
}
