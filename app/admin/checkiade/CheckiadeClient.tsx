'use client';

import RichTextEditor from '@/app/components/RichTextEditor';
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  AreaChart, Area,
  PieChart, Pie, Cell, // <- NEU
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

/* =====================================================
   Tiny UI Primitives: Toasts + Confetti (no deps)
   ===================================================== */

type Toast = { id: number; title: string; description?: string; variant?: 'success'|'error'|'info' };

// Solid, typed React context for toasts
const ToasterCtx = createContext<{ add: (t: Omit<Toast,'id'>) => void } | null>(null);

export function useToaster(){
  const ctx = useContext(ToasterCtx);
  if (!ctx) throw new Error('useToaster must be used within <ToasterProvider>');
  return ctx;
}

function ToasterProvider({ children }: { children: React.ReactNode }){
  const [items, setItems] = useState<Toast[]>([]);
  const idRef = useRef(1);
  const add = useCallback((t: Omit<Toast,'id'>)=>{
    const id = idRef.current++;
    const toast: Toast = { id, ...t };
    setItems(prev => [...prev, toast]);
    setTimeout(()=> setItems(prev => prev.filter(x=>x.id!==id)), 3200);
  },[]);
  return (
    <ToasterCtx.Provider value={{ add }}>
      {children}
      <div className="fixed z-[100] right-4 bottom-4 flex flex-col gap-2">
        {items.map(t=> (
          <div key={t.id}
               className={`min-w-[260px] max-w-[320px] rounded-xl shadow-lg border p-3 text-sm backdrop-blur bg-white/90 dark:bg-gray-900/90 ${
                 t.variant==='success' ? 'border-green-300 text-green-900 dark:border-green-900 dark:text-green-200' :
                 t.variant==='error' ? 'border-red-300 text-red-900 dark:border-red-900 dark:text-red-200' :
                 'border-gray-200 dark:border-gray-700'
               }`}>
            <div className="font-medium">{t.title}</div>
            {t.description && <div className="text-xs opacity-75">{t.description}</div>}
          </div>
        ))}
      </div>
    </ToasterCtx.Provider>
  );
}

function useConfetti(){
  const [boom, setBoom] = useState(0);
  const trigger = useCallback(()=> setBoom(x=>x+1), []);
  return { boom, trigger };
}

function Confetti({ seed }: { seed:number }){
  const ref = useRef<HTMLCanvasElement|null>(null);
  useEffect(()=>{
    const cvs = ref.current; if(!cvs) return; 
    const ctxMaybe = cvs.getContext('2d');
    if (!(ctxMaybe instanceof CanvasRenderingContext2D)) return; // TS: ensure non-null context
    const ctx: CanvasRenderingContext2D = ctxMaybe;

    let raf:number; 
    const w = (cvs.width = window.innerWidth); 
    const h = (cvs.height = window.innerHeight);

    type Part = { x:number; y:number; vx:number; vy:number; rot:number; sz:number; life:number; hue:number };
    const N = 120; 
    const parts: Part[] = Array.from({length:N}, ()=>({
      x: w/2, y: h/2, vx: (Math.random()-0.5)*8, vy: (Math.random()-0.8)*8-6,
      rot: Math.random()*Math.PI, sz: 6+Math.random()*6, life: 0, hue: Math.floor(Math.random()*360)
    }));

    const start = performance.now();
    const tick = (t:number)=>{
      const dt = (t-start)/1000;
      ctx.clearRect(0,0,w,h);
      parts.forEach(p=>{
        p.vy += 0.15; p.x += p.vx; p.y += p.vy; p.rot += 0.1; p.life += 0.02;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
        ctx.fillStyle = `hsl(${p.hue} 80% 60%)`;
        ctx.fillRect(-p.sz/2, -p.sz/2, p.sz, p.sz);
        ctx.restore();
      });
      if (dt < 2.2) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return ()=> cancelAnimationFrame(raf);
  },[seed]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[80]" aria-hidden="true" />;
}


type ToggleProps = {
  id?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Wenn true, rendert <span role="switch"> statt <button> (für verschachtelte Button-Kontexte) */
  asChild?: boolean;
};

export function Toggle({
  id,
  checked,
  onChange,
  disabled,
  asChild = false,
}: ToggleProps) {
  const Comp: any = asChild ? 'span' : 'button';

  function handleActivate(e: React.MouseEvent | React.KeyboardEvent) {
    if (disabled) return;
    e.preventDefault();
    onChange(!checked);
  }

  return (
    <Comp
      id={id}
      type={asChild ? undefined : 'button'}
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={handleActivate}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (disabled) return;
        if (e.key === ' ' || e.key === 'Enter') handleActivate(e);
      }}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${checked ? 'bg-blue-600' : 'bg-gray-300'}
      `}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform
          ${checked ? 'translate-x-5' : 'translate-x-1'}
        `}
      />
    </Comp>
  );
}

/* ========= Types ========= */
export type ScoreRow = {
  id:number; year:number; month:number;
  productive_outage:number|null; lateness_minutes:number|null; efeedback_score:number|null; points:number;
  team_id:number; team_name:string;
};

export type WidgetConfig = {
  year: number;
  metric: 'productive_outage'|'lateness_minutes'|'efeedback_score'|'points';
  chart:  'line'|'bar'|'area'|'pie';
  teams?: number[];
  stacked?: boolean;
  title?: string;
  palette?: 'default'|'vibrant'|'pastel'|'monoBlue'|'monoGray'; // <- NEU
  reverseColors?: boolean; // <- NEU
};

export type WidgetRow = { id:string; name:string; config:any; created_at:string };

export type CheckiadeSettings = {
  announcement?: { kind:'md'|'html'; content:string };
  defaults?: Record<string, any>;
};

const card = 'rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm';
const inputBase = 'px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10';

/* ========= Collapsible Primitive ========= */
function Collapsible({
  title, defaultOpen=false, children
}:{ title:string; defaultOpen?:boolean; children:React.ReactNode }){
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={card}>
      <button
        type="button"
        onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-center justify-between"
        aria-expanded={open}
      >
        <div className="text-lg font-semibold">{title}</div>
        <span className={`transition-transform text-gray-500 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

/* ========= TeamsManager (optimistic) ========= */
function TeamsManager() {
  const [list, setList] = useState<{id:number; name:string}[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const { add } = useToaster();

  async function load() {
    const r = await fetch('/api/checkiade/teams', { cache:'no-store' });
    const j = await r.json().catch(()=>({items:[]}));
    setList(Array.isArray(j?.items) ? j.items : []);
  }
  useEffect(()=>{ load(); },[]);

  async function addTeam() {
    const n = name.trim(); if (!n) return;
    setBusy(true);
    const optimisticId = Math.max(0, ...list.map(l=>l.id))+1;
    setList(prev=> [...prev, { id: optimisticId, name: n }]);
    setName('');
    try {
      const r = await fetch('/api/checkiade/teams', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name: n }),
      });
      if(!r.ok) throw new Error('create failed');
      add({ variant:'success', title:'Team angelegt', description:`${n} wurde angelegt.` });
      await load();
    } catch (e:any) {
      add({ variant:'error', title:'Fehler beim Anlegen', description:e?.message ?? 'Unbekannter Fehler' });
      setList(prev=> prev.filter(x=>x.id!==optimisticId));
    } finally { setBusy(false); }
  }

  async function rename(id:number, newName:string) {
    const old = list.find(t=>t.id===id)?.name ?? '';
    setList(prev=> prev.map(t=> t.id===id? { ...t, name:newName }: t));
    try {
      const r = await fetch(`/api/checkiade/teams/${id}`, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name: newName }),
      });
      if(!r.ok) throw new Error('rename failed');
      add({ variant:'success', title:'Team umbenannt' });
    } catch (e:any) {
      add({ variant:'error', title:'Fehler beim Umbenennen' });
      setList(prev=> prev.map(t=> t.id===id? { ...t, name:old }: t));
    }
  }

  async function del(id:number) {
    const keep = list.find(t=>t.id===id);
    setList(prev=> prev.filter(t=>t.id!==id));
    try {
      const r = await fetch(`/api/checkiade/teams/${id}`, { method:'DELETE' });
      if(!r.ok) throw new Error('delete failed');
      add({ variant:'success', title:'Team gelöscht' });
    } catch (e:any) {
      add({ variant:'error', title:'Löschen fehlgeschlagen' });
      if (keep) setList(prev=> [...prev, keep]);
    }
  }

  return (
    <section className={card}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">Teams</div>
        <div className="flex items-center gap-2">
          <input className={inputBase} placeholder="Neues Team…" value={name} onChange={e=>setName(e.target.value)} />
          <button onClick={addTeam} disabled={busy || !name.trim()}
                  className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
            {busy ? 'Speichere…' : 'Anlegen'}
          </button>
        </div>
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {list.map(t=>(
          <li key={t.id} className="py-2 flex items-center gap-2">
            <input
              className={`${inputBase} flex-1`}
              defaultValue={t.name}
              onBlur={e=>{ const v = e.currentTarget.value.trim(); if (v && v !== t.name) rename(t.id, v); }}
            />
            <button onClick={()=>del(t.id)}
                    className="px-2 py-1 text-sm rounded border border-red-300 text-red-700 dark:border-red-900 dark:text-red-300">
              Löschen
            </button>
          </li>
        ))}
        {list.length===0 && <li className="py-2 text-sm text-gray-500">Noch keine Teams.</li>}
      </ul>
    </section>
  );
}

/* ========= Page ========= */
function AdminCheckiadeInner() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(thisYear);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { add } = useToaster();
  const { boom, trigger } = useConfetti();

  const [cfg, setCfg] = useState<WidgetConfig>({
    year,
    metric: 'points',
    chart: 'bar',
    stacked: true,
    title: 'Punkte je Team',
    palette: 'default',
    reverseColors: false,
  });

  async function loadScores(targetYear:number) {
    setLoading(true);
    const r = await fetch(`/api/checkiade/scores?year=${targetYear}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({ items: [] }));
    setScores(Array.isArray(j?.items) ? j.items : []);
    setLoading(false);
  }

  useEffect(() => { loadScores(year); }, [year]);

  // Simple gamification: track actions + streak
  useEffect(()=>{
    const key = 'checkiade:streak';
    const today = new Date().toISOString().slice(0,10);
    const raw = localStorage.getItem(key);
    const obj = raw ? JSON.parse(raw) : { last: null as string|null, streak: 0 };
    if (obj.last !== today) {
      const inc = obj.last && (new Date(today).getTime() - new Date(obj.last).getTime() === 86400000);
      const streak = inc ? obj.streak + 1 : 1;
      localStorage.setItem(key, JSON.stringify({ last: today, streak }));
      if (streak>0 && (streak===3 || streak===7 || streak%14===0)) {
        trigger();
        add({ variant:'success', title:`🔥 ${streak}-Tage-Admin-Streak!` });
      }
    }
  },[]);

  // Daten in Chart-Form bringen
  const chartData = useMemo(() => {
    const teams = new Map<number, string>();
    scores.forEach(s => teams.set(s.team_id, s.team_name));
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    const data = months.map(m => {
      const row: Record<string, number|string> = { name: m.toString().padStart(2,'0') };
      for (const [tid, tname] of teams) {
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
      const names = scores
        .filter(s => cfg.teams!.includes(s.team_id))
        .map(s => s.team_name);
      const uniq = Array.from(new Set(names));
      return data.map(d =>
        Object.fromEntries(Object.entries(d).filter(([k]) => k === 'name' || uniq.includes(k)))
      );
    }
    return data;
  }, [scores, cfg]);

  // verfügbare Teamnamen (für Filter)
  const teamOpts = useMemo(() => {
    const set = new Map<number,string>();
    scores.forEach(s => set.set(s.team_id, s.team_name));
    return Array.from(set.entries()).map(([id,name])=>({id,name}));
  }, [scores]);

  // === EIN-KIND-FIX: Chart als einzelnes Element liefern ===
  const seriesKeys = useMemo(
    () => Object.keys(chartData[0] ?? {}).filter(k => k !== 'name'),
    [chartData]
  );

  /* ========== Farben / Paletten ========== */
  const PALETTES: Record<NonNullable<WidgetConfig['palette']>, string[]> = {
    default:  ['#2563eb','#ea580c','#16a34a','#7c3aed','#dc2626','#0891b2','#f59e0b','#10b981','#6b7280'],
    vibrant:  ['#ff6b6b','#845ef7','#0ca678','#f59f00','#1e90ff','#d9480f','#12b886','#f03e3e','#5c7cfa'],
    pastel:   ['#9ec5fe','#eebefa','#b2f2bb','#ffd8a8','#b2f0e6','#ffd6e0','#e6fcf5','#fff3bf','#e9ecef'],
    monoBlue: ['#003f5c','#2f4b7c','#665191','#a05195','#d45087','#f95d6a','#ff7c43','#ffa600'],
    monoGray: ['#111827','#1f2937','#374151','#4b5563','#6b7280','#9ca3af','#d1d5db','#e5e7eb'],
  };
  function getColors(c: WidgetConfig, n:number){
    const base = PALETTES[c.palette ?? 'default'];
    const arr = Array.from({length:n}, (_,i)=> base[i % base.length]);
    return c.reverseColors ? arr.slice().reverse() : arr;
  }

  function renderChart(): ReactElement {
    if (!chartData.length && cfg.chart !== 'pie') return <div />;
    const colors = getColors(cfg, seriesKeys.length);

    if (cfg.chart === 'line') {
      return (
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
          {seriesKeys.map((k, idx) => (
            <Line key={k} type="monotone" dataKey={k} stroke={colors[idx]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      );
    }
    if (cfg.chart === 'bar') {
      return (
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
          {seriesKeys.map((k, idx) => (
            <Bar key={k} dataKey={k} stackId={cfg.stacked ? 'a' : undefined} fill={colors[idx]} />
          ))}
        </BarChart>
      );
    }
    if (cfg.chart === 'area') {
      return (
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
          {seriesKeys.map((k, idx) => (
            <Area key={k} type="monotone" dataKey={k} stackId={cfg.stacked ? 'a' : undefined} stroke={colors[idx]} fill={colors[idx]} />
          ))}
        </AreaChart>
      );
    }
    // pie: Jahres-Summen
    const pieData = summarizeYear(scores, cfg);
    const pieColors = getColors(cfg, pieData.length);
    return (
      <PieChart>
        <Tooltip /><Legend />
        <Pie dataKey="value" nameKey="name" data={pieData} label>
          {pieData.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}
        </Pie>
      </PieChart>
    );
  }

  return (
  <>
    {boom>0 && <Confetti seed={boom} />}
    <div className="container max-w-7xl mx-auto py-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">CHECKiade – Admin</h1>
        <div className="flex items-center gap-4">
          <GamificationBadge />
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Jahr:</label>
            <input
              type="number"
              className={`${inputBase} w-24`}
              value={year}
              onChange={e=>setYear(Number(e.target.value)||new Date().getFullYear())}
            />
          </div>
        </div>
      </header>

      {/* Dashboard (Widget-Builder + Preview) */}
      <section className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Dashboard</h2>
          {loading && <div className="text-sm text-gray-500">lädt…</div>}
        </div>

        <div className="grid md:grid-cols-[320px_1fr] gap-6">
          {/* Builder */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
            <div className="text-sm font-medium mb-2">Widget konfigurieren</div>

            <label className="grid gap-1 mb-2">
              <span className="text-xs text-gray-500">Titel</span>
              <input
                className={inputBase}
                value={cfg.title ?? ''}
                onChange={e=>setCfg({...cfg, title:e.target.value})}
              />
            </label>

            <label className="grid gap-1 mb-2">
              <span className="text-xs text-gray-500">Kennzahl</span>
              <select
                className={inputBase}
                value={cfg.metric}
                onChange={e=>setCfg({...cfg, metric: e.target.value as WidgetConfig['metric']})}
              >
                <option value="points">Punkte</option>
                <option value="productive_outage">Produktive Ausfallquote (%)</option>
                <option value="lateness_minutes">Verspätungen (Min.)</option>
                <option value="efeedback_score">eFeedback (Ø)</option>
              </select>
            </label>

            <label className="grid gap-1 mb-2">
              <span className="text-xs text-gray-500">Chart</span>
              <select
                className={inputBase}
                value={cfg.chart}
                onChange={e=>setCfg({...cfg, chart: e.target.value as WidgetConfig['chart']})}
              >
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="area">Area</option>
                <option value="pie">Pie (Summe Jahr)</option>
              </select>
            </label>

            {(cfg.chart==='bar' || cfg.chart==='area') && (
              <label className="inline-flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={!!cfg.stacked}
                  onChange={e=>setCfg({...cfg, stacked: e.target.checked})}
                />
                <span className="text-sm">Stacked</span>
              </label>
            )}

            {/* Farben */}
            <label className="grid gap-1 mb-2">
              <span className="text-xs text-gray-500">Farben</span>
              <div className="flex items-center gap-2">
                <select
                  className={inputBase}
                  value={cfg.palette ?? 'default'}
                  onChange={e=>setCfg({...cfg, palette: e.target.value as NonNullable<WidgetConfig['palette']>})}
                >
                  <option value="default">Default</option>
                  <option value="vibrant">Vibrant</option>
                  <option value="pastel">Pastel</option>
                  <option value="monoBlue">Mono Blue</option>
                  <option value="monoGray">Mono Gray</option>
                </select>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!cfg.reverseColors}
                    onChange={e=>setCfg({...cfg, reverseColors: e.target.checked})}
                  />
                  Reverse
                </label>
              </div>
            </label>

            <div className="grid gap-1">
              <span className="text-xs text-gray-500">Teams (optional)</span>
              <div className="flex flex-wrap gap-1">
                {teamOpts.map(t => {
                  const active = cfg.teams?.includes(t.id) ?? false;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={()=>setCfg(prev=>{
                        const set = new Set(prev.teams ?? []);
                        set.has(t.id) ? set.delete(t.id) : set.add(t.id);
                        return {...prev, teams: Array.from(set)};
                      })}
                      className={`px-2 py-1 rounded border text-xs ${active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-white/10 border-gray-200 dark:border-gray-700'}`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
            <div className="text-sm font-medium mb-2">{cfg.title || 'Vorschau'}</div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* Widgets: speichern/laden/löschen */}
      <WidgetManager cfg={cfg} setCfg={setCfg} onCelebrate={()=>{ trigger(); add({ variant:'success', title:'Widget gespeichert!' }); }} />

      {/* Announcement */}
      <AnnouncementsPanel />

      {/* TeamsManager – zwischen Dashboard und Tabelle */}
      <TeamsManager />

      {/* Tabelle (Rohdaten) – AUSKLAPPBAR */}
      <Collapsible title="Scores (Rohdaten)" defaultOpen={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">Team</th>
                <th className="py-2 pr-4">Monat</th>
                <th className="py-2 pr-4">Punkte</th>
                <th className="py-2 pr-4">Ausfall %</th>
                <th className="py-2 pr-4">Versp. Min.</th>
                <th className="py-2 pr-4">eFeedback</th>
              </tr>
            </thead>
            <tbody>
              {scores.map(s=>(
                <tr key={s.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-4">{s.team_name}</td>
                  <td className="py-2 pr-4">{s.month}</td>
                  <td className="py-2 pr-4">{s.points}</td>
                  <td className="py-2 pr-4">{s.productive_outage ?? '—'}</td>
                  <td className="py-2 pr-4">{s.lateness_minutes ?? '—'}</td>
                  <td className="py-2 pr-4">{s.efeedback_score ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Collapsible>

      {/* CSV-Import – AUSKLAPPBAR */}
      <Collapsible title="CSV Import" defaultOpen={false}>
        <CsvImportPanel year={year} onDone={() => { loadScores(year); add({ variant:'success', title:'CSV Import fertig' }); }} />
      </Collapsible>

      {/* Upsert-Form – AUSKLAPPBAR */}
      <Collapsible title="Score erfassen / updaten" defaultOpen={false}>
        <UpsertForm year={year} onSaved={() => { loadScores(year); add({ variant:'success', title:'Score upserted' }); }} />
      </Collapsible>
    </div>
  </>
);
}

export default function AdminCheckiade(){
  return (
    <ToasterProvider>
      <AdminCheckiadeInner />
    </ToasterProvider>
  );
}

/* ========= Helpers ========= */
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

/* ========= Gamification Badge ========= */
function GamificationBadge(){
  const [progress, setProgress] = useState(0);
  useEffect(()=>{
    const key = 'checkiade:actions';
    const n = Number(localStorage.getItem(key) || '0');
    setProgress(Math.max(0, Math.min(1, n/10))); // 10 Aktionen => 100%
  },[]);
  return (
    <div className="hidden md:flex items-center gap-2 select-none">
      <div className="text-xs text-gray-500">Level-Up</div>
      <div className="w-28 h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
        <div className="h-full bg-blue-600" style={{ width: `${progress*100}%` }} />
      </div>
    </div>
  );
}

function bumpActions(){
  const key = 'checkiade:actions';
  const n = Number(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, String(n));
}

/* ========= Widgets Manager (optimistic + celebrate) ========= */
function WidgetManager({ cfg, setCfg, onCelebrate }:{ cfg:any; setCfg:(c:any)=>void; onCelebrate: ()=>void }) {
  const [list, setList] = useState<WidgetRow[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const { add } = useToaster();

  async function load() {
    const r = await fetch('/api/admin/checkiade/widgets', { cache:'no-store', credentials: 'same-origin', });
    const j = await r.json().catch(()=>({items:[]}));
    setList(Array.isArray(j?.items)? j.items : []);
  }
  useEffect(()=>{ load(); },[]);

  async function save() {
    const n = name.trim(); if (!n) return;
    setBusy(true);
    const optimistic: WidgetRow = { id: `tmp-${Date.now()}`, name: n, config: cfg, created_at: new Date().toISOString() };
    setList(prev=> [optimistic, ...prev]);
    setName('');
    try {
      const r = await fetch('/api/admin/checkiade/widgets', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name: n, config: cfg }), credentials: 'same-origin',
      });
      if(!r.ok) throw new Error('save failed');
      bumpActions();
      onCelebrate();
      await load();
    } catch (e:any) {
      add({ variant:'error', title:'Widget-Speichern fehlgeschlagen' });
      setList(prev=> prev.filter(w=>w.id!==optimistic.id));
    } finally { setBusy(false); }
  }

  async function del(id:string) {
    const keep = list.find(w=>w.id===id);
    setList(prev=> prev.filter(w=>w.id!==id));
    try {
      const r = await fetch(`/api/admin/checkiade/widgets/${id}`, { method:'DELETE' });
      if(!r.ok) throw new Error('delete failed');
      bumpActions();
      add({ variant:'success', title:'Widget gelöscht' });
    } catch(e:any){
      add({ variant:'error', title:'Löschen fehlgeschlagen' });
      if (keep) setList(prev=> [keep, ...prev]);
    }
  }

  return (
    <section className={card}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">Widgets</div>
        <div className="flex items-center gap-2">
          <input className={inputBase}
                 placeholder="Name…" value={name} onChange={e=>setName(e.target.value)} />
          <button onClick={save} disabled={busy || !name.trim()}
                  className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
            {busy ? 'Speichere…' : 'Speichern'}
          </button>
        </div>
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {list.map(w=>(
          <li key={w.id} className="py-2 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{w.name}</div>
              <div className="text-xs text-gray-500">{new Date(w.created_at).toLocaleString('de-DE')}</div>
            </div>
            <button
              className="px-2 py-1 text-sm rounded border dark:border-gray-700"
              onClick={()=> { setCfg(w.config); add({ variant:'info', title:'In Vorschau geladen' }); }}
              title="In Vorschau laden"
            >Laden</button>
            <button
              className="px-2 py-1 text-sm rounded border border-red-300 text-red-700 dark:border-red-900 dark:text-red-300"
              onClick={()=>del(w.id)}
            >Löschen</button>
          </li>
        ))}
        {list.length===0 && <li className="py-2 text-sm text-gray-500">Keine gespeicherten Widgets.</li>}
      </ul>
    </section>
  );
}

/* ========= Announcements (Richtext) ========= */
function AnnouncementsPanel() {
  const [val, setVal] = useState<CheckiadeSettings>({ announcement:{ kind:'html', content:'' } });
  const [busy, setBusy] = useState(false);
  const { add } = useToaster();

  useEffect(()=>{ (async ()=>{
    const r = await fetch('/api/settings/checkiade', { cache:'no-store' });
    const j = await r.json().catch(()=>({}));
    const initial = j?.value ?? { announcement:{ kind:'html', content:'' } };
    setVal({ ...initial, announcement: { kind:'html', content: initial?.announcement?.content ?? '' } });
  })(); },[]);

  async function save() {
    setBusy(true);
    try {
      const payload = { ...val, announcement: { kind:'html', content: val.announcement?.content ?? '' } };
      const r = await fetch('/api/settings/checkiade', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload),
      });
      if(!r.ok) throw new Error('save failed');
      bumpActions();
      add({ variant:'success', title:'Announcement gespeichert' });
    } catch {
      add({ variant:'error', title:'Speichern fehlgeschlagen' });
    } finally { setBusy(false); }
  }

  return (
    <section className={card}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">Announcements</div>
        <button onClick={save} disabled={busy}
                className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
          {busy ? 'Speichere…' : 'Speichern'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-sm font-medium mb-1">Inhalt</div>
          <div className="rounded-xl border dark:border-gray-800 overflow-hidden">
            <RichTextEditor
              value={val.announcement?.content ?? ''}
              onChange={(html: any)=> setVal(v=>({ ...v, announcement: { kind:'html', content: html } }))}
              placeholder="Schreibe die Ankündigung …"
            />
          </div>
        </div>

        <div>
          <div className="text-sm font-medium mb-1">Preview</div>
          <div className="rounded-xl border dark:border-gray-800 p-3 prose dark:prose-invert max-w-none overflow-auto">
            <div dangerouslySetInnerHTML={{ __html: val.announcement?.content ?? '' }} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========= CSV Import ========= */
function CsvImportPanel({ year, onDone }: { year:number; onDone: ()=>void }) {
  const [teams, setTeams] = useState<{id:number; name:string}[]>([]);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [rawName, setRawName] = useState<string>('');
  const [errs, setErrs] = useState<string[]>([]);
  const { add } = useToaster();

  useEffect(()=>{ (async ()=>{
    const r = await fetch('/api/checkiade/teams', { cache:'no-store' });
    const j = await r.json().catch(()=>({items:[]}));
    setTeams(Array.isArray(j?.items) ? j.items : []);
  })(); },[]);

  function downloadTemplate(){
    const sample = [
      ['year','month','team_id','team_name','productive_outage','lateness_minutes','efeedback_score','points'],
      [String(year), '1','','Team Alpha','5.2','30','4.6','12'],
      [String(year), '2','','Team Beta','','45','','9'],
    ]
      .map(r => r.map(cell => {
        const s = String(cell ?? '');
        return /[\";\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
      }).join(';'))
      .join('\n');

    const blob = new Blob([sample], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `checkiade_scores_template_${year}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function onFile(file: File){
    setRawName(file.name);
    file.text().then(txt => {
      const table = parseCSV(txt); // strikt Semikolon
      if (!table.length) { setRows([]); setErrs(['Leere Datei oder ungültiges CSV']); return; }

      // Header
      const header = (table[0] ?? []).map(h => String(h || '').trim().toLowerCase());
      const missing = ['year','month','points'].filter(h => !header.includes(h));
      if (missing.length) {
        setRows([]); setErrs([`Fehlende Spalten: ${missing.join(', ')}`]); return;
      }

      // Rows → Objects
      const out:any[] = [];
      for (let i=1; i<table.length; i++){
        const r = table[i]; if (!r || r.length===0) continue;
        const obj:Record<string, any> = {};
        header.forEach((h,idx)=> obj[h] = r[idx]);
        Object.keys(obj).forEach(k => { if (typeof obj[k]==='string') obj[k] = obj[k].trim(); });

        const yy = obj.year ? Number(obj.year) : year;
        const mm = Number(obj.month);
        const teamId = obj.team_id ? Number(obj.team_id) : undefined;
        const teamNameRaw = obj.team_name || '';

        let teamName: string|undefined = teamNameRaw || undefined;
        let finalTeamId: number|undefined = isFinite(teamId as any) && teamId!>0 ? teamId : undefined;
        if (!finalTeamId && teamName) {
          const hit = teams.find(t => t.name.toLowerCase() === String(teamName).toLowerCase());
          if (hit) { finalTeamId = hit.id; teamName = undefined; }
        }

        const row = {
          year: Number.isFinite(yy) ? yy : year,
          month: Number.isFinite(mm) ? mm : undefined,
          team_id: finalTeamId,
          team_name: teamName,
          productive_outage: toNumOrNull(obj.productive_outage),
          lateness_minutes: toNumOrNull(obj.lateness_minutes),
          efeedback_score: toNumOrNull(obj.efeedback_score),
          points: toNumOrZero(obj.points),
          __line: i+1,
        };
        out.push(row);
      }

      // Validierung
      const problems:string[] = [];
      out.forEach(r=>{
        if (!Number.isFinite(r.month) || r.month!<1 || r.month!>12) problems.push(`Zeile ${r.__line}: Monat 1–12 angeben`);
        if (!r.team_id && !(r.team_name && r.team_name.length>0)) problems.push(`Zeile ${r.__line}: team_id oder team_name erforderlich`);
        if (r.efeedback_score!=null && (r.efeedback_score<0 || r.efeedback_score>5)) problems.push(`Zeile ${r.__line}: eFeedback 0–5`);
        if (r.productive_outage!=null && (r.productive_outage<0 || r.productive_outage>100)) problems.push(`Zeile ${r.__line}: Ausfall % 0–100`);
        if (r.lateness_minutes!=null && r.lateness_minutes<0) problems.push(`Zeile ${r.__line}: Verspätungs-Minuten >= 0`);
        if (r.points!=null && r.points<0) problems.push(`Zeile ${r.__line}: Punkte >= 0`);
      });

      setErrs(problems);
      setRows(out);
    }).catch(()=> { setRows([]); setErrs(['Datei konnte nicht gelesen werden']); });
  }

  async function uploadAll(){
    if (!rows.length) return;
    setBusy(true);
    let ok=0, bad=0;
    for (const r of rows){
      try {
        const payload = {
          year: r.year,
          month: r.month,
          team_id: r.team_id || undefined,
          team_name: r.team_id ? undefined : (r.team_name || undefined),
          productive_outage: r.productive_outage,
          lateness_minutes: r.lateness_minutes,
          efeedback_score: r.efeedback_score,
          points: r.points ?? 0,
        };
        const res = await fetch('/api/checkiade/scores', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('HTTP '+res.status);
        ok++;
      } catch {
        bad++;
      }
    }
    setBusy(false);
    if (bad===0) {
      add({ variant:'success', title:`${ok} Zeilen importiert` });
      onDone();
      setRows([]); setErrs([]); setRawName('');
    } else {
      add({ variant:'error', title:`Import teilweise fehlgeschlagen`, description:`${ok} ok, ${bad} Fehler` });
    }
  }

  function onDrop(e: React.DragEvent){
    e.preventDefault();
    const f = e.dataTransfer.files?.[0]; if (f) onFile(f);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={downloadTemplate}
            className="px-3 py-1.5 rounded-xl border dark:border-gray-700 text-sm">Vorlage herunterladen</button>
          <label className="px-3 py-1.5 rounded-xl border dark:border-gray-700 text-sm cursor-pointer">
            Datei wählen
            <input type="file" accept=".csv,text/csv" className="hidden"
                   onChange={e=>{ const f=e.target.files?.[0]; if (f) onFile(f); }} />
          </label>
        </div>
        {rawName && <div className="text-sm text-gray-500">{rawName}: {rows.length} Zeilen</div>}
      </div>

      <div
        onDrop={onDrop}
        onDragOver={e=>e.preventDefault()}
        className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm
                   bg-white dark:bg-gray-900"
      >
        {rawName
          ? <div><span className="font-medium">{rawName}</span> geladen. {rows.length} Zeilen erkannt.</div>
          : <div><span className="font-medium">CSV hierher ziehen</span> oder oben Datei wählen.</div>}
      </div>

      {/* Hinweise */}
      <div className="text-xs text-gray-500">
        Erlaubte Spalten: <code>year, month, team_id, team_name, productive_outage, lateness_minutes, efeedback_score, points</code>.
        <b>Nur</b> Semikolon (<code>;</code>) als Trennzeichen. Dezimalpunkt <i>oder</i> -komma möglich.
      </div>

      {/* Errors */}
      {errs.length>0 && (
        <div className="rounded-lg border border-red-300 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300">
          <div className="font-medium mb-1">Prüfhinweise</div>
          <ul className="list-disc ml-5 space-y-0.5">
            {errs.slice(0,8).map((e,i)=><li key={i}>{e}</li>)}
            {errs.length>8 && <li>… {errs.length-8} weitere</li>}
          </ul>
        </div>
      )}

      {/* Preview */}
      {!!rows.length && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">#</th>
                <th className="py-2 pr-4">Jahr</th>
                <th className="py-2 pr-4">Monat</th>
                <th className="py-2 pr-4">Team-ID</th>
                <th className="py-2 pr-4">Team-Name</th>
                <th className="py-2 pr-4">Ausfall %</th>
                <th className="py-2 pr-4">Versp. Min.</th>
                <th className="py-2 pr-4">eFeedback</th>
                <th className="py-2 pr-4">Punkte</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0,50).map((r,i)=>(
                <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-4">{i+1}</td>
                  <td className="py-2 pr-4">{r.year}</td>
                  <td className="py-2 pr-4">{r.month}</td>
                  <td className="py-2 pr-4">{r.team_id ?? '—'}</td>
                  <td className="py-2 pr-4">{r.team_name ?? '—'}</td>
                  <td className="py-2 pr-4">{r.productive_outage ?? '—'}</td>
                  <td className="py-2 pr-4">{r.lateness_minutes ?? '—'}</td>
                  <td className="py-2 pr-4">{r.efeedback_score ?? '—'}</td>
                  <td className="py-2 pr-4">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length>50 && <div className="mt-2 text-xs text-gray-500">… nur erste 50 Zeilen angezeigt</div>}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          disabled={busy || !rows.length || errs.length>0}
          onClick={uploadAll}
          className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
        >
          {busy ? 'Import läuft…' : `Import starten (${rows.length})`}
        </button>
        {!!rows.length && <div className="text-xs text-gray-500">Zeilen mit Fehlerhinweisen werden nicht hochgeladen.</div>}
      </div>
    </section>
  );
}

/* --- CSV + number helpers (ohne libs) --- */
function parseCSV(input:string): string[][] {
  // **Nur Semikolon** als Separator. Unterstützt Quotes & Multiline.
  const rows:string[][] = [];
  let i=0, field='', row:string[]=[];
  let inQuotes=false;
  const sep = ';';

  while (i < input.length) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i+1] === '"') { field += '"'; i+=2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row=[]; field=''; i++; continue; }
      if (c === sep) { row.push(field); field=''; i++; continue; }
      field += c; i++; continue;
    }
  }
  row.push(field);
  rows.push(row);

  if (rows.length && rows[rows.length-1].every(x=>x==='')) rows.pop();
  return rows;
}

function toNumOrNull(x:any){ if (x==='' || x==null) return null; const n = Number(String(x).replace(',','.')); return Number.isFinite(n) ? n : null; }
function toNumOrZero(x:any){ if (x==='' || x==null) return 0; const n = Number(String(x).replace(',','.')); return Number.isFinite(n) ? n : 0; }

/* ========= Upsert Form (NEW) – with inline validation & toasts ========= */

function UpsertForm({ year, onSaved }: { year:number; onSaved: ()=>void }) {
  const months = Array.from({length:12},(_,i)=>i+1);
  const [teams, setTeams] = useState<{id:number; name:string}[]>([]);
  const [newTeam, setNewTeam] = useState('');
  const { add } = useToaster();

  async function loadTeams() {
    const r = await fetch('/api/checkiade/teams', { cache:'no-store' });
    const j = await r.json().catch(()=>({items:[]}));
    setTeams(Array.isArray(j?.items) ? j.items : []);
  }
  useEffect(()=>{ loadTeams(); },[]);

  const [form, setForm] = useState({
    year,
    month: new Date().getMonth()+1,
    team_id: 0,
    team_name: '',
    productive_outage: '',
    lateness_minutes: '',
    efeedback_score: '',
    points: '',
  });
  useEffect(()=> setForm(f=>({ ...f, year })), [year]);

  const [errors, setErrors] = useState<Record<string,string>>({});

  function validate(){
    const e: Record<string,string> = {};
    if (!form.team_id && !form.team_name.trim()) e.team = 'Team auswählen oder neuen Namen eingeben';
    const p = form.points; if (p!=='' && Number(p) < 0) e.points = 'Punkte dürfen nicht negativ sein';
    const ef = form.efeedback_score; if (ef!=='' && (Number(ef)<0 || Number(ef)>5)) e.efeedback_score = 'Ø 0–5';
    const po = form.productive_outage; if (po!=='' && (Number(po)<0 || Number(po)>100)) e.productive_outage = '0–100%';
    const lm = form.lateness_minutes; if (lm!=='' && Number(lm)<0) e.lateness_minutes = '>= 0';
    setErrors(e); return Object.keys(e).length===0;
  }

  async function addInlineTeam() {
    const name = newTeam.trim(); if (!name) return;
    try {
      const r = await fetch('/api/checkiade/teams', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name })
      });
      const j = await r.json().catch(()=>null);
      setNewTeam('');
      await loadTeams();
      if (j?.item?.id) {
        setForm(f=>({ ...f, team_id: j.item.id, team_name: j.item.name }));
        add({ variant:'success', title:'Team angelegt' });
      }
    } catch { add({ variant:'error', title:'Team konnte nicht angelegt werden' }); }
  }

  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) { add({ variant:'error', title:'Bitte Eingaben prüfen' }); return; }
    setBusy(true);
    try {
      const payload = {
        year: form.year,
        month: Number(form.month),
        team_id: Number(form.team_id) || undefined,
        team_name: !form.team_id ? form.team_name.trim() : undefined,
        productive_outage: form.productive_outage===''?null:Number(form.productive_outage),
        lateness_minutes: form.lateness_minutes===''?null:Number(form.lateness_minutes),
        efeedback_score: form.efeedback_score===''?null:Number(form.efeedback_score),
        points: form.points===''?0:Number(form.points),
      };
      const r = await fetch('/api/checkiade/scores', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error('upsert failed');
      bumpActions();
      onSaved();
      setForm(f=>({ ...f, points:'' }));
    } catch(e:any) { add({ variant:'error', title:'Upsert fehlgeschlagen' }); }
    finally { setBusy(false); }
  }

  const input = inputBase;
  const hint = (msg?:string)=> msg && <div className="text-xs text-red-600 mt-1">{msg}</div>;

  return (
    <section className="space-y-3">
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1">
          <span className="text-xs text-gray-500">Jahr</span>
          <input className={input} type="number" value={form.year} onChange={e=>setForm({...form, year:Number(e.target.value)})}/>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-gray-500">Monat</span>
          <select className={input} value={form.month} onChange={e=>setForm({...form, month:Number(e.target.value)})}>
            {months.map(m=> <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        {/* Team-Auswahl */}
        <label className="grid gap-1">
          <span className="text-xs text-gray-500">Team</span>
          <select
            className={`${input} ${errors.team? 'border-red-300 focus:ring-red-200': ''}`}
            value={form.team_id}
            onChange={e=>{
              const id = Number(e.target.value);
              setForm(f => ({ ...f, team_id:id, team_name: teams.find(t=>t.id===id)?.name ?? '' }));
            }}
          >
            <option value={0}>— auswählen —</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {!form.team_id && <div className="text-[10px] text-gray-500">oder unten neuen Namen eingeben</div>}
          {hint(errors.team)}
        </label>

        {/* Inline neues Team */}
        <div className="grid gap-1">
          <span className="text-xs text-gray-500">Neues Team (optional)</span>
          <div className="flex gap-2">
            <input className={`${input} flex-1`} placeholder="Teamname"
                   value={newTeam} onChange={e=>setNewTeam(e.target.value)} />
            <button type="button" onClick={addInlineTeam}
                    className="px-3 py-1.5 rounded-xl border dark:border-gray-700">
              Anlegen
            </button>
          </div>
        </div>

        {/* Metriken */}
        <label className="grid gap-1">
          <span className="text-xs text-gray-500">Produktive Ausfallquote (%)</span>
          <input className={`${input} ${errors.productive_outage? 'border-red-300': ''}`} type="number" step="0.01" value={form.productive_outage}
                 onChange={e=>setForm({...form, productive_outage:e.target.value})}/>
          {hint(errors.productive_outage)}
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-gray-500">Verspätungen (Min.)</span>
          <input className={`${input} ${errors.lateness_minutes? 'border-red-300': ''}`} type="number" value={form.lateness_minutes}
                 onChange={e=>setForm({...form, lateness_minutes:e.target.value})}/>
          {hint(errors.lateness_minutes)}
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-gray-500">eFeedback (Ø)</span>
          <input className={`${input} ${errors.efeedback_score? 'border-red-300': ''}`} type="number" step="0.01" value={form.efeedback_score}
                 onChange={e=>setForm({...form, efeedback_score:e.target.value})}/>
          {hint(errors.efeedback_score)}
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-gray-500">Punkte</span>
          <input className={`${input} ${errors.points? 'border-red-300': ''}`} type="number" value={form.points}
                 onChange={e=>setForm({...form, points:e.target.value})}/>
          {hint(errors.points)}
        </label>

        <div className="flex items-end gap-3">
          <button disabled={busy}
            className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
            {busy ? 'Speichere…' : 'Upsert'}
          </button>
          <span className="text-xs text-gray-500">Tipp: ⏎ sendet das Formular</span>
        </div>
      </form>
    </section>
  );
}
