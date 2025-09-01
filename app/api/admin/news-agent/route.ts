// app/api/admin/news-agent/route.ts
import { requireAdmin } from '@/lib/requireAdmin';
import { getConfig, setConfig, AgentConfig } from '@/lib/newsAgent';

export async function GET(req: Request) {
  const u = await requireAdmin(req);
  if (!u) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  const cfg = await getConfig();
  return Response.json({ data: cfg });
}

export async function PUT(req: Request) {
  const u = await requireAdmin(req);
  if (!u) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

  const body = await req.json().catch(()=>null) as AgentConfig|null;
  if (!body) return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 });

  // sanitisieren
  body.terms = (body.terms||[]).map(s=>s.trim()).filter(Boolean);
  body.times = (body.times||[]).map(s=>s.trim()).filter(Boolean);

  await setConfig(body);
  return Response.json({ ok: true });
}
