// lib/server/cronSecret.ts
export function isCronAuthorized(req: Request): boolean {
  const hdr = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET?.trim();
  return Boolean(hdr && expected && hdr === expected);
}

export function getDryFlag(req: Request): boolean {
  const url = new URL(req.url);
  return url.searchParams.get('dry') === '1';
}
