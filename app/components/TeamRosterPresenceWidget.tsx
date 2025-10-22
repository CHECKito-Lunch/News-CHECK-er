/* eslint-disable @typescript-eslint/no-explicit-any */
/* Minimal replacement for your existing PresenceShiftTiles component
 * -> uses GET /api/roster-shifts
 */
'use client';
import { useEffect, useMemo, useState } from 'react';

// YYYY-MM-DD in Europe/Berlin
const ymdInTz = (d: Date, tz = 'Europe/Berlin') =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

type BucketKey = 'early' | 'middle' | 'late' | 'absent';
type ToneKey = 'emerald' | 'sky' | 'violet' | 'amber';

interface BucketData {
  count: number;
  names: string[];
}

interface RosterResponse {
  day: string;
  thresholds: { earlyStart: number; middleStart: number; lateStart: number };
  buckets: Record<BucketKey, BucketData>;
}

interface TileProps {
  bucketKey: BucketKey;
  title: string;
  count: number;
  names: string[];
  tone: ToneKey;
  collapsed: Record<BucketKey, boolean>;
  setCollapsed: React.Dispatch<React.SetStateAction<Record<BucketKey, boolean>>>;
  showNames: boolean;
  maxNames: number;
  loading: boolean;
}

export function PresenceShiftTiles({
  dayISO,
  tz = 'Europe/Berlin',
  showNames = true,
  maxNames = 120,
  earlyStart = 5 * 60,
  middleStart = 10 * 60,
  lateStart = 12 * 60 + 30,
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
  const [data, setData] = useState<RosterResponse | null>(null);

  const [collapsed, setCollapsed] = useState<Record<BucketKey, boolean>>({
    early: true, middle: true, late: true, absent: true,
  });

  const day = useMemo(() => dayISO ?? ymdInTz(new Date(), tz), [dayISO, tz]);

  useEffect(() => {
    const run = async () => {
      setLoading(true); setErr('');
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
        const safe = (arr: unknown): string[] =>
          Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
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

  const toneMap: Record<ToneKey, string> = {
    emerald: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-900/20',
    sky:     'border-sky-200 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-900/20',
    violet:  'border-violet-200 bg-violet-50/70 dark:border-violet-900/50 dark:bg-violet-900/20',
    amber:   'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-900/20',
  };

  function Tile({
    bucketKey, title, count, names, tone, collapsed, setCollapsed, showNames, maxNames, loading
  }: TileProps) {
    const isCollapsed: boolean = collapsed[bucketKey];
    return (
      <div className={`rounded-2xl border p-5 ${toneMap[tone]}`}>
        <div className="flex items-center gap-3">
          <div className="text-4xl font-extrabold tracking-tight">{loading ? '–' : count}</div>
          <div className="text-sm font-semibold opacity-80">{title}</div>
          {showNames && (
            <button
              type="button"
              onClick={() => setCollapsed(s => ({ ...s, [bucketKey]: !s[bucketKey] }))}
              className="ml-auto text-xs px-2 py-1 rounded border border-gray-300/60 dark:border-gray-600/60 hover:bg-white/60 dark:hover:bg-white/10"
              aria-expanded={!isCollapsed}
              aria-controls={`names-${bucketKey}`}
              title={isCollapsed ? 'Namen anzeigen' : 'Namen ausblenden'}
            >
              {isCollapsed ? 'anzeigen' : 'ausblenden'}
            </button>
          )}
        </div>
        {showNames && !isCollapsed && (
          <div id={`names-${bucketKey}`} className="mt-2 text-sm text-gray-800 dark:text-gray-200">
            {loading ? (
              <div className="animate-pulse h-5 w-2/3 rounded bg-black/10 dark:bg-white/10" />
            ) : names.length ? (
              <div className="flex flex-wrap gap-1.5">
                {names.slice(0, maxNames).map((n: string, i: number) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full border border-gray-300/70 dark:border-gray-600/60">
                    {n}
                  </span>
                ))}
                {names.length > maxNames && (
                  <span className="inline-flex items-center px-2 py-0.5 text-[11px] rounded-full border border-gray-300/70 dark:border-gray-600/60">
                    +{names.length - maxNames} weitere
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[12px] opacity-70">—</span>
            )}
          </div>
        )}
      </div>
    );
  }

  const early  = data?.buckets?.early  || { count: 0, names: [] as string[] };
  const middle = data?.buckets?.middle || { count: 0, names: [] as string[] };
  const late   = data?.buckets?.late   || { count: 0, names: [] as string[] };
  const absent = data?.buckets?.absent || { count: 0, names: [] as string[] };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Tile bucketKey="early"  title="Frühschicht"   count={early.count}  names={early.names}  tone="emerald"
        collapsed={collapsed} setCollapsed={setCollapsed} showNames={showNames} maxNames={maxNames} loading={loading} />
      <Tile bucketKey="middle" title="Mittelschicht" count={middle.count} names={middle.names} tone="sky"
        collapsed={collapsed} setCollapsed={setCollapsed} showNames={showNames} maxNames={maxNames} loading={loading} />
      <Tile bucketKey="late"   title="Spätschicht"   count={late.count}   names={late.names}   tone="violet"
        collapsed={collapsed} setCollapsed={setCollapsed} showNames={showNames} maxNames={maxNames} loading={loading} />
      <Tile bucketKey="absent" title="Abwesend"      count={absent.count} names={absent.names} tone="amber"
        collapsed={collapsed} setCollapsed={setCollapsed} showNames={showNames} maxNames={maxNames} loading={loading} />
      {!loading && err && (
        <div className="sm:col-span-2 lg:col-span-4 text-xs text-red-600">{err}</div>
      )}
    </div>
  );
}

// Usage Beispiele:
// <PresenceShiftTiles />
// <PresenceShiftTiles dayISO="2025-10-22" />
// <PresenceShiftTiles earlyStart={300} middleStart={600} lateStart={750} />
// <PresenceShiftTiles showNames={false} />
