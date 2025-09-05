// lib/server/cronSecret.ts
export function isCronAuthorized(req: Request) {
  const secret =
    process.env.NEWS_AGENT_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim(); // Fallback erlaubt

  if (!secret) return false;

  const h = req.headers;

  // Header (case-insensitive)
  const viaHeader = (h.get('x-cron-auth') || '').trim();
  if (viaHeader && viaHeader === secret) return true;

  // Bearer
  const bearer = (h.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer && bearer === secret) return true;

  // Query-Param
  const key = new URL(req.url).searchParams.get('key');
  if (key && key === secret) return true;

  return false;
}

export function getDryFlag(req: Request) {
  return new URL(req.url).searchParams.get('dry') === '1';
}
export function getForceFlag(req: Request) {
  return new URL(req.url).searchParams.get('force') === '1';
}
