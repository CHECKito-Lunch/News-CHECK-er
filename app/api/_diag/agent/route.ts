// app/api/_diag/agent/route.ts
import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/newsAgent';

function nowHHMMInTZ(tz?: string) {
  const timeZone = tz && tz.trim() ? tz : 'Europe/Berlin';
  const parts = new Intl.DateTimeFormat('de-DE', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const hh = parts.find(p => p.type === 'hour')?.value || '00';
  const mm = parts.find(p => p.type === 'minute')?.value || '00';
  return { hhmm: `${hh}:${mm}`, timeZone };
}

function isDue(now: string, times: string[], windowMin=10) {
  const toMin = (t:string)=>{ const [H,M]=t.split(':').map(n=>+n); return H*60+M; };
  const n = toMin(now);
  return (times||[]).some(t => Math.abs(toMin(t)-n) <= windowMin);
}

export async function GET() {
  try {
    const cfg = await getConfig(); // wirft, falls fehlt
    const { hhmm, timeZone } = nowHHMMInTZ(cfg.timezone);
    const due = isDue(hhmm, cfg.times || [], 10);
    return NextResponse.json({
      ok: true,
      nowLocal: hhmm,
      timeZone,
      times: cfg.times || [],
      windowMin: 10,
      due,
      enabled: cfg.enabled,
      hasNEWS_API_KEY: !!process.env.NEWS_API_KEY,
      hasOPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
