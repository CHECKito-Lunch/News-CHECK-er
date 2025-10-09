/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

// app/admin/kpis/KpisClient.tsx
import { useEffect, useMemo, useState } from 'react';

type Trend = 'up' | 'down' | 'flat' | null;
type ChartType = 'none' | 'bar' | 'line';

type KPI = {
  id: number;
  key: string;
  label: string;
  value: string;                 // bleibt string, wie bei dir
  unit: string | null;
  trend: Trend;
  color: string | null;
  sort: number;
  // NEU:
  compare_value?: number | null;
  compare_label?: string | null;
  chart_type?: ChartType | null;
  history?: number[] | null;

  updated_at?: string | null;
};

const input   = 'w-full rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-white/10 dark:text-white dark:placeholder-gray-400 dark:border-white/10';
const card    = 'p-4 rounded-2xl shadow-sm bg-white border border-gray-200 dark:bg-gray-900 dark:border-gray-800';
const btn     = 'px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700';
const primary = 'px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white';

function parseNumber(x: string): number | null {
  if (!x) return null;
  // erlaubt "1.234,56" und "1234.56"
  const normalized = x.replace(/\./g, '').replace(',', '.').trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatPct(n: number): string {
  const s = (n >= 0 ? '+' : '') + (Math.round(n * 10) / 10).toFixed(1) + '%';
  return s;
}

/* ------- Mini Charts: einfache, dependency-freie SVGs ------- */
function BarCompare({
  a, b, color = '#3b82f6', labelA = 'Wert', labelB = 'Vergleich', unit,
}: { a: number; b: number; color?: string; labelA?: string; labelB?: string; unit?: string | null }) {
  const max = Math.max(a, b, 1);
  const aw = (a / max) * 100;
  const bw = (b / max) * 100;
  return (
    <div className="space-y-1 min-w-[220px]">
      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>{labelA}</span>
        <span className="font-mono">{a}{unit ? ` ${unit}` : ''}</span>
      </div>
      <div className="h-2 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className="h-full" style={{ width: `${aw}%`, background: color }} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>{labelB}</span>
        <span className="font-mono">{b}{unit ? ` ${unit}` : ''}</span>
      </div>
      <div className="h-2 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className="h-full" style={{ width: `${bw}%`, background: 'var(--bar-b, #10b981)' }} />
      </div>
    </div>
  );
}

function Sparkline({
  data, color = '#3b82f6', height = 36, strokeWidth = 2,
}: { data: number[]; color?: string; height?: number; strokeWidth?: number }) {
  if (!data.length) return null;
  const w = Math.max(60, data.length * 10);
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * (w - 4) + 2;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={height} className="overflow-visible block">
      <polyline fill="none" stroke={color} strokeWidth={strokeWidth} points={pts} />
    </svg>
  );
}

/* ============================================================ */

export default function KPIsAdminPage() {
  const [rows, setRows] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(false);

  // form (create/update)
  const [editId, setEditId] = useState<number | null>(null);
  const [keyV, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');               // string-Eingabe wie bisher
  const [unit, setUnit] = useState('');
  const [trend, setTrend] = useState<Trend>(null);
  const [color, setColor] = useState('');
  const [sort, setSort] = useState<number>(0);

  // NEU: Vergleich & Visualisierung
  const [compareValue, setCompareValue] = useState<string>('');   // Eingabe als string
  const [compareLabel, setCompareLabel] = useState<string>('');
  const [chartType, setChartType] = useState<ChartType>('none');
  const [historyStr, setHistoryStr] = useState<string>('');       // "1,2,3,4"

  const canSave = useMemo(() => keyV.trim() && label.trim() && value.trim(), [keyV, label, value]);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin/kpis');
    const j = await r.json();
    setRows(Array.isArray(j.data) ? j.data : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function resetForm() {
    setEditId(null);
    setKey(''); setLabel(''); setValue(''); setUnit('');
    setTrend(null); setColor(''); setSort(0);
    setCompareValue(''); setCompareLabel('');
    setChartType('none'); setHistoryStr('');
  }

  async function save() {
    const valNum = parseNumber(value);
    const cmpNum = parseNumber(compareValue);
    const history = historyStr
      .split(',')
      .map(s => parseNumber(s.trim()))
      .filter((n): n is number => n !== null);

    const body = {
      key: keyV.trim(),
      label: label.trim(),
      value: value.trim(), // wir lassen value wie gehabt als string (z. B. "1.234")
      unit: unit || null,
      trend,
      color: color || null,
      sort,
      compare_value: cmpNum ?? null,
      compare_label: compareLabel.trim() || null,
      chart_type: chartType === 'none' ? null : chartType,
      history: history.length ? history : null,
    };

    const url = editId ? `/api/admin/kpis/${editId}` : '/api/admin/kpis';
    const method = editId ? 'PATCH' : 'POST';
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error || 'Fehler beim Speichern');
      return;
    }
    await load();
    if (!editId) resetForm();
  }

  function startEdit(k: KPI) {
    setEditId(k.id);
    setKey(k.key);
    setLabel(k.label);
    setValue(k.value);
    setUnit(k.unit ?? '');
    setTrend(k.trend ?? null);
    setColor(k.color ?? '');
    setSort(k.sort ?? 0);

    setCompareValue(
      typeof k.compare_value === 'number' && Number.isFinite(k.compare_value)
        ? String(k.compare_value)
        : ''
    );
    setCompareLabel(k.compare_label ?? '');
    setChartType((k.chart_type as ChartType) ?? 'none');
    setHistoryStr(Array.isArray(k.history) ? k.history.join(',') : '');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function del(id: number) {
    if (!confirm('KPI wirklich löschen?')) return;
    const r = await fetch(`/api/admin/kpis/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error || 'Löschen fehlgeschlagen');
      return;
    }
    await load();
    if (editId === id) resetForm();
  }

  async function move(id: number, dir: -1 | 1) {
    const idx = rows.findIndex(r => r.id === id);
    const swap = rows[idx + dir];
    if (!swap) return;
    const a = rows[idx], b = swap;
    // simple swap
    await fetch(`/api/admin/kpis/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort: b.sort }) });
    await fetch(`/api/admin/kpis/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort: a.sort }) });
    await load();
  }

  // Live-Preview Berechnungen
  const valueNum = parseNumber(value);
  const compareNum = parseNumber(compareValue);
  const diffPct = useMemo(() => {
    if (valueNum == null || compareNum == null || compareNum === 0) return null;
    return ((valueNum - compareNum) / Math.abs(compareNum)) * 100;
  }, [valueNum, compareNum]);

  const historyArr = useMemo(() => {
    return historyStr
      .split(',')
      .map(s => parseNumber(s.trim()))
      .filter((n): n is number => n !== null);
  }, [historyStr]);

  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">KPIs</h1>

      {/* ======= Formular ======= */}
      <div className={card + ' space-y-3'}>
        <h2 className="text-lg font-semibold">{editId ? `Bearbeiten (ID ${editId})` : 'Neue KPI anlegen'}</h2>

        <div className="grid md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="form-label">Key</label>
            <input value={keyV} onChange={e => setKey(e.target.value)} className={input} placeholder="z.B. sickrate_site" />
          </div>
          <div className="md:col-span-2">
            <label className="form-label">Label</label>
            <input value={label} onChange={e => setLabel(e.target.value)} className={input} placeholder="Bezeichnung (z. B. Krankenquote Standort)" />
          </div>
          <div>
            <label className="form-label">Wert</label>
            <input value={value} onChange={e => setValue(e.target.value)} className={input} placeholder="z.B. 5,2" />
          </div>
          <div>
            <label className="form-label">Einheit</label>
            <input value={unit} onChange={e => setUnit(e.target.value)} className={input} placeholder="% / € / Stk." />
          </div>

          <div>
            <label className="form-label">Trend</label>
            <select value={trend ?? ''} onChange={e => setTrend((e.target.value || null) as Trend)} className={input}>
              <option value="">–</option>
              <option value="up">up</option>
              <option value="down">down</option>
              <option value="flat">flat</option>
            </select>
          </div>
          <div>
            <label className="form-label">Farbe (optional)</label>
            <input value={color} onChange={e => setColor(e.target.value)} className={input} placeholder="#10b981" />
          </div>
          <div>
            <label className="form-label">Sortierung</label>
            <input type="number" value={sort} onChange={e => setSort(Number(e.target.value))} className={input} />
          </div>

          {/* ---- Vergleich ---- */}
          <div className="md:col-span-2">
            <label className="form-label">Vergleichs-Label (optional)</label>
            <input value={compareLabel} onChange={e => setCompareLabel(e.target.value)} className={input} placeholder="z. B. Company gesamt" />
          </div>
          <div>
            <label className="form-label">Vergleichs-Wert</label>
            <input value={compareValue} onChange={e => setCompareValue(e.target.value)} className={input} placeholder="z. B. 4,8" />
          </div>
          <div className="md:col-span-3">
            <label className="form-label">Chart</label>
            <div className="grid grid-cols-3 gap-2">
              <select value={chartType} onChange={e => setChartType(e.target.value as ChartType)} className={input}>
                <option value="none">kein Chart</option>
                <option value="bar">Balken (Vergleich)</option>
                <option value="line">Linie (History)</option>
              </select>
              <input
                value={historyStr}
                onChange={e => setHistoryStr(e.target.value)}
                className={input + ' col-span-2'}
                placeholder="History: z. B. 3.8, 4.2, 4.9, 5.2"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Für Balken reicht „Wert + Vergleich“. Für Linie eine Liste vergangener Werte (Komma getrennt).
            </p>
          </div>

          <div className="flex gap-2">
            <button disabled={!canSave} onClick={save} className={primary} type="button">Speichern</button>
            <button onClick={resetForm} className={btn} type="button">Neu</button>
          </div>
        </div>

        {/* Live-Preview */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
          <div className="text-sm font-medium mb-2">Live-Preview</div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-lg">
              {label || '—'}:{' '}
              <span className="font-mono">
                {value || '—'}{unit ? ` ${unit}` : ''}
              </span>
            </div>
            {compareNum != null && valueNum != null && (
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Δ {formatPct(((valueNum - compareNum) / Math.abs(compareNum || 1)) * 100)}
                {compareLabel ? ` vs. ${compareLabel}` : ''}
              </div>
            )}
          </div>
          <div className="mt-3">
            {chartType === 'bar' && valueNum != null && compareNum != null && (
              <div style={{ ['--bar-b' as any]: '#10b981' }}>
                <BarCompare
                  a={valueNum}
                  b={compareNum}
                  color={color || '#3b82f6'}
                  labelA={label || 'Wert'}
                  labelB={compareLabel || 'Vergleich'}
                  unit={unit}
                />
              </div>
            )}
            {chartType === 'line' && historyArr.length > 0 && (
              <Sparkline data={historyArr} color={color || '#3b82f6'} />
            )}
            {chartType !== 'none' && chartType === 'line' && historyArr.length === 0 && (
              <div className="text-xs text-gray-500">Bitte History-Werte eingeben.</div>
            )}
          </div>
        </div>
        {diffPct != null && (
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Abweichung: <span className="font-mono">{formatPct(diffPct)}</span>
            {compareLabel ? ` (vs. ${compareLabel})` : ''}
          </div>
        )}
      </div>

      {/* ======= Tabelle ======= */}
      <div className={card}>
        {loading ? (
          <div className="text-sm text-gray-500">lädt…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-left">
                <tr>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Wert</th>
                  <th className="px-3 py-2">Vergleich</th>
                  <th className="px-3 py-2">Diff</th>
                  <th className="px-3 py-2">Chart</th>
                  <th className="px-3 py-2">Trend</th>
                  <th className="px-3 py-2">Farbe</th>
                  <th className="px-3 py-2">Sort</th>
                  <th className="px-3 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((k, i) => {
                  const vNum = parseNumber(String(k.value));
                  const cNum = typeof k.compare_value === 'number' ? k.compare_value : null;
                  const diff = (vNum != null && cNum != null && cNum !== 0)
                    ? ((vNum - cNum) / Math.abs(cNum)) * 100
                    : null;
                  return (
                    <tr key={k.id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                      <td className="px-3 py-2">{k.key}</td>
                      <td className="px-3 py-2">{k.label}</td>
                      <td className="px-3 py-2">
                        <div className="font-mono">{k.value}{k.unit ? ` ${k.unit}` : ''}</div>
                        {k.updated_at && (
                          <div className="text-[11px] text-gray-500">{new Date(k.updated_at).toLocaleString()}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {cNum != null ? (
                          <div>
                            <div className="text-[13px]">{k.compare_label ?? 'Vergleich'}</div>
                            <div className="font-mono">{cNum}{k.unit ? ` ${k.unit}` : ''}</div>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {diff != null ? <span className={`font-mono ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatPct(diff)}</span> : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {k.chart_type === 'bar' && vNum != null && cNum != null && (
                          <div style={{ ['--bar-b' as any]: '#10b981' }}>
                            <BarCompare a={vNum} b={cNum} color={k.color || '#3b82f6'} unit={k.unit} />
                          </div>
                        )}
                        {k.chart_type === 'line' && Array.isArray(k.history) && k.history.length > 0 && (
                          <Sparkline data={k.history} color={k.color || '#3b82f6'} />
                        )}
                        {!k.chart_type || k.chart_type === 'none' ? '—' : null}
                      </td>
                      <td className="px-3 py-2">{k.trend ?? '—'}</td>
                      <td className="px-3 py-2">{k.color ?? '—'}</td>
                      <td className="px-3 py-2">{k.sort}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button onClick={() => move(k.id, -1)} className={btn} disabled={i === 0}>↑</button>
                          <button onClick={() => move(k.id, 1)} className={btn} disabled={i === rows.length - 1}>↓</button>
                          <button onClick={() => startEdit(k)} className={btn}>Bearbeiten</button>
                          <button onClick={() => del(k.id)} className="px-3 py-2 rounded-lg bg-red-600 text-white">Löschen</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-500">Keine KPIs.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
