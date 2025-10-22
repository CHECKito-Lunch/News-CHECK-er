/* eslint-disable @typescript-eslint/no-explicit-any */
/* Minimal replacement for your existing PresenceShiftTiles component
 * -> uses the new GET /api/roster-shifts endpoint
 */
'use client';
import { useEffect, useMemo, useState } from 'react';

// If you already have ymdInTz in your utils, remove this local helper and import yours instead
const ymdInTz = (d: Date, tz = 'Europe/Berlin') =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export function PresenceShiftTiles({
  dayISO,
  tz = 'Europe/Berlin',
  showNames = true,
  maxNames = 120,
  // Shift thresholds: minutes after 00:00
  earlyStart = 5 * 60,   // 05:00 inclusive
  middleStart = 11 * 60, // 11:00 inclusive
  lateStart = 17 * 60,   // 17:00 inclusive
  teamId,
}: {
  dayISO?: string;
  tz?: string;
  showNames?: boolean;
  maxNames?: number;
  earlyStart?: number;
  middleStart?: number;
  lateStart?: number;
  teamId?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>('');
  const [data, setData] = useState<{
    day: string;
    thresholds: { earlyStart: number; middleStart: number; lateStart: number };
    buckets: {
      early: { count: number; names: string[] };
      middle: { count: number; names: string[] };
      late: { count: number; names: string[] };
      absent: { count: number; names: string[] };
    };
  } | null>(null);

  const day = useMemo(() => dayISO ?? ymdInTz(new Date(), tz), [dayISO, tz]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErr('');
      try {
        const qs = new URLSearchParams({
          day,
          earlyStart: String(Math.max(0, Math.floor(earlyStart))),
          middleStart: String(Math.max(0, Math.floor(middleStart))),
          lateStart: String(Math.max(0, Math.floor(lateStart))),
        });
        if (typeof teamId === 'number') qs.set('team_id', String(teamId));
        const r = await fetch(`/api/roster-shifts?${qs.toString()}`, { cache: 'no-store' });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        const safe = (arr: any): string[] => (Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : []);
        setData({
          day: j?.day ?? day,
          thresholds: {
            earlyStart: Number(j?.thresholds?.earlyStart) || earlyStart,
            middleStart: Number(j?.thresholds?.middleStart) || middleStart,
            lateStart: Number(j?.thresholds?.lateStart) || lateStart,
          },
          buckets: {
            early:  { count: Number(j?.buckets?.early?.count)  || 0, names: safe(j?.buckets?.early?.names) },
            middle: { count: Number(j?.buckets?.middle?.count) || 0, names: safe(j?.buckets?.middle?.names) },
            late:   { count: Number(j?.buckets?.late?.count)   || 0, names: safe(j?.buckets?.late?.names) },
            absent: { count: Number(j?.buckets?.absent?.count) || 0, names: safe(j?.buckets?.absent?.names) },
          },
        });
      } catch (e: any) {
        setErr(e?.message || 'Fehler beim Laden');
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [day, teamId, earlyStart, middleStart, lateStart]);

  const Tile = ({ title, count, names, tone }: { title: string; count: number; names: string[]; tone: 'emerald'|'sky'|'violet'|'amber' }) => {
    const toneMap: Record<string, string> = {
      emerald: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-900/20',
      sky:     'border-sky-200 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-900/20',
      violet:  'border-violet-200 bg-violet-50/70 dark:border-violet-900/50 dark:bg-violet-900/20',
      amber:   'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-900/20',
    };
    return (
      <div className={`rounded-2xl border p-5 ${toneMap[tone]}`}>
        <div className="flex items-baseline gap-3">
          <div className="text-4xl font-extrabold tracking-tight">{loading ? '–' : count}</div>
          <div className="text-sm font-semibold opacity-80">{title}</div>
        </div>
        {showNames && (
          <div className="mt-2 text-sm text-gray-800 dark:text-gray-200">
            {loading ? (
              <div className="animate-pulse h-5 w-2/3 rounded bg-black/10 dark:bg-white/10" />
            ) : names.length ? (
              <div className="flex flex-wrap gap-1.5">
                {names.slice(0, maxNames).map((n, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full border border-gray-300/70 dark:border-gray-600/60">{n}</span>
                ))}
                {names.length > maxNames && (
                  <span className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full border border-gray-300/70 dark:border-gray-600/60">+{names.length - maxNames} weitere</span>
                )}
              </div>
            ) : (
              <span className="text-[12px] opacity-70">—</span>
            )}
          </div>
        )}
      </div>
    );
  };

  const buckets = data?.buckets;
  const early  = buckets?.early  || { count: 0, names: [] as string[] };
  const middle = buckets?.middle || { count: 0, names: [] as string[] };
  const late   = buckets?.late   || { count: 0, names: [] as string[] };
  const absent = buckets?.absent || { count: 0, names: [] as string[] };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Tile title="Frühschicht"   count={early.count}  names={early.names}  tone="emerald" />
      <Tile title="Mittelschicht" count={middle.count} names={middle.names} tone="sky" />
      <Tile title="Spätschicht"   count={late.count}   names={late.names}   tone="violet" />
      <Tile title="Abwesend"      count={absent.count} names={absent.names} tone="amber" />
      {!loading && err && (
        <div className="sm:col-span-2 lg:col-span-4 text-xs text-red-600">{err}</div>
      )}
    </div>
  );
}

// Usage
// <PresenceShiftTiles />
// <PresenceShiftTiles dayISO="2025-10-22" />
// <PresenceShiftTiles earlyStart={360} middleStart={660} lateStart={1020} />
// <PresenceShiftTiles showNames={false} />
