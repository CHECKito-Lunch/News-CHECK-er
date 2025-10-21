/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/fetchWithSupabase';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, CartesianGrid
} from 'recharts';
import { AiSummaryPanel } from '@/app/(site)/feedback/AiSummaryPanel';

/* 🆕 Feedback */
type FeedbackItem = {
  id: string | number;
  ts?: string | null;
  bewertung?: number | null;
  beraterfreundlichkeit?: number | null;
  beraterqualifikation?: number | null;
  angebotsattraktivitaet?: number | null;
  kommentar?: string | null;
  internal_note?: string | null;
  internal_checked?: boolean | null;
  template_name?: string | null;
  rekla?: string | boolean | number | null;
  geklaert?: string | boolean | number | null;
  feedbacktyp: 'service_mail' | 'service_mail_rekla' | 'service_phone' | 'sales_phone' | 'sales_lead' | string;
  feedback_ts?: string | null;
  booking_number_hash?: string | null;
  booking_number?: string | null;
};
type FeedbackRes = { ok: boolean; items: FeedbackItem[] };

type ChannelCfg = Record<string, { label: string; target: number }>;

/* ===========================
   PAGE
=========================== */
export default function FeedbackPage() {
  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Kunden-Feedback</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          Zur Startseite
        </Link>
      </header>

      <FeedbackSection />
    </div>
  );
}

/* ===========================
   CHART: Monatsverlauf
=========================== */
function YearScoreTrend({
  data,
  targets,
  labelMap,
  colors,
}: {
  data: Array<{
    monthKey: string;
    label: string;
    service_mail: number|null;
    service_mail_rekla: number|null;
    service_phone: number|null;
    sales_phone: number|null;
    sales_lead: number|null;
  }>;
  targets: Record<string, number>;
  labelMap: Record<string, string>;
  colors: Record<string, string>;
}) {
  if (!data || data.length === 0) {
    return <div className="text-sm text-gray-500">Noch keine Monatsdaten.</div>;
  }

  const keys: Array<keyof typeof data[number]> = [
    'service_mail_rekla','service_mail','sales_phone','service_phone','sales_lead'
  ];

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[3.5, 5]}
            ticks={[3.5, 4.0, 4.5, 5.0]}
            width={34}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(val: any, name: string) => [
              val == null ? '–' : Number(val).toFixed(2),
              labelMap[name] ?? name
            ]}
            labelFormatter={(l) => `Monat ${l}`}
          />

          {/* Ziel-Linien pro Kanal */}
          {keys.map(k => targets[k as string] != null && (
            <ReferenceLine
              key={`ref-${k}`}
              y={targets[k as string]}
              stroke={colors[k as string] ?? '#64748b'}
              strokeOpacity={0.55}
              strokeDasharray="6 6"
              label={{
                value: `Ziel ${targets[k as string].toFixed(2)}`,
                position: 'right',
                fill: colors[k as string] ?? '#64748b',
                fontSize: 10
              }}
            />
          ))}

          {/* Daten-Linien pro Kanal */}
          {keys.map(k => (
            <Line
              key={`line-${k}`}
              type="monotone"
              dataKey={k as string}
              name={labelMap[k as string] ?? (k as string)}
              dot={false}
              connectNulls
              strokeWidth={2.2}
              stroke={colors[k as string] ?? '#64748b'}
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ===========================
   Helpers (Timezone & Truthy)
=========================== */
const FE_TZ = 'Europe/Berlin';
const BO_BASE = 'https://backoffice.reisen.check24.de/booking/search/';

function isTrueish(v: unknown) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'ja' || s === 'true' || s === '1' || s === 'y' || s === 'yes';
}
function getTs(f: FeedbackItem): string | null {
  return (f as any).feedback_ts || (f as any).ts || null;
}
function ymKeyBerlin(d: Date) {
  const z = new Date(d.toLocaleString('en-US', { timeZone: FE_TZ }));
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function ymdBerlin(d: Date) {
  const z = new Date(d.toLocaleString('en-US', { timeZone: FE_TZ }));
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, '0');
  const dd = String(z.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function fmtTimeBerlin(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: FE_TZ, hour: '2-digit', minute: '2-digit'
  }).format(d);
}
function fmtDateBerlin(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: FE_TZ, day:'2-digit', month:'2-digit', year:'numeric'
  }).format(d);
}
function incMonthKey(key: string) {
  const [y, m] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}
function boLinkFor(f: FeedbackItem): string | null {
  const hash = (f as any).booking_number_hash as string | undefined;
  const raw  = (f as any).booking_number as string | undefined;
  if (hash && /^[0-9a-f]{64}$/i.test(hash)) return `/api/bo/${hash}`;
  if (raw) return `${BO_BASE}?booking_number=${encodeURIComponent(String(raw).replace(/\D+/g,''))}`;
  return null;
}

/* ===========================
   User Feedback Section
=========================== */
function FeedbackSection() {
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 🆕 Serverseitige Kanal-Config pro User
  const [channelCfg, setChannelCfg] = useState<ChannelCfg>({});
  const [channelKeys, setChannelKeys] = useState<string[]>([]); // Union: Feedback + Server

  // Fallback-Defaults (nur wenn Server nichts hat)
  const DEFAULTS: ChannelCfg = {
    service_mail:        { label: 'E-Mail Service',      target: 4.5  },
    service_mail_rekla:  { label: 'E-Mail Rekla',        target: 4.0  },
    service_phone:       { label: 'Service Phone',       target: 4.7  },
    sales_phone:         { label: 'Sales Phone',         target: 4.85 },
    sales_lead:          { label: 'Sales Lead',          target: 4.5  },
  };

  // Farben (fix für bekannte Kanäle, Fallback grau)
  const channelColors: Record<string, string> = {
    service_mail:        '#2563EB', // Blau
    service_mail_rekla:  '#E11D48', // Rose
    service_phone:       '#16A34A', // Grün
    sales_phone:         '#F59E0B', // Amber
    sales_lead:          '#8B5CF6', // Violett
  };

  // Ø-Regel
  function avgScore(f: FeedbackItem) {
    const parts = [
      f.beraterfreundlichkeit,
      f.beraterqualifikation,
      f.angebotsattraktivitaet,
    ].filter((n): n is number => Number.isFinite(n as number) && (n as number) >= 1);
    if (parts.length >= 2) return parts.reduce((s, n) => s + n, 0) / parts.length;
    if (typeof f.bewertung === 'number' && f.bewertung >= 1) return f.bewertung;
    return null;
  }

  const noteColor = (v: number | null | undefined) =>
    !Number.isFinite(v as any) ? 'text-gray-500'
      : (v as number) >= 4.75 ? 'text-emerald-600'
      : (v as number) >= 4.5 ? 'text-green-600'
      : (v as number) >= 4.0 ? 'text-amber-600'
      : 'text-red-600';

  /* ---- Gamification: Level ---- */
  function levelFor(avg: number, target: number) {
    const d = avg - target;
    if (d >= 0.35) return { name:'Diamant', class:'bg-cyan-300 text-cyan-900', icon:'💎' };
    if (d >= 0.20) return { name:'Platin',  class:'bg-indigo-300 text-indigo-900', icon:'🏅' };
    if (d >= 0.00) return { name:'Gold',    class:'bg-yellow-400 text-yellow-900', icon:'🏆' };
    if (d >= -0.15) return { name:'Silber', class:'bg-gray-300 text-gray-900',     icon:'🥈' };
    if (d >= -0.30) return { name:'Bronze', class:'bg-amber-300 text-amber-900',   icon:'🥉' };
    return { name:'Starter', class:'bg-gray-200 text-gray-700', icon:'✨' };
  }
  const barClass = (pct: number) =>
    pct >= 100 ? 'bg-emerald-500' : pct >= 95 ? 'bg-green-500' : pct >= 85 ? 'bg-amber-500' : 'bg-red-500';

  /* ---- Laden: Feedback ---- */
  async function loadFeedback() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const r = await authedFetch(`/api/me/feedback${qs.toString() ? `?${qs.toString()}` : ''}`);
      const j: FeedbackRes = await r.json().catch(() => ({ ok: false, items: [] }));
      const rows = j?.ok && Array.isArray(j.items) ? j.items : [];
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadFeedback(); }, []);
  useEffect(() => { loadFeedback(); }, [from, to]);

  /* ---- Laden: Kanal-Config (Server) & Union bilden ---- */
  useEffect(() => {
    (async () => {
      try {
        const r = await authedFetch('/api/me/channel-config', { cache: 'no-store' });
        const j = await r.json().catch(() => null);
        const fromApi: ChannelCfg = (j?.ok && j.config) ? j.config : {};
        // Kanäle aus Feedback
        const seen = new Set<string>(items.map(it => it.feedbacktyp).filter(Boolean));
        // Union + Default-Fallback
        const all = new Set<string>([...Object.keys(fromApi || {}), ...seen, ...Object.keys(DEFAULTS)]);
        const merged: ChannelCfg = {};
        for (const ch of all) {
          const cur = fromApi[ch] ?? DEFAULTS[ch] ?? { label: ch, target: 4.5 };
          merged[ch] = {
            label: (cur.label ?? ch) || ch,
            target: Number.isFinite(cur.target) ? cur.target : 4.5,
          };
        }
        setChannelCfg(merged);
        setChannelKeys([...all].sort());
      } catch {
        // Fallback nur aus Feedback + Defaults
        const seen = new Set<string>(items.map(it => it.feedbacktyp).filter(Boolean));
        const all = new Set<string>([...seen, ...Object.keys(DEFAULTS)]);
        const merged: ChannelCfg = {};
        for (const ch of all) {
          const cur = DEFAULTS[ch] ?? { label: ch, target: 4.5 };
          merged[ch] = { label: cur.label ?? ch, target: cur.target ?? 4.5 };
        }
        setChannelCfg(merged);
        setChannelKeys([...all].sort());
      }
    })();
  }, [items.map(i => i.feedbacktyp).join('|')]);

  // Ableitungen aus channelCfg
  const targets: Record<string, number> = useMemo(() => {
    const t: Record<string, number> = {};
    for (const k of Object.keys(channelCfg)) t[k] = channelCfg[k].target;
    // für Chart-Komponente sicherstellen:
    t.unknown = t.unknown ?? 4.5;
    return t;
  }, [channelCfg]);

  const typeLabel: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    for (const k of Object.keys(channelCfg)) m[k] = channelCfg[k].label || k;
    return m;
  }, [channelCfg]);

  /* ------- Monats-Aggregation ------- */
  type DayGroup = { key: string; items: FeedbackItem[]; normAvg: number; pass: boolean };
  type MonthAgg = {
    monthKey: string;
    label: string;
    items: FeedbackItem[];
    byType: Map<string, { count:number; sum:number; avg:number; pass:boolean }>;
    overallAvg: number;
    overallCount: number;
    overallPass: boolean;
    days: DayGroup[];
    badges: string[];
    xp: number;
    openInternal: number;
    internalPreview: {
      id: string|number;
      dayKey: string;
      dateDisplay: string;
      label: string;
      excerpt: string;
    }[];
  };

  const months: MonthAgg[] = useMemo(() => {
    const map = new Map<string, FeedbackItem[]>();
    for (const f of items) {
      const iso = getTs(f);
      const d = iso ? new Date(iso) : null;
      if (!d || isNaN(d.getTime())) continue;
      const key = ymKeyBerlin(d);
      const arr = map.get(key) ?? [];
      arr.push(f); map.set(key, arr);
    }

    const base: MonthAgg[] = [];
    for (const [monthKey, arr] of map.entries()) {
      const byType = new Map<string, { count:number; sum:number; avg:number; pass:boolean }>();
      const vals:number[] = [];
      const reklaVals:number[] = [];

      arr.forEach(f => {
        const t = f.feedbacktyp || 'unknown';
        const a = avgScore(f);
        if (!Number.isFinite(a as any)) return;
        vals.push(a as number);
        if (isTrueish(f.rekla)) reklaVals.push(a as number);
        const prev = byType.get(t) ?? { count:0, sum:0, avg:0, pass:false };
        prev.count++; prev.sum += a as number;
        byType.set(t, prev);
      });

      byType.forEach((v, t) => {
        v.avg = v.count ? v.sum / v.count : 0;
        const goal = targets[t] ?? targets.unknown ?? 4.5;
        v.pass = v.count > 0 && v.avg >= goal;
      });

      const overallAvg = vals.length ? vals.reduce((s,n)=>s+n,0)/vals.length : 0;
      const overallCount = vals.length;
      const overallPass = Array.from(byType.entries()).every(([t, v]) => {
        const goal = targets[t] ?? targets.unknown ?? 4.5;
        return v.count === 0 ? true : v.avg >= goal;
      });

      // Tage
      const byDay = new Map<string, FeedbackItem[]>();
      arr.forEach(f => {
        const iso = getTs(f);
        const d = iso ? new Date(iso) : null;
        if (!d) return;
        const k = ymdBerlin(d);
        const a = byDay.get(k) ?? []; a.push(f); byDay.set(k, a);
      });
      const days: DayGroup[] = [];
      for (const [k, list] of byDay.entries()) {
        const ratios:number[] = [];
        list.forEach(f=>{
          const s = avgScore(f);
          if (!Number.isFinite(s as any)) return;
          const t = targets[f.feedbacktyp] ?? targets.unknown ?? 4.5;
          ratios.push(Number(s)/t);
        });
        const normAvg = ratios.length ? ratios.reduce((a,b)=>a+b,0)/ratios.length : 0;
        days.push({ key:k, items:list, normAvg, pass: normAvg >= 1 });
      }
      days.sort((a,b)=> a.key < b.key ? 1 : -1);

      // Badges
      const badges:string[] = [];
      if (overallAvg >= 4.9 && overallCount >= 5) badges.push('🌟 Perfekter Monat');
      if (reklaVals.length >= 3) {
        const avgRekla = reklaVals.reduce((s,n)=>s+n,0)/reklaVals.length;
        const targetRekla = targets.service_mail_rekla ?? 4.0;
        if (avgRekla >= targetRekla) badges.push('🛡️ Hero of Rekla');
      }

      // Interne Notizen
      const openInternalItems = arr.filter(x =>
        (x.internal_note?.trim() ?? '').length > 0 && !isTrueish(x.internal_checked)
      );
      const openInternal = openInternalItems.length;
      const internalPreview = openInternalItems.slice(0, 3).map(i => {
        const iso = getTs(i);
        const d = iso ? new Date(iso) : null;
        const dayKey = d ? ymdBerlin(d) : '';
        const dateDisplay = d
          ? new Intl.DateTimeFormat('de-DE', { timeZone: FE_TZ, day:'2-digit', month:'2-digit', year:'numeric' }).format(d)
          : '';
        const label = i.template_name ?? (typeLabel[i.feedbacktyp] ?? i.feedbacktyp ?? '—');
        const excerpt = (i.internal_note ?? '').trim().slice(0, 90);
        return { id: i.id, dayKey, dateDisplay, label, excerpt };
      });

      const [y,m] = monthKey.split('-');
      base.push({
        monthKey,
        label: `${m}/${y}`,
        items: arr,
        byType,
        overallAvg,
        overallCount,
        overallPass,
        days,
        badges,
        xp: 0,
        openInternal,
        internalPreview,
      });
    }

    if (base.length === 0) return base;

    // fehlende Monate füllen
    const asc = [...base].sort((a,b)=> a.monthKey.localeCompare(b.monthKey));
    let cur = asc[0].monthKey;
    const end = asc[asc.length-1].monthKey;
    const have = new Set(base.map(m => m.monthKey));

    const filled = [...base];
    while (cur !== end) {
      cur = incMonthKey(cur);
      if (!have.has(cur)) {
        const [y,m] = cur.split('-');
        filled.push({
          monthKey: cur,
          label: `${m}/${y}`,
          items: [],
          byType: new Map(),
          overallAvg: 0,
          overallCount: 0,
          overallPass: false,
          days: [],
          badges: [],
          xp: 0,
          openInternal: 0,
          internalPreview: [],
        });
      }
    }

    return filled.sort((a,b)=> a.monthKey < b.monthKey ? 1 : -1);
  }, [items, targets, typeLabel]);

  /* ------- XP & Combo ------- */
  const withXp = useMemo(() => {
    const clone = months.map(m => ({ ...m, xp: 0 }));
    const chrono = [...clone].reverse(); // ältester → neuester
    let combo = 0;
    for (let i = 0; i < chrono.length; i++) {
      const m = chrono[i];
      combo = m.overallPass ? Math.min(combo + 1, 5) : 0; // 0..5
      const multiplier = 1 + combo * 0.1;                 // 1.0 .. 1.5
      // Monatspunkte
      let monthXp = 0;
      for (const f of m.items) {
        const s = avgScore(f);
        if (!Number.isFinite(s as any)) continue;
        const t = targets[f.feedbacktyp] ?? targets.unknown ?? 4.5;
        const base = Math.max(0, Math.round((Number(s) - t) * 20));
        monthXp += Math.round(base * multiplier);
      }
      m.xp = monthXp;
      // Comeback
      const prev = chrono[i-1];
      if (m.overallPass && prev && !prev.overallPass) {
        if (!m.badges.includes('🔁 Comeback')) m.badges.push('🔁 Comeback');
      }
    }
    return clone;
  }, [months, targets]);

  const seasonXp = useMemo(() => withXp.reduce((s,m) => s + (m.xp||0), 0), [withXp]);
  function levelFromXp(xp:number) {
    if (xp < 250) return { level: 1, cur: xp, next: 250 };
    let lvl = 2, need = 250;
    let rest = xp - 250;
    const step = 100;
    while (rest >= step) { rest -= step; lvl++; need += step; }
    return { level: lvl, cur: rest, next: step };
  }
  const lvl = levelFromXp(seasonXp);

  /* ------- Streaks ------- */
  const overallStreak = useMemo(()=>{
    let cur=0, best=0;
    for (const m of withXp) { if (m.overallPass) { cur++; best=Math.max(best,cur); } else cur=0; }
    return { current: cur, best };
  }, [withXp]);

  const perTypeStreaks = useMemo(()=>{
    const types = new Set<string>(channelKeys);
    const res = new Map<string,{current:number;best:number}>();
    for (const t of types) {
      let cur=0, best=0;
      for (const m of withXp) {
        const v = m.byType.get(t);
        const pass = v ? v.pass : false;
        if (pass) { cur++; best=Math.max(best,cur); } else cur=0;
      }
      res.set(t,{current:cur,best});
    }
    return res;
  }, [withXp, channelKeys]);

  // Tages-Score-Verlauf (Berlin-Zeit, Ø pro Tag) + 5-Tage-MA
  const trendData = useMemo(() => {
    const byDay = new Map<string, number[]>();
    for (const f of items) {
      const iso = getTs(f);
      if (!iso) continue;
      const d = new Date(iso);
      if (isNaN(d.getTime())) continue;
      const k = ymdBerlin(d);
      const s = avgScore(f);
      if (!Number.isFinite(s as any)) continue;
      const arr = byDay.get(k) ?? [];
      arr.push(Number(s));
      byDay.set(k, arr);
    }
    const keys = [...byDay.keys()].sort();
    return keys.map(k => {
      const arr = byDay.get(k) ?? [];
      const avg = arr.reduce((a,b)=>a+b,0)/Math.max(1,arr.length);
      return { date: k, x: new Date(k + 'T00:00:00Z'), score: Number(avg.toFixed(2)) };
    });
  }, [items]);

  const trendWithMA = useMemo(() => {
    const win = 5;
    const arr = trendData;
    return arr.map((p, i) => {
      const s = Math.max(0, i - (win - 1));
      const slice = arr.slice(s, i + 1);
      const ma = slice.reduce((sum, c) => sum + c.score, 0) / slice.length;
      return { ...p, ma: Number(ma.toFixed(2)) };
    });
  }, [trendData]);

  // Monats-Verlauf: Ø je Kanal (inkl. sales_lead)
  const monthlyTrend = useMemo(() => {
    const asc = [...(months ?? [])].sort((a,b)=> a.monthKey.localeCompare(b.monthKey)); // älteste → neueste
    return asc.map(m => ({
      monthKey: m.monthKey,
      label: m.label,
      service_mail: m.byType.get('service_mail')?.avg ?? null,
      service_mail_rekla: m.byType.get('service_mail_rekla')?.avg ?? null,
      service_phone: m.byType.get('service_phone')?.avg ?? null,
      sales_phone: m.byType.get('sales_phone')?.avg ?? null,
      sales_lead: m.byType.get('sales_lead')?.avg ?? null,
      // optional Counts
      c_service_mail: m.byType.get('service_mail')?.count ?? 0,
      c_service_mail_rekla: m.byType.get('service_mail_rekla')?.count ?? 0,
      c_service_phone: m.byType.get('service_phone')?.count ?? 0,
      c_sales_phone: m.byType.get('sales_phone')?.count ?? 0,
      c_sales_lead: m.byType.get('sales_lead')?.count ?? 0,
    }));
  }, [months]);

  // open states
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  const toggleMonth = (k:string)=> setOpenMonths(p=>({ ...p, [k]: !p[k] }));
  const toggleDay = (k:string)=> setOpenDays(p=>({ ...p, [k]: !p[k] }));

  return (
    <section className="p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Kunden-Feedback</h2>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 text-sm" />
          <span className="text-gray-400">–</span>
          <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="px-2 py-1.5 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 text-sm" />
        </div>
      </div>

      {/* KI-Panel */}
      <AiSummaryPanel items={items} from={from} to={to} />

      {loading && <div className="text-sm text-gray-500">Lade…</div>}

      {!loading && (
        <>
          {/* Übersicht + Streaks + Season-XP */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-800/40 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-end gap-4">
                <div>
                  <div className="text-xs text-gray-500">Monate im Zeitraum</div>
                  <div className="text-xl font-semibold">{(withXp ?? []).length}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Gesamt-Streak (alle Ziele)</div>
                  <div className="text-xl font-semibold">
                    {overallStreak.current} <span className="text-sm text-gray-500">/ best {overallStreak.best}</span>
                  </div>
                </div>
                {/* Offene interne Notizen */}
                <div>
                  <div className="text-xs text-gray-500">Offene interne Notizen</div>
                  <div className="text-xl font-semibold text-amber-600">
                    {(withXp ?? []).reduce((s,m)=> s + (m.openInternal||0), 0)}
                  </div>
                </div>
              </div>

              {/* Season XP */}
              <div className="min-w-[260px]">
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-medium">Season-XP</div>
                  <div className="text-xs text-gray-500">Level {lvl.level}</div>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, (lvl.cur / (lvl.next||1))*100)}%` }} />
                </div>
                <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">{lvl.cur} / {lvl.next} XP · gesamt {seasonXp}</div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {Array.from(perTypeStreaks.entries()).map(([t, s])=>(
                  <span key={t} className="text-xs rounded-full px-2 py-1 bg-blue-600/10 text-blue-700 dark:text-blue-300">
                    {(typeLabel[t] ?? t)}: <b>{s.current}</b> / {s.best}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Monats-Verlauf (Ø je Kanal) */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-900 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div className="text-sm font-medium">Verlauf pro Monat (Ø je Kanal)</div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                {([
                  ['service_mail_rekla', typeLabel.service_mail_rekla ?? 'E-Mail Rekla'],
                  ['service_mail',       typeLabel.service_mail ?? 'E-Mail Service'],
                  ['sales_phone',        typeLabel.sales_phone ?? 'Sales Phone'],
                  ['service_phone',      typeLabel.service_phone ?? 'Service Phone'],
                  ['sales_lead',         typeLabel.sales_lead ?? 'Sales Lead'],
                ] as const).map(([k, label]) => (
                  <span key={k} className="inline-flex items-center gap-1">
                    <span className="inline-block w-4 h-1.5 rounded-full" style={{ background: channelColors[k] ?? '#64748b' }} />
                    <span>{label}</span>
                    {targets[k] != null && (
                      <span className="opacity-60">· Ziel {targets[k].toFixed(2)}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            <YearScoreTrend
              data={monthlyTrend}
              targets={targets}
              labelMap={typeLabel}
              colors={channelColors}
            />
          </div>

          {/* Monate */}
          {(withXp ?? []).length === 0 ? (
            <div className="text-sm text-gray-500">Keine Daten im Zeitraum.</div>
          ) : (
            <ul className="space-y-3">
              {(withXp ?? []).map((m)=> {
                const mOpen = !!openMonths[m.monthKey];
                return (
                  <li key={m.monthKey} className="rounded-xl border border-gray-200 dark:border-gray-800">
                    {/* Month header */}
                    <button onClick={()=>toggleMonth(m.monthKey)} className="w-full px-3 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-base font-semibold">{m.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${m.overallPass ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                          {m.overallPass ? 'alle Ziele erreicht' : 'unter Ziel'}
                        </span>
                        <span className="text-xs text-gray-500">{m.overallCount} Feedbacks</span>
                        {m.openInternal > 0 && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            {m.openInternal} intern
                          </span>
                        )}
                        {m.badges.length > 0 && (
                          <span className="text-xs text-amber-700 dark:text-amber-300">· {m.badges.join(' · ')}</span>
                        )}
                      </div>
                      <span className="text-gray-400">{mOpen ? '▾' : '▸'}</span>
                    </button>

                    {/* Month body */}
                    {mOpen && (
                      <div className="px-3 pb-3">
                        {/* Interne Notizen Preview */}
                        {m.openInternal > 0 && (
                          <div className="mb-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-900/10 p-3">
                            <div className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1 text-center">
                              Offene interne Notizen ({m.openInternal})
                            </div>
                            <ul className="space-y-1 text-center">
                              {(m.internalPreview ?? []).map(p => (
                                <li key={String(p.id)} className="text-sm text-amber-900 dark:text-amber-200">
                                  <button
                                    className="inline-flex items-baseline gap-2 hover:opacity-90"
                                    onClick={()=>{
                                      setOpenMonths(prev=>({ ...prev, [m.monthKey]: true }));
                                      const dayOpenKey = `${m.monthKey}:${p.dayKey}`;
                                      setOpenDays(prev=>({ ...prev, [dayOpenKey]: true }));
                                      setTimeout(()=>{
                                        const el = document.getElementById(`fb-${String(p.id)}`);
                                        if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
                                      }, 50);
                                    }}
                                    title="Zum Feedback springen"
                                  >
                                    <span className="font-semibold">{p.dateDisplay}</span>
                                    <span className="text-amber-700/70 dark:text-amber-300/70"> · {p.label} · </span>
                                    <span className="opacity-90">{p.excerpt}{p.excerpt.length >= 90 ? '…' : ''}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* KPI per type for this month */}
                        <div className="grid gap-3 sm:grid-cols-2">
                          {Array.from(m.byType?.entries?.() ?? []).sort((a,b)=>a[0].localeCompare(b[0])).map(([type, v])=>{
                            const label = typeLabel[type] ?? type;
                            const target = targets[type] ?? targets.unknown ?? 4.5;
                            const pct = Math.max(0, Math.min(100, (v.avg/target)*100));
                            const lvlMeta = levelFor(v.avg, target);
                            return (
                              <div key={type} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-medium">{label}</div>
                                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${lvlMeta.class}`} title={`Level: ${lvlMeta.name}`}>{lvlMeta.icon} {lvlMeta.name}</span>
                                </div>
                                <div className="mt-1 flex items-baseline gap-2">
                                  <span className={`text-xl font-semibold ${noteColor(v.avg)}`}>{v.avg.toFixed(2)}</span>
                                  <span className="text-xs text-gray-500">Ziel ≥ {target.toFixed(2)}</span>
                                  <span className={`ml-auto text-xs ${v.pass ? 'text-emerald-600' : 'text-gray-500'}`}>{v.count}x</span>
                                </div>
                                <div className="mt-2 h-2 w-full rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                                  <div className={`h-full ${barClass(pct)}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                          {(!m.byType || m.byType.size === 0) && <div className="text-sm text-gray-500">Keine Bewertungen in diesem Monat.</div>}
                        </div>

                        {/* Days accordion */}
                        <div className="mt-4">
                          <div className="text-sm font-medium mb-1">Tage</div>
                          <ul className="space-y-2">
                            {(m.days ?? []).map(d=>{
                              const dKey = `${m.monthKey}:${d.key}`;
                              const dOpen = !!openDays[dKey];
                              const pct = Math.max(0, Math.min(100, d.normAvg*100));
                              const openInternal = (d.items ?? []).filter(x =>
                                (x.internal_note?.trim() ?? '').length > 0 && !isTrueish(x.internal_checked)
                              ).length;
                              const head = new Date(d.key+'T00:00:00Z').toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit' });
                              return (
                                <li key={dKey} className="rounded-lg border border-gray-200 dark:border-gray-800">
                                  <button onClick={()=>toggleDay(dKey)} className="w-full px-3 py-2 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <span className="font-medium">{head}</span>
                                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${d.pass ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                                        {d.pass ? 'Ziel erreicht' : 'unter Ziel'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {openInternal > 0 && (
                                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                          {openInternal} intern
                                        </span>
                                      )}
                                      <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className="text-xs text-gray-500">{(d.items ?? []).length}x</span>
                                      <span className="text-gray-400">{dOpen ? '▾' : '▸'}</span>
                                    </div>
                                  </button>

                                  {/* Tages-Tabelle */}
                                  {dOpen && (
                                    <div className="px-3 pb-3">
                                      <DayScoresTable items={d.items ?? []} />
                                    </div>
                                  )}

                                  {/* Detailkarten */}
                                  {dOpen && (
                                    <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                                      {(d.items ?? []).map((f)=> (
                                        <FeedbackItemRow
                                          key={String(f.id ?? Math.random())}
                                          f={f}
                                          avg={avgScore(f)}
                                          labelMap={typeLabel}
                                          noteColor={noteColor}
                                        />
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* ===========================
   Tages-Tabelle
=========================== */
function DayScoresTable({ items }: { items: FeedbackItem[] | undefined | null }) {
  const safe = Array.isArray(items) ? items : [];

  const cols = [
    { key: 'bewertung',               label: 'Bewertung' },
    { key: 'beraterfreundlichkeit',   label: 'Beraterfreundlichkeit' },
    { key: 'beraterqualifikation',    label: 'Beraterqualifikation' },
    { key: 'angebotsattraktivitaet',  label: 'Beratungsangebotsattraktivität' },
  ] as const;

  const numOrNull = (v:any) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? n : null;
  };

  const avgOf = (arr:(number|null)[]) => {
    const nums = arr.filter((x): x is number => Number.isFinite(x as number));
    return nums.length ? (nums.reduce((s,n)=>s+n,0)/nums.length) : null;
  };

  const rowData = safe.map((f) => {
    const v = (k: (typeof cols)[number]['key']) => numOrNull((f as any)[k]);
    const rowVals = cols.map(c => v(c.key));
    const parts = [v('beraterfreundlichkeit'), v('beraterqualifikation'), v('angebotsattraktivitaet')]
      .filter((x): x is number => Number.isFinite(x as number));
    const rowAvg = parts.length >= 2 ? (parts.reduce((s,n)=>s+n,0)/parts.length) : v('bewertung');
    return { f, rowVals, rowAvg };
  });

  const colAvgs = cols.map((c, i) => avgOf(rowData.map(r => r.rowVals[i])));
  const dayAvg  = avgOf(rowData.map(r => r.rowAvg));

  const fmt = (n: number|null) => Number.isFinite(n as number) ? (n as number).toFixed(2) : '–';

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/40 overflow-x-auto">
      <table className="min-w-[640px] w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Kanal</th>
            {cols.map(c => (
              <th key={c.key} className="text-right px-3 py-2 font-medium">{c.label}</th>
            ))}
            <th className="text-right px-3 py-2 font-medium">Ø</th>
          </tr>
        </thead>
        <tbody>
          {rowData.map(({ f, rowVals, rowAvg }) => (
            <tr key={String(f.id)} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {f.feedbacktyp}
                </span>
                {(f.internal_note?.trim()?.length ?? 0) > 0 && (
                  <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    intern
                  </span>
                )}
              </td>
              {rowVals.map((v, i) => (
                <td key={i} className="px-3 py-2 text-right tabular-nums">
                  {v === null
                    ? <span className="text-gray-400 line-through">0.00</span>
                    : fmt(v)}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-medium tabular-nums">{fmt(rowAvg)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
            <td className="px-3 py-2 text-right"><span className="text-xs text-gray-500">Tages-Ø</span></td>
            {colAvgs.map((a, i) => (
              <td key={i} className="px-3 py-2 text-right font-medium tabular-nums">
                {fmt(a)}
              </td>
            ))}
            <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(dayAvg)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ===========================
   Kommentare
=========================== */
function FeedbackComments({ feedbackId }: { feedbackId: number|string }) {
  const [items, setItems] = useState<Array<{id:number; body:string; author:string; created_at:string; unread?:boolean}>>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    const r = await authedFetch(`/api/feedback/${feedbackId}/comments`);
    const j = await r.json();
    setItems(Array.isArray(j?.items) ? j.items : []);
  }
  async function send() {
    if (!draft.trim()) return;
    setLoading(true);
    try {
      const r = await authedFetch(`/api/feedback/${feedbackId}/comments`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ body: draft.trim() }),
      });
      if (r.ok) { setDraft(''); await load(); }
    } finally { setLoading(false); }
  }
  useEffect(()=>{ load(); }, [feedbackId]);

  return (
    <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-gray-50/60 dark:bg-gray-800/30">
      <div className="text-xs font-medium mb-2">Kommentare</div>
      <ul className="space-y-2 max-h-60 overflow-auto">
        {items.map(it=>(
          <li key={it.id} className="text-sm">
            <span className="font-medium">{it.author}</span>
            <span className="text-gray-500"> · {new Date(it.created_at).toLocaleString('de-DE')}</span>
            <p className="whitespace-pre-wrap">{it.body}</p>
          </li>
        ))}
        {items.length===0 && <li className="text-xs text-gray-500">Noch keine Kommentare.</li>}
      </ul>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={e=>setDraft(e.target.value)}
          placeholder="Kommentar schreiben…"
          className="flex-1 px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10"
        />
        <button onClick={send} disabled={loading||!draft.trim()}
          className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-60">
          Senden
        </button>
      </div>
    </div>
  );
}

/* ===========================
   Labels
=========================== */
function LabelChips({ feedbackId, labels, onChange }:{
  feedbackId: number|string;
  labels: Array<{id:number; name:string; color?:string}>;
  onChange?: (next: any)=> void;
}) {
  const [all, setAll] = useState<Array<{id:number; name:string; color?:string}>>([]);
  const [attached, setAttached] = useState<number[]>(labels.map(l=>l.id));

  useEffect(()=>{(async()=>{
    const r = await authedFetch(`/api/labels`);
    const j = await r.json();
    setAll(Array.isArray(j?.items) ? j.items : [
      {id:1,name:'Best Practice',color:'#22c55e'},
      {id:2,name:'Besondere Lösung',color:'#3b82f6'},
      {id:3,name:'Wissenswert',color:'#f59e0b'},
    ]);
  })();},[]);

  async function add(labelId:number){
    await authedFetch(`/api/feedback/${feedbackId}/labels`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ label_id: labelId })
    });
    const next = [...new Set([...attached, labelId])];
    setAttached(next); onChange?.(next);
  }
  async function remove(labelId:number){
    await authedFetch(`/api/feedback/${feedbackId}/labels/${labelId}`, { method:'DELETE' });
    const next = attached.filter(id=>id!==labelId);
    setAttached(next); onChange?.(next);
  }

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      {all.filter(l=>attached.includes(l.id)).map(l=>(
        <button key={l.id} onClick={()=>remove(l.id)}
          className="text-[11px] px-2 py-1 rounded-full border"
          style={{ borderColor: l.color||'#ddd', background: '#fff' }}>
          {l.name} ×
        </button>
      ))}
      <div className="relative">
        <details>
          <summary className="text-[11px] px-2 py-1 rounded-full bg-gray-100 cursor-pointer">Label hinzufügen</summary>
          <div className="absolute z-10 mt-2 p-2 rounded-lg border bg-white shadow">
            <ul className="min-w-[180px]">
              {all.filter(l=>!attached.includes(l.id)).map(l=>(
                <li key={l.id}>
                  <button onClick={()=>add(l.id)} className="w-full text-left px-2 py-1 hover:bg-gray-50">
                    <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: l.color||'#999' }} />
                    {l.name}
                  </button>
                </li>
              ))}
              {all.length===0 && <li className="px-2 py-1 text-sm text-gray-500">Keine Labels</li>}
            </ul>
          </div>
        </details>
      </div>
    </div>
  );
}

/* ===========================
   Einzelzeile
=========================== */
function FeedbackItemRow({
  f,
  avg,
  labelMap,
  noteColor,
}: {
  f: FeedbackItem;
  avg: number | null;
  labelMap: Record<string,string>;
  noteColor: (v:number|null|undefined)=>string;
}) {
  const [internalChecked, setInternalChecked] = useState(!!f.internal_checked);

  const lbl = labelMap[f.feedbacktyp] ?? f.feedbacktyp ?? '—';
  const ch = f.feedbacktyp;
  const iso = getTs(f);
  const dt = fmtTimeBerlin(iso);
  const dd = fmtDateBerlin(iso);

  const hasInternal = !!(f.internal_note && f.internal_note.trim());
  const highlight = hasInternal && !internalChecked
    ? 'border-l-4 border-amber-400 pl-2 bg-amber-50 dark:bg-amber-900/10'
    : '';

  const bo = boLinkFor(f);

  async function toggleInternalChecked() {
    const next = !internalChecked;
    setInternalChecked(next);
    try {
      await authedFetch(`/api/me/feedback/${f.id}/note-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked: next }),
      });
    } catch {
      setInternalChecked(!next);
      alert('Konnte internen Kommentar nicht aktualisieren.');
    }
  }

  return (
    <li id={`fb-${String(f.id)}`} className={`px-3 py-3 flex items-start justify-between gap-3 ${highlight}`}>
      {/* linke Spalte */}
      <div className="min-w-0 flex-1">
        {/* Kopfzeile: Label + Chips */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{lbl}</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" title="Kanal">{ch}</span>

            {isTrueish(f.rekla) && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-300">
                Rekla
              </span>
            )}

            <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${isTrueish(f.geklaert)
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
              {isTrueish(f.geklaert) ? 'geklärt' : 'offen'}
            </span>

            {hasInternal && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full
                ${internalChecked ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
                intern
              </span>
            )}
          </div>

          {/* rechte Chip-Gruppe: BO + Zeit/Template */}
          <div className="shrink-0 flex items-center gap-2">
            {bo && (
              <a
                href={bo}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                title="Im Backoffice suchen"
              >
                🔎 Im BO suchen
              </a>
            )}
            <span className="text-[11px] px-2 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
              {dd} · {dt}
            </span>
            {f.template_name && (
              <span className="text-[11px] px-2 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                {f.template_name}
              </span>
            )}
          </div>
        </div>

        {/* Kundenkommentar */}
        {f.kommentar && (
          <div className="mt-2">
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {f.kommentar}
            </p>
          </div>
        )}

        {/* Interner Kommentar – zentriert */}
        {(f.internal_note && f.internal_note.trim()) && (
          <div className="mt-3 flex justify-center">
            <div className="w-full max-w-2xl rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-900/10 p-4 text-center">
              <div className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-2">
                Interner Kommentar
              </div>

              <p className="text-base text-amber-900 dark:text-amber-200 whitespace-pre-wrap leading-relaxed">
                {f.internal_note}
              </p>

              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={toggleInternalChecked}
                  aria-pressed={internalChecked}
                  className={[
                    "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors",
                    internalChecked
                      ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                      : "bg-white text-amber-800 border-amber-300 hover:bg-amber-50 dark:bg-transparent dark:text-amber-200 dark:border-amber-900"
                  ].join(' ')}
                  title={internalChecked ? "als erledigt markiert" : "als erledigt markieren"}
                >
                  <span className="text-lg leading-none">{internalChecked ? '✓' : '◻︎'}</span>
                  {internalChecked ? "Erledigt" : "Als erledigt markieren"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Labels */}
        <LabelChips feedbackId={Number(f.id)} labels={[]} />

        {/* Kommentare */}
        <FeedbackComments feedbackId={Number(f.id)} />
      </div>

      {/* rechte Spalte (Score) */}
      <div className="shrink-0 text-right pl-2">
        <div className={`text-lg font-semibold ${noteColor(avg)}`}>
          {Number.isFinite(avg as any) ? (avg as number).toFixed(2) : '–'}
        </div>
        <div className="text-xs text-gray-500">Score</div>
      </div>
    </li>
  );
}
