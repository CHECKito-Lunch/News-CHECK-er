// app/api/_diag/agent/route.ts
import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/newsAgent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function toMin(hhmm: string) {
  const [H, M] = hhmm.split(':').map(n => Number(n));
  if (!Number.isFinite(H) || !Number.isFinite(M)) return NaN;
  return H * 60 + M;
}

function nowHHMMInTZ(tz: string) {
  // Format HH:mm in einer gewünschten Zeitzone
  const fmt = new Intl.DateTimeFormat('de-DE', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // "HH:mm" extrahieren
  const parts = fmt.formatToParts(new Date());
  const h = parts.find(p => p.type === 'hour')?.value ?? '00';
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

function isDue(now: string, times: string[], windowMin = 10) {
  const n = toMin(now);
  if (!Number.isFinite(n)) return false;
  return (times || []).some(t => {
    const tm = toMin(t);
    return Number.isFinite(tm) && Math.abs(tm - n) <= windowMin;
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // optionales Fenster in Minuten (?window=10)
    const windowMin = Math.max(0, Number(url.searchParams.get('window') ?? 10)) || 10;

    // Config laden (falls nicht vorhanden, sanfte Defaults)
    const cfg = await getConfig().catch(() => null) as
      | (ReturnType<typeof getConfig> extends Promise<infer T> ? T : never)
      | null;

    // Timezone ermitteln: aus Config → ENV TZ → Fallback
    const tz =
      // @ts-ignore – falls du später cfg.timezone hinzufügst
      (cfg as any)?.timezone ||
      process.env.TZ ||
      'Europe/Berlin';

    const nowLocal = nowHHMMInTZ(tz);
    const due = isDue(nowLocal, cfg?.times || [], windowMin);

    // praktische Zusatzinfos
    const hasNEWS = !!(process.env.NEWS_API_KEY && String(process.env.NEWS_API_KEY).trim());
    const hasOPENAI = !!(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim());
    const hasCRON = !!(process.env.NEWS_AGENT_CRON_SECRET && String(process.env.NEWS_AGENT_CRON_SECRET).trim());

    return NextResponse.json({
      ok: true,
      now: new Date().toISOString(),
      timeZone: tz,
      nowLocal,              // "HH:mm" in tz
      windowMin,
      enabled: cfg?.enabled ?? null,
      times: cfg?.times ?? [],
      dueNow: due,
      // kleine Entscheidungs-/Health-Checks
      env: {
        hasNEWS_API_KEY: hasNEWS,
        hasOPENAI_API_KEY: hasOPENAI,
        hasNEWS_AGENT_CRON_SECRET: hasCRON,
      },
      // zur Vollständigkeit noch ein bisschen Config-Echo:
      maxArticles: cfg?.maxArticles ?? null,
      language: cfg?.language ?? null,
      autoPublish: cfg?.autoPublish ?? null,
      defaultVendorId: cfg?.defaultVendorId ?? null,
      defaultCategoryId: cfg?.defaultCategoryId ?? null,
      defaultBadgeIds: cfg?.defaultBadgeIds ?? [],
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
