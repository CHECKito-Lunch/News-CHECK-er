'use client';

import { JSXElementConstructor, Key, ReactNode, ReactPortal, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  AreaChart, Area,
  PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Lamp, Lightbulb } from "lucide-react";

/* ================= Types ================= */
type ScoreRow = {
  id:number; year:number; month:number;
  productive_outage:number|null; lateness_minutes:number|null; efeedback_score:number|null; points:number;
  team_id:number; team_name:string;
};

type WidgetConfig = {
  year: number;
  metric: 'productive_outage'|'lateness_minutes'|'efeedback_score'|'points';
  chart:  'line'|'bar'|'area'|'pie';
  teams?: number[];
  stacked?: boolean;
  title?: string;
};
type WidgetRow = { id:string; name:string; config:WidgetConfig; created_at:string };

type CheckiadeSettings = {
  announcement?: { kind:'md'|'html'; content:string };
};

type TeamMonthDetail = {
  team_id: number;
  team_name: string;
  points: number;
  avgOutage: number | null;
  totalLate: number | null;
  avgFeedback: number | null;
  // Mini-Sparkline: Punkte-Verlauf bis einschließlich Monat m
  trend: { x: number; y: number }[];
};

type MonthCard = {
  month: number;
  rows: ScoreRow[];
  winnerStats: { team: string; points: number; avgOutage: number; totalLate: number; avgFeedback: number } | null;
  monthStats: { avgOutage: number | null; totalLate: number | null; avgFeedback: number | null };
  podium: { team: string; pts: number }[];
  teamsDetailed: TeamMonthDetail[];
};

type MinMax = { min: number; max: number };

function mm(vals: number[]): MinMax | null {
  const nums = vals.filter(v => Number.isFinite(v));
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** Liefert ein Inline-Style für grünen Verlaufsbalken im Tabellenfeld. */
function cellGradient(
  raw: unknown,
  bounds: MinMax | null,
  opts?: { invert?: boolean }
): React.CSSProperties | undefined {
  const n = Number(raw);
  if (!Number.isFinite(n) || !bounds) return undefined;

  const { min, max } = bounds;
  const range = max - min;

  // Normierung 0..1; bei range=0 alle leicht grün
  let p = range > 0 ? (n - min) / range : 0.5;
  if (opts?.invert) p = 1 - p;

  // sanfter Verlauf: Deckkraft 0.08–0.30, Breite 20–100%
  const alpha = 0.08 + p * 0.22;
  const width = 20 + p * 80;

  return {
    background: `linear-gradient(90deg, rgba(34,197,94,${alpha}) 0%, rgba(34,197,94,${alpha}) ${width}%, transparent ${width}%)`,
    borderRadius: 6,
  };
}

/** Formatiere Zahl sauber oder '—' */
const fmtSafe = (x: unknown, digits = 2) =>
  Number.isFinite(Number(x)) ? Number(x).toFixed(digits) : '—';

const card = 'rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm';

/* ===== Monatsnamen ===== */
const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const MONTHS_DE_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

/* ===== Medaillen ===== */
const medalStyles = [
  'bg-[linear-gradient(135deg,#fde68a,#f59e0b)] text-[#4a2b00] border-amber-300',
  'bg-[linear-gradient(135deg,#e5e7eb,#9ca3af)] text-[#1f2937] border-gray-300',
  'bg-[linear-gradient(135deg,#fcd34d,#b45309)] text-[#3b2200] border-orange-300',
] as const;

function MedalChip({ place }: { place: 1|2|3 }) {
  const i = place - 1;
  const label = place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉';
  return (
    <span className={[
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border',
      medalStyles[i],
    ].join(' ')}>
      <span>{label}</span>
      <span className="font-medium">Platz {place}</span>
    </span>
  );
}

/* ===== Fancy Tooltip ===== */
function FancyTooltip({ active, label, payload }:{active?:boolean; label?:string; payload?:any[]}){
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur p-2 shadow">
      <div className="text-xs font-medium mb-1">{label}</div>
      <ul className="text-xs space-y-0.5">
        {payload.map((p:any)=>(
          <li key={p.dataKey} className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background:p.color }} />
            <span className="truncate">{p.dataKey}</span>
            <span className="ml-auto tabular-nums">{typeof p.value==='number' ? p.value.toLocaleString('de-DE') : p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}






/* ===== Mini Sparkline (Trend) ===== */
function MiniSparkline({ data, color }:{ data:{name:string; value:number}[]; color:string }) {
  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top:2, right:2, bottom:0, left:2 }}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ================= Page ================= */
export default function PublicCheckiade() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState<CheckiadeSettings>({});
  const [widgets, setWidgets] = useState<WidgetRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [wQuery, setWQuery] = useState('');

  // Persistierte Auswahl laden/speichern
  useEffect(() => { const raw = localStorage.getItem('checkiade:selected'); if (raw) { try { setSelected(JSON.parse(raw)); } catch {} } }, []);
  useEffect(() => { localStorage.setItem('checkiade:selected', JSON.stringify(selected)); }, [selected]);

  // load settings + widgets
  useEffect(() => {
    (async () => {
      const [sRes, wRes] = await Promise.all([
        fetch('/api/settings/checkiade', { cache:'no-store' }).then(r=>r.json()).catch(()=>({})),
        fetch('/api/checkiade/widgets', { cache:'no-store' }).then(r=>r.json()).catch(()=>({ items:[] })),
      ]);
      setSettings(sRes?.value ?? {});
      const list: WidgetRow[] = Array.isArray(wRes?.items) ? wRes.items : [];
      setWidgets(list);
      setSelected(prev => prev.length ? prev : list.slice(0,3).map(w=>w.id)); // default
    })();
  }, []);

  // load scores
  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await fetch(`/api/checkiade/scores?year=${year}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({items:[]}));
      setScores(Array.isArray(j?.items)? j.items : []);
      setLoading(false);
    })();
  }, [year]);

  /* ===== Announcement ===== */
  const Announcement = () => {
    const a = settings.announcement;
    if (!a?.content) return null;
    return (
      <section className={card}>
        <h2 className="text-lg font-semibold mb-2">Announcement</h2>
        <div className="prose dark:prose-invert max-w-none">
          {a.kind === 'html'
            ? <div dangerouslySetInnerHTML={{ __html: a.content }} />
            : <pre className="whitespace-pre-wrap text-sm">{a.content}</pre>}
        </div>
      </section>
    );
  };

  /* ===== Farben je Team (konstant pro Render) ===== */
  const teamNames = useMemo(() => {
    const set = new Set<string>(); scores.forEach(s => set.add(s.team_name));
    return Array.from(set);
  }, [scores]);

  const colorMap = useMemo(() => {
    const hues = [210, 260, 190, 330, 20, 140, 280, 0, 170, 45, 300, 110];
    const map = new Map<string,string>();
    teamNames.forEach((name, i) => { map.set(name, `hsl(${hues[i % hues.length]} 70% 50%)`); });
    return map;
  }, [teamNames]);

  /* ===== Leaderboard (YTD Punkte) ===== */
  const leaderboard = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of scores) map.set(r.team_name, (map.get(r.team_name) ?? 0) + (Number(r.points) || 0));
    return Array.from(map.entries()).map(([team, total]) => ({ team, total })).sort((a,b)=> b.total - a.total);
  }, [scores]);

  /* ===== Team-Trends (Punkte über alle Monate) ===== */
  const teamTrends = useMemo(() => {
    const trend = new Map<string, {name:string; value:number}[]>();
    for (const name of teamNames) {
      const series = Array.from({length:12}, (_,i)=>i+1).map(m => {
        const pts = scores.filter(s => s.team_name===name && s.month===m).reduce((acc, r)=> acc + (r.points||0), 0);
        return { name: MONTHS_DE_SHORT[m-1], value: pts };
      });
      trend.set(name, series);
    }
    return trend;
  }, [teamNames, scores]);

 const monthCards: MonthCard[] = useMemo(() => {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  // Hilfsfunktionen
  const safeAvg = (vals: (number | null | undefined)[]) => {
    const nums = vals.map(v => (v == null ? NaN : Number(v))).filter(v => Number.isFinite(v)) as number[];
    return nums.length ? Math.round((nums.reduce((a,b)=>a+b,0) / nums.length) * 100) / 100 : null;
  };
  const safeSumInt = (vals: (number | null | undefined)[]) => {
    const s = vals.map(v => (v == null ? NaN : Number(v))).filter(v => Number.isFinite(v)).reduce((a,b)=>a+b,0);
    return Number.isFinite(s) ? Math.round(s) : null;
    };

  return months.map((m) => {
    const rows = scores.filter(s => s.month === m);

    // Gruppierung je Team
    const byTeam = new Map<number, ScoreRow[]>();
    for (const r of rows) {
      if (!byTeam.has(r.team_id)) byTeam.set(r.team_id, []);
      byTeam.get(r.team_id)!.push(r);
    }

    // Aggregation je Team
    const perTeam = Array.from(byTeam.values()).map(teamRows => {
      const team_id = teamRows[0].team_id;
      const team_name = teamRows[0].team_name;

      const points = teamRows.reduce((a, r) => a + (Number(r.points) || 0), 0);
      const avgOutage = safeAvg(teamRows.map(r => r.productive_outage));
      const totalLate = safeSumInt(teamRows.map(r => r.lateness_minutes));
      const avgFeedback = safeAvg(teamRows.map(r => r.efeedback_score));

      // Trend: Punkte der letzten bis zu 6 Monate (inkl. m) für dieses Team
      const windowStart = Math.max(1, m - 5);
const trend: { x:number; y:number }[] = [];
for (let mm = windowStart; mm <= m; mm++) {
  const pts = scores
    .filter(s => s.team_id === team_id && s.month === mm)
    .reduce((a, r) => a + (Number(r.points) || 0), 0);
  // nur hinzufügen, wenn wirklich Punkte > 0 vorhanden
  if (pts > 0) {
    trend.push({ x: mm, y: pts });
  }
}

      return { team_id, team_name, points, avgOutage, totalLate, avgFeedback, trend } as TeamMonthDetail;
    });

    // Monatsstatistik (gesamt)
    const monthStats = {
      avgOutage: safeAvg(rows.map(r => r.productive_outage)),
      totalLate: safeSumInt(rows.map(r => r.lateness_minutes)),
      avgFeedback: safeAvg(rows.map(r => r.efeedback_score)),
    };

    // Podium
    const podium = [...perTeam]
      .sort((a, b) => b.points - a.points)
      .map(t => ({ team: t.team_name, pts: t.points }));

    // Winner-Stats (falls vorhanden)
    const w0 = podium[0];
    const winnerStats = w0
      ? {
          team: w0.team,
          points: w0.pts,
          avgOutage: perTeam.find(t => t.team_name === w0.team)?.avgOutage ?? 0,
          totalLate: perTeam.find(t => t.team_name === w0.team)?.totalLate ?? 0,
          avgFeedback: perTeam.find(t => t.team_name === w0.team)?.avgFeedback ?? 0,
        }
      : null;

    return {
      month: m,
      rows,
      winnerStats,
      monthStats,
      podium,
      teamsDetailed: perTeam.sort((a, b) => b.points - a.points),
    };
  });
}, [scores]);

  /* ===== Widget selection (jetzt unter den Monaten) ===== */
  const toggle = (id:string) => setSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  const filteredWidgets = useMemo(() => {
    const q = wQuery.trim().toLowerCase();
    if (!q) return widgets;
    return widgets.filter(w => `${w.name} ${w.config?.title ?? ''}`.toLowerCase().includes(q));
  }, [widgets, wQuery]);
  const noneVisibleSelected = filteredWidgets.every(w => !selected.includes(w.id));
  const selectAllVisible = () => setSelected(prev => Array.from(new Set([...prev, ...filteredWidgets.map(w=>w.id)])));
  const clearAllVisible  = () => setSelected(prev => prev.filter(id => !filteredWidgets.some(w => w.id === id)));

  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">CHECKiade</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Jahr:</label>
          <input
            type="number"
            className="px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10 w-24"
            value={year}
            onChange={e=>setYear(Number(e.target.value)||new Date().getFullYear())}
          />
        </div>
      </header>

      <Announcement />

      {/* Leaderboard (Jahr) */}
<section className={card}>
  <div className="mb-3 flex items-center justify-between">
    <h2 className="text-lg font-semibold">Teamrangliste {year}</h2>
    <div className="text-sm text-gray-500">{leaderboard.length} Teams</div>
  </div>
  <ol className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
    {leaderboard.map((r, i) => {
      const isLast = i === leaderboard.length - 1;
      return (
        <li
          key={r.team}
          className={[
            'rounded-xl border p-3 bg-white dark:bg-gray-900 flex items-center gap-3',
            i < 3
              ? medalStyles[i]
              : isLast
              ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
              : 'border-gray-200 dark:border-gray-800',
          ].join(' ')}
        >
          <span className="text-xl w-8 text-center font-semibold">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{r.team}</div>
            <div className="text-sm opacity-80">{r.total} Punkte</div>
          </div>

          {i < 3 && <MedalChip place={(i + 1) as 1 | 2 | 3} />}

          {isLast && (
  <span className="inline-flex items-center" title="Rote Laterne">
    <Lightbulb className="w-5 h-5 text-red-500 shrink-0" strokeWidth={2} />
  </span>
)}
        </li>
      );
    })}
    {leaderboard.length === 0 && (
      <li className="text-sm text-gray-500">Keine Daten.</li>
    )}
  </ol>
</section>

   {/* Monatskacheln (mit Podium sichtbar + Aufklappen) */}
<section className={card}>
  <div className="mb-3 flex items-center justify-between">
    <h2 className="text-lg font-semibold">Monate {year}</h2>
  </div>

  {/* 6 Spalten ab lg ⇒ 2 Reihen für 12 Monate */}
  <div className="grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-2 gap-4">
    {monthCards.map((m) => (
      <details
        key={m.month}
        className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden open:shadow-sm"
      >
        {/* Summary: Monat + Gewinner + Podium + Monats-Ø/Σ */}
        <summary className="cursor-pointer list-none p-4 select-none">
          <div className="text-sm text-gray-500">{MONTHS_DE[m.month - 1]}</div>

          {m.winnerStats ? (
            <>
              {/* Gewinner */}
              <div className="mt-1">
                <div className="font-medium">
                  {m.winnerStats.team}{' '}
                  <span className="text-gray-500">({m.winnerStats.points} Pkt.)</span>
                </div>
                {/* Gewinner-Kennzahlen */}
                <dl className="mt-1 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <dt className="text-gray-500">Ø Ausfall %</dt>
                    <dd className="font-medium">{fmt(m.winnerStats.avgOutage)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Σ Versp. Min.</dt>
                    <dd className="font-medium">{fmtInt(m.winnerStats.totalLate)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Ø eFeedback</dt>
                    <dd className="font-medium">{fmt(m.winnerStats.avgFeedback)}</dd>
                  </div>
                </dl>
              </div>

              {/* Podium 1–3 (immer sichtbar, kompakt mit Balken) */}
              {!!m.podium.length && (
                <ul className="mt-2 space-y-1">
                  {m.podium.slice(0, 3).map((p, idx) => {
                    const maxPts = m.podium[0]?.pts || 1; // Erstplatzierter = 100 %
                    const percent = Math.max(0, (p.pts / maxPts) * 100);
                    return (
                      <li
                        key={`${p.team}-${idx}`}
                        className={[
                          'relative flex items-center gap-2 rounded-lg px-2 py-1 border text-xs overflow-hidden',
                          medalStyles[idx as 0 | 1 | 2] ?? 'border-gray-200 dark:border-gray-800',
                        ].join(' ')}
                        title={`${p.team}: ${p.pts} Pkt.`}
                      >
                        {/* Balken-Hintergrund */}
                        <div
                          className={[
                            'absolute inset-y-0 left-0 transition-all',
                            idx === 0
                              ? 'bg-yellow-200/70 dark:bg-yellow-600/30'
                              : idx === 1
                              ? 'bg-gray-300/60 dark:bg-gray-600/40'
                              : 'bg-amber-800/40 dark:bg-amber-700/40',
                          ].join(' ')}
                          style={{ width: `${percent}%` }}
                        />
                        {/* Inhalt */}
                        <div className="relative flex items-center gap-2 w-full">
                          {idx < 3 && <MedalChip place={(idx + 1) as 1 | 2 | 3} />}
                          <div className="min-w-0 flex-1 font-medium truncate">{p.team}</div>
                          <div className="tabular-nums font-semibold">{p.pts} Pkt.</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Monats-Ø/Σ (Gesamt) unterhalb */}
              <div className="mt-3">
                <div className="text-xs text-gray-500 mb-1">Monats-Ø / Σ</div>
                <dl className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <dt className="text-gray-500">Ø Ausfall %</dt>
                    <dd className="font-medium">{fmt(m.monthStats.avgOutage)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Σ Versp. Min.</dt>
                    <dd className="font-medium">{fmtInt(m.monthStats.totalLate)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Ø eFeedback</dt>
                    <dd className="font-medium">{fmt(m.monthStats.avgFeedback)}</dd>
                  </div>
                </dl>
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-gray-500">Keine Daten</div>
          )}
        </summary>


{/* --- Aufgeklappt: Detailansicht (nur Tabelle, mit Min/Max & Gradienten) --- */}
<div className="px-4">
  {/* optional: feine Trennlinie */}
  <div className="h-px bg-gray-200 dark:bg-gray-800 my-3" />

  {(() => {
    const rows = m.teamsDetailed as TeamMonthDetail[];

    // Min/Max je Spalte ermitteln
    const bPoints = mm(rows.map(r => Number(r.points)));
    const bOut    = mm(rows.map(r => r.avgOutage == null ? NaN : Number(r.avgOutage)));
    const bLate   = mm(rows.map(r => r.totalLate == null ? NaN : Number(r.totalLate)));
    const bFb     = mm(rows.map(r => r.avgFeedback == null ? NaN : Number(r.avgFeedback)));

    return (
      <div className="overflow-x-auto">
  <table className="min-w-full text-sm border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
    <thead className="bg-gray-50 dark:bg-gray-900/30">
      <tr className="text-left text-gray-500">
        <th className="py-2 pr-4">Team</th>
        <th className="py-2 pr-4">Punkte</th>
        <th className="py-2 pr-4">Ø Ausfall %</th>
        <th className="py-2 pr-4">Σ Versp. Min.</th>
        <th className="py-2 pr-4">Ø eFeedback</th>
        <th className="py-2 pr-4">Trend</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
      {rows.map((t, i) => (
        <tr
          key={t.team_id}
          className={i % 2 === 1 ? "bg-gray-50 dark:bg-gray-900/20" : ""}
        >
          <td className="py-2 pr-4">{t.team_name}</td>
          <td className="py-2 pr-4 tabular-nums text-sm font-medium" style={cellGradient(t.points, bPoints)}>
            {t.points}
          </td>
          <td className="py-2 pr-4 tabular-nums text-sm font-medium" style={cellGradient(t.avgOutage, bOut, { invert: true })}>
            {fmt(t.avgOutage)}
          </td>
          <td className="py-2 pr-4 tabular-nums text-sm font-medium" style={cellGradient(t.totalLate, bLate, { invert: true })}>
            {fmtInt(t.totalLate)}
          </td>
          <td className="py-2 pr-4 tabular-nums text-sm font-medium" style={cellGradient(t.avgFeedback, bFb)}>
            {fmt(t.avgFeedback)}
          </td>
          <td className="py-2 pr-4">
            <div className="h-8 w-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={t.trend}>
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="y"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

    );
  })()}
</div>
      </details>
    ))}
  </div>
</section>

      {/* === Widget-AUSWAHL (jetzt UNTER den Monaten) === */}
      <section className={card}>
        <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold">Widgets auswählen</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-gray-500">
              ausgewählt: <span className="font-medium">{selected.length}</span> / {widgets.length}
            </div>
            <div className="hidden sm:block text-gray-300">|</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={noneVisibleSelected ? selectAllVisible : clearAllVisible}
                className="px-2.5 py-1.5 rounded-lg border dark:border-gray-700 text-sm"
              >
                {noneVisibleSelected ? 'Alle sichtbaren auswählen' : 'Sichtbare abwählen'}
              </button>
              <input
                className="px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10 text-sm"
                placeholder="Widgets suchen…"
                value={wQuery}
                onChange={(e) => setWQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
          <div className="text-sm font-medium mb-2">Anzeigen</div>
          <ul className="grid gap-2">
            {filteredWidgets.map((w) => {
              const isOn = selected.includes(w.id);
              const onKey = (e:React.KeyboardEvent<HTMLDivElement>)=>{
                if (e.key==='Enter' || e.key===' ') { e.preventDefault(); toggle(w.id); }
              };
              return (
                <li key={w.id}>
                  <div
                    role="button" tabIndex={0}
                    onClick={()=>toggle(w.id)} onKeyDown={onKey}
                    className={[
                      'w-full group rounded-lg border px-3 py-2 text-left flex items-center gap-3 cursor-pointer',
                      'bg-white dark:bg-gray-900',
                      isOn
                        ? 'border-blue-200 dark:border-blue-900 ring-1 ring-blue-300/50'
                        : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/5',
                    ].join(' ')}
                    title={w.name}
                  >
                    {/* reiner Status-Tag rechts */}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {w.name || w.config?.title || 'Unbenanntes Widget'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(w.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        {' · '}
                        {w.config?.chart ?? '—'}
                        {' · '}
                        {labelMetric(w.config?.metric ?? 'points' as any)}
                      </div>
                    </div>
                    <span className={[
                      'text-[10px] px-1.5 py-0.5 rounded-full border',
                      isOn
                        ? 'border-blue-300 text-blue-700 dark:border-blue-900 dark:text-blue-300'
                        : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300',
                    ].join(' ')}>
                      {isOn ? 'aktiv' : 'inaktiv'}
                    </span>
                  </div>
                </li>
              );
            })}
            {filteredWidgets.length === 0 && (
              <li className="text-sm text-gray-500">Keine Widgets gefunden.</li>
            )}
          </ul>
        </div>
      </section>

      {/* === VISUALISIERUNG (ganz unten) === */}
      <section className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Visualisierung</h2>
          {loading && <div className="text-sm text-gray-500">lädt…</div>}
        </div>
        <div className="grid gap-4">
          {widgets.filter(w => selected.includes(w.id)).map(w => (
            <WidgetView key={w.id} config={{...w.config, year}} scores={scores} />
          ))}
          {widgets.filter(w => selected.includes(w.id)).length===0 && (
            <div className="text-sm text-gray-500">Bitte oben Widgets aktivieren.</div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ============== Widget View (read-only, „fancy“) ============== */
function WidgetView({ config, scores }: { config:WidgetConfig; scores:ScoreRow[] }) {
  const cfg = config;

  // Farbpalette & Zuordnung je Team
  const teamNames = useMemo(() => {
    const set = new Set<string>();
    scores.forEach(s => set.add(s.team_name));
    return Array.from(set);
  }, [scores]);

  const colorMap = useMemo(() => {
    const hues = [210, 260, 190, 330, 20, 140, 280, 0, 170, 45, 300, 110];
    const map = new Map<string,string>();
    teamNames.forEach((name, i) => {
      map.set(name, `hsl(${hues[i % hues.length]} 70% 50%)`);
    });
    return map;
  }, [teamNames]);

  // Daten mit Monatsnamen
  const chartData = useMemo(() => {
    const teamIdToName = new Map<number, string>();
    scores.forEach(s => teamIdToName.set(s.team_id, s.team_name));
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    const rows = months.map(m => {
      const row: Record<string, number|string> = { name: MONTHS_DE_SHORT[m-1] };
      for (const [tid, tname] of teamIdToName) {
        const hit = scores.find(s => s.team_id === tid && s.month === m);
        const val = hit
          ? (cfg.metric === 'productive_outage' ? hit.productive_outage
            : cfg.metric === 'lateness_minutes' ? hit.lateness_minutes
            : cfg.metric === 'efeedback_score'  ? hit.efeedback_score
            : hit.points)
          : null;
        row[tname] = Number(val ?? 0);
      }
      return row;
    });

    if (cfg.teams?.length) {
      const names = scores.filter(s => cfg.teams!.includes(s.team_id)).map(s => s.team_name);
      const subset = new Set(names);
      return rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => k==='name' || subset.has(k))));
    }
    return rows;
  }, [scores, cfg]);

  const seriesKeys = useMemo(
    () => Object.keys(chartData[0] ?? {}).filter(k => k !== 'name'),
    [chartData]
  );

  const gradients = useMemo(() => seriesKeys.map(k => ({
    id: `grad-${k.replace(/\s+/g,'_')}`,
    color: colorMap.get(k) || 'hsl(210 70% 50%)',
  })), [seriesKeys, colorMap]);

  function renderChart(): ReactElement {
    if (!chartData.length && cfg.chart !== 'pie') return <div />;

    const common = {
      margin: { top: 10, right: 10, bottom: 0, left: 0 },
      children: (
        <>
          <CartesianGrid strokeDasharray="3 3" opacity={0.6} />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip content={<FancyTooltip />} />
          <Legend />
          <defs>
            {gradients.map(g => (
              <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={g.color} stopOpacity={0.9} />
                <stop offset="100%" stopColor={g.color} stopOpacity={0.15} />
              </linearGradient>
            ))}
          </defs>
        </>
      )
    };

    if (cfg.chart === 'line') {
      return (
        <LineChart data={chartData} {...common}>
          {common.children}
          {seriesKeys.map(k => (
            <Line
              key={k} type="monotone" dataKey={k}
              stroke={colorMap.get(k)} strokeWidth={2.5} dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      );
    }
    if (cfg.chart === 'bar') {
      return (
        <BarChart data={chartData} {...common}>
          {common.children}
          {seriesKeys.map(k => (
            <Bar
              key={k}
              dataKey={k}
              stackId={cfg.stacked ? 'a' : undefined}
              fill={`url(#grad-${k.replace(/\s+/g,'_')})`}
              radius={[6,6,0,0]}
            />
          ))}
        </BarChart>
      );
    }
    if (cfg.chart === 'area') {
      return (
        <AreaChart data={chartData} {...common}>
          {common.children}
          {seriesKeys.map(k => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stackId={cfg.stacked ? 'a' : undefined}
              stroke={colorMap.get(k)}
              fill={`url(#grad-${k.replace(/\s+/g,'_')})`}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      );
    }
    // pie: Jahres-Summen
    const pieData = summarizeYear(scores, cfg).map(d => ({ ...d, fill: colorMap.get(d.name) }));
    return (
      <PieChart>
        <Tooltip content={<FancyTooltip />} />
        <Legend />
        <Pie dataKey="value" nameKey="name" data={pieData} label />
      </PieChart>
    );
  }

  return (
    <article className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-900">
      <div className="text-sm font-medium mb-2">{cfg.title || 'Widget'}</div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Kennzahl: {labelMetric(cfg.metric)} · Chart: {cfg.chart}{cfg.stacked && (cfg.chart==='bar'||cfg.chart==='area') ? ' (stacked)' : ''}
      </div>
    </article>
  );
}

/* ============== Utils ============== */
function summarizeYear(rows: ScoreRow[], cfg: WidgetConfig) {
  const acc = new Map<string, number>();
  for (const r of rows) {
    if (cfg.teams?.length && !cfg.teams.includes(r.team_id)) continue;
    const val =
      cfg.metric === 'productive_outage' ? (r.productive_outage ?? 0) :
      cfg.metric === 'lateness_minutes' ? (r.lateness_minutes ?? 0) :
      cfg.metric === 'efeedback_score'  ? (r.efeedback_score ?? 0) :
      r.points;
    acc.set(r.team_name, (acc.get(r.team_name) ?? 0) + Number(val || 0));
  }
  return Array.from(acc.entries()).map(([name, value]) => ({ name, value }));
}
const arrSum = (a:number[]) => a.reduce((s,n)=>s+(Number.isFinite(n)?n:0),0);
const arrAvg = (a:number[]) => a.length ? Math.round((arrSum(a)/a.length)*100)/100 : NaN;
const sum = (a:number[]) => a.reduce((s,n)=>s+(Number.isFinite(n)?n:0),0);
const avg = (a:number[]) => a.length ? sum(a)/a.length : NaN;
const round2 = (n:number) => Math.round(n*100)/100;
const num = (x:any) => (x==null ? NaN : Number(x));
const fmt = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? '—' : String(Math.round(v * 100) / 100);
const fmtInt = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? '—' : String(Math.round(v));


function labelMetric(m:WidgetConfig['metric']) {
  switch (m) {
    case 'points': return 'Punkte';
    case 'productive_outage': return 'Produktive Ausfallquote (%)';
    case 'lateness_minutes': return 'Verspätungen (Min.)';
    case 'efeedback_score': return 'eFeedback (Ø)';
  }
}
