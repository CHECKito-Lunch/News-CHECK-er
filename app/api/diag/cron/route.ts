// app/api/_diag/cron/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function pickKey(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('key') || '').trim();
  const h = (req.headers.get('x-cron-auth') || '').trim();
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  // Priorität: query > header > bearer
  return q || h || bearer || '';
}

function hash(input: string) {
  // kleiner Fingerprint ohne das Secret im Klartext preiszugeben
  // Falls du Node < 18 nutzt, ersetze das durch crypto.createHash(...)
  // @ts-ignore
  const c = require('crypto') as typeof import('crypto');
  return c.createHash('sha256').update(input, 'utf8').digest('hex');
}

export async function GET(req: Request) {
  try {
    const provided = pickKey(req);
    const env = (process.env.NEWS_AGENT_CRON_SECRET || '').trim();

    const authorized = !!env && !!provided && provided === env;

    return NextResponse.json({
      ok: !!env,
      authorized,
      // Nur Fingerprints zeigen – niemals das Secret selbst zurückgeben
      provided: provided ? { len: provided.length, sha256: hash(provided).slice(0, 16) } : null,
      expected: env ? { len: env.length, sha256: hash(env).slice(0, 16) } : null,
      // Quality-of-life
      accepts: {
        query_param: 'key',
        header: 'X-Cron-Auth',
        bearer: 'Authorization: Bearer <secret>',
      },
      note: 'authorized == true, wenn provided === process.env.NEWS_AGENT_CRON_SECRET (Production).',
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
