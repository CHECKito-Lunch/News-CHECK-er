export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies as getCookies } from 'next/headers';
import { sql } from '@/lib/db';

const json = (d: any, s = 200) => NextResponse.json(d, { status: s });

async function getUserFromCookies() {
  const c = await getCookies();
  const user_id = c.get('user_id')?.value || null;

  // optionaler Name (für Anzeige)
  const user_name = c.get('user_name')?.value || null;

  // Fallback: sub aus auth-JWT
  if (!user_id) {
    const auth = c.get('auth')?.value;
    if (auth && auth.includes('.')) {
      try {
        const b = auth.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const p = JSON.parse(Buffer.from(b, 'base64').toString('utf8'));
        return { user_id: String(p?.sub ?? ''), user_name };
      } catch { /* ignore */ }
    }
  }
  return { user_id, user_name };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const eid = Number(params.id);
  if (!Number.isFinite(eid)) return json({ ok: false, error: 'invalid_id' }, 400);

  const rows = await sql<any[]>`
    SELECT id, user_name, content, created_at
    FROM public.event_comments
    WHERE event_id = ${eid}
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return json({ ok: true, items: rows });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const eid = Number(params.id);
  if (!Number.isFinite(eid)) return json({ ok: false, error: 'invalid_id' }, 400);

  const { user_id, user_name } = await getUserFromCookies();
  if (!user_id) return json({ ok: false, error: 'unauthorized' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const content = String(body?.content ?? '').trim();
  if (!content) return json({ ok: false, error: 'content_required' }, 400);

  await sql`
    INSERT INTO public.event_comments (event_id, user_id, user_name, content)
    VALUES (${eid}, ${user_id}, ${user_name ?? null}, ${content})
  `;

  return json({ ok: true });
}
