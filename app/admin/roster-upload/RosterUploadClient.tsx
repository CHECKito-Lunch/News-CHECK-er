/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

type Member = { user_id: string; name: string; email?: string; employee_no?: string };
type ParsedSheet = { name: string; headers: string[]; rows: string[][] };
type UploadResponse = {
  ok?: boolean;
  error?: string;
  stats?: Record<string, number>;
  inserted?: number;
  unresolved?: Array<unknown>;
} & Record<string, unknown>;

const deLongDateRx = /^[A-Za-zÄÖÜäöüß]+,\s*\d{1,2}\.\s*[A-Za-zÄÖÜäöüß]+\s+\d{4}\s*$/;
const compactSpaces = (s: string) => String(s ?? '').trim().replace(/\s+/g, ' ');

// --------- Normalisierung / Matching -------------------------------------------------
const umlautMap: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
const normNameFull = (s: string) =>
  String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[äöüß]/g, c => umlautMap[c] || c)
    .replace(/[^\p{L}\p{N}\s]/gu, '');

const flipOrder = (full: string) => {
  const p = normNameFull(full).split(' ').filter(Boolean);
  return p.length > 1 ? `${p.slice(1).join(' ')} ${p[0]}` : normNameFull(full);
};

// Levenshtein-Ähnlichkeit (0..1)
function similarity(a: string, b: string) {
  const s = normNameFull(a), t = normNameFull(b);
  const m = s.length, n = t.length;
  if (!m && !n) return 1;
  if (!m || !n) return 0;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}

type UserIndexes = {
  byId: Map<string, Member>;
  byEmail: Map<string, Member>;
  byEmpNo: Map<string, Member>;
  byName: Map<string, Member>; // normalisiert (inkl. Flip)
};

const buildUserIndexes = (list: Member[]): UserIndexes => {
  const byId = new Map<string, Member>();
  const byEmail = new Map<string, Member>();
  const byEmpNo = new Map<string, Member>();
  const byName = new Map<string, Member>();
  for (const u of list) {
    byId.set(String(u.user_id), u);
    if (u.email) byEmail.set(String(u.email).trim().toLowerCase(), u);
    if (u.employee_no) byEmpNo.set(String(u.employee_no).trim(), u);
    const nn = normNameFull(u.name || '');
    if (nn) byName.set(nn, u);
    const flipped = flipOrder(u.name || '');
    if (flipped && flipped !== nn && !byName.has(flipped)) byName.set(flipped, u);
  }
  return { byId, byEmail, byEmpNo, byName };
};

function findUserForExcelName(
  rawName: string,
  idx: UserIndexes,
  overridesMap: Record<string, string>,
  log: Array<any>,
  fuzzyThreshold = 0.9
): { user?: Member; via: string; score?: number } {
  const keyNorm = normNameFull(rawName);
  const keyFlip = flipOrder(rawName);

  // 1) Overrides
  const overrideVal = overridesMap[keyNorm] || overridesMap[keyFlip];
  if (overrideVal) {
    const cand =
      idx.byEmail.get(overrideVal.toLowerCase()) ||
      idx.byId.get(overrideVal) ||
      idx.byEmpNo.get(overrideVal) ||
      idx.byName.get(normNameFull(overrideVal));
    if (cand) return { user: cand, via: 'override' };
  }

  // 2) Exakt (inkl. Flip)
  const exact = idx.byName.get(keyNorm) || idx.byName.get(keyFlip);
  if (exact) return { user: exact, via: 'name_exact' };

  // 3) Fuzzy
  let best: { u: Member; score: number } | null = null;
  let top: Array<{ name: string; score: number; id: string }> = [];
  for (const [n, u] of idx.byName.entries()) {
    const sc = similarity(n, keyNorm);
    if (!best || sc > best.score) best = { u, score: sc };
    top.push({ name: n, score: sc, id: u.user_id });
  }
  top.sort((a, b) => b.score - a.score);
  top = top.slice(0, 3);
  if (best && best.score >= fuzzyThreshold) {
    log.push({ type: 'fuzzy_match', name: keyNorm, picked: best.u.user_id, score: best.score, top });
    return { user: best.u, via: 'name_fuzzy', score: best.score };
  }

  log.push({ type: 'no_match', name: keyNorm, tested: [keyNorm, keyFlip], candidates: idx.byName.size, top });
  return { via: 'none' };
}

// --------- Excel Helpers --------------------------------------------------------------
function normalizeHeader(h: string) {
  const map: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[äöüß]/g, ch => map[ch] || ch)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function excelToSheets(file: File): Promise<ParsedSheet[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const out: ParsedSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: true }) as string[][];
    const rows = (aoa || []).filter(r => Array.isArray(r) && r.length > 0);
    if (!rows.length) continue;

    const headers = (rows[0] || []).map(v => String(v ?? '').trim());
    const body = rows.slice(1).map(r => {
      const arr = new Array<string>(headers.length);
      for (let idx = 0; idx < headers.length; idx++) arr[idx] = String(r[idx] ?? '');
      return arr;
    });

    out.push({ name, headers, rows: body });
  }
  return out;
}

// --------- Component -----------------------------------------------------------------
export default function RosterUploadPage() {
  // data
  const [members, setMembers] = useState<Member[]>([]);

  // file/sheet
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const cur = sheets[sheetIdx];

  // mapping
  const [firstNameCol, setFirstNameCol] = useState('');
  const [lastNameCol, setLastNameCol] = useState('');
  const [roleCol, setRoleCol] = useState('');
  const [dateCols, setDateCols] = useState<string[]>([]);

  // assignments
  const [assignments, setAssignments] = useState<Array<{ sheetName: string; user_id: string | '' }>>([]);

  // overrides
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [overridesText, setOverridesText] = useState<string>('');

  // ui
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'err' | 'ok'; text: string } | null>(null);
  const [jsonOut, setJsonOut] = useState('');

  // Load users
  useEffect(() => {
    (async () => {
      try {
        const mRes = await fetch('/api/admin/users?page=1&pageSize=500', { cache: 'no-store' });
        const mJson = await mRes.json().catch(() => null);
        setMembers(
          Array.isArray(mJson?.data)
            ? mJson.data.map((u: any) => ({
                user_id: String(u.user_id),
                name: u.name ?? '',
                email: u.email ?? '',
                employee_no: u.employee_no ?? '',
              }))
            : [],
        );
      } catch {
        /* noop */
      }
    })();
  }, []);

  // File change
  const onFileChange = useCallback(async (f: File | null) => {
    setFile(f);
    setSheets([]);
    setMsg(null);
    setJsonOut('');
    setFirstNameCol('');
    setLastNameCol('');
    setRoleCol('');
    setDateCols([]);
    setAssignments([]);
    if (!f) return;
    const parsed = await excelToSheets(f);
    setSheets(parsed);
    setSheetIdx(0);
  }, []);

  // memo helpers
  const headerOptions = useMemo(() => (cur?.headers || []).map(h => ({ value: h, label: h })), [cur?.headers]);

  const headerIndex = useMemo(() => {
    const map = new Map<string, number>();
    cur?.headers.forEach((h, i) => map.set(h, i));
    return (label: string) => (label && map.has(label) ? (map.get(label) as number) : -1);
  }, [cur?.headers]);

  const userIdx = useMemo(() => buildUserIndexes(members), [members]);

  // Auto-Mapping + Personenliste → Assignments
  const curKey = `${sheetIdx}|${cur?.headers.join('|') ?? ''}|${cur?.rows.length ?? 0}`;
  useEffect(() => {
    if (!cur) return;

    if (!firstNameCol && !lastNameCol && !roleCol && !dateCols.length) {
      const normalized = cur.headers.map(h => ({ raw: h, norm: normalizeHeader(h) }));
      const find = (keys: string[]) => normalized.find(h => keys.includes(h.norm))?.raw || '';
      setLastNameCol(find(['nachname', 'name_nachname']));
      setFirstNameCol(find(['vorname', 'name_vorname']));
      setRoleCol(find(['aufgabe', 'rolle', 'role', 'position', 'funktion']));
      setDateCols(cur.headers.filter(h => deLongDateRx.test(String(h).trim())));
    }

    const iFirst = headerIndex(firstNameCol);
    const iLast = headerIndex(lastNameCol);
    const seen = new Set<string>();
    const people: string[] = [];
    for (const row of cur.rows) {
      const first = iFirst >= 0 ? row[iFirst] : '';
      const last = iLast >= 0 ? row[iLast] : '';
      const person = compactSpaces([first, last].filter(Boolean).join(' '));
      if (!person) continue;
      const key = normNameFull(person);
      if (!seen.has(key)) {
        seen.add(key);
        people.push(person);
      }
    }

    setAssignments(prev => {
      const prevMap = new Map(prev.map(a => [normNameFull(a.sheetName), a.user_id]));
      const log: any[] = [];
      const next = people.map(p => {
        const keep = prevMap.get(normNameFull(p));
        if (keep) return { sheetName: p, user_id: keep };
        const hit = findUserForExcelName(p, userIdx, overrides, log);
        return { sheetName: p, user_id: hit.user?.user_id || '' };
      });
      if (log.length) console.debug('[assignments-lookup]', log);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey, firstNameCol, lastNameCol, roleCol, dateCols.length, members, overrides]);

  const setAssign = useCallback((name: string, user_id: string) => {
    setAssignments(prev => prev.map(a => (a.sheetName === name ? { ...a, user_id } : a)));
  }, []);

  // Vorschau (nur Tageszellen)
  const previewRows = useMemo(() => {
    if (!cur) return [];
    const iFirst = headerIndex(firstNameCol);
    const iLast = headerIndex(lastNameCol);
    const di = dateCols.map(h => headerIndex(h));
    return cur.rows.slice(0, 20).map(r => {
      const first = iFirst >= 0 ? r[iFirst] : '';
      const last = iLast >= 0 ? r[iLast] : '';
      const person = compactSpaces([first, last].filter(Boolean).join(' '));
      const cols = di.map(i => (i >= 0 ? String(r[i] ?? '') : ''));
      return { person, cols };
    });
  }, [cur, firstNameCol, lastNameCol, dateCols, headerIndex]);

  // Audit
  function auditMissingUsers(excelPeople: string[], idx: UserIndexes, overridesMap: Record<string, string>) {
    const missing: string[] = [];
    const log: any[] = [];
    for (const p of excelPeople) {
      const hit = findUserForExcelName(p, idx, overridesMap, log, 0.95);
      if (!hit.user) missing.push(normNameFull(p));
    }
    if (log.length) console.debug('[audit]', log);
    return { missing };
  }

  // Meldung bauen
  function buildCompactMessage(
    sheetName: string,
    sentRows: number,
    assignedUsers: number,
    dayCols: number,
    api: UploadResponse | null,
    missingCount: number
  ) {
    const inserted = typeof api?.inserted === 'number' ? ` · inserted: ${api.inserted}` : '';
    const unresolvedCnt = Array.isArray(api?.unresolved) ? api.unresolved.length : 0;
    const unresolved = unresolvedCnt ? ` · unresolved: ${unresolvedCnt}` : '';
    const statsPairs =
      api?.stats &&
      Object.entries(api.stats)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
    const tail = statsPairs ? ` (API: ${statsPairs})` : '';
    const audit = missingCount ? ` · Audit: ${missingCount} offen` : '';
    return `✅ ${sheetName} · ${sentRows} Zeilen · ${assignedUsers} Personen · ${dayCols} Tage${inserted}${unresolved}${audit}${tail}`;
  }

  // Speichern (Submit)
  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setMsg(null);
      setJsonOut('');
      setBusy(true);
      try {
        if (!cur) throw new Error('Bitte Excel auswählen.');
        if (!dateCols.length) throw new Error('Keine Datums-Spalten erkannt.');
        if (!firstNameCol && !lastNameCol) throw new Error('Bitte Namensspalten zuordnen (Vorname/Nachname).');

        const iFirst = headerIndex(firstNameCol);
        const iLast = headerIndex(lastNameCol);
        const di = dateCols.map(h => headerIndex(h));

        const assignedMap = new Map(assignments.filter(a => a.user_id).map(a => [normNameFull(a.sheetName), a.user_id]));
        const filteredRows: string[][] = [];
        const seen = new Set<string>();

        // De-Dupe pro Person + Datums-HEADER
        for (const row of cur.rows) {
          const first = iFirst >= 0 ? row[iFirst] : '';
          const last = iLast >= 0 ? row[iLast] : '';
          const basePerson = normNameFull(compactSpaces([first, last].filter(Boolean).join(' ')));
          if (!assignedMap.has(basePerson)) continue;

          let take = false;
          for (let k = 0; k < di.length; k++) {
            const dIdx = di[k];
            const dateHeader = dateCols[k];
            const cellVal = dIdx >= 0 ? row[dIdx] : '';
            if (!cellVal) continue;
            const key = `${basePerson}|${dateHeader}`;
            if (!seen.has(key)) {
              seen.add(key);
              take = true;
            }
          }
          if (take) filteredRows.push(row);
        }

        // Audit nur für relevante Personen
        const relevantPeople = Array.from(
          new Set(
            filteredRows.map(r => {
              const f = iFirst >= 0 ? r[iFirst] : '';
              const l = iLast >= 0 ? r[iLast] : '';
              return compactSpaces([f, l].filter(Boolean).join(' '));
            }),
          ),
        );
        const { missing } = auditMissingUsers(relevantPeople, userIdx, overrides);
        const missingCount = missing.length;

        const res = await fetch('/api/teamhub/roster/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheet_name: cur.name,
            headers: cur.headers,
            rows: filteredRows,
            mapping: {
              firstName: firstNameCol || undefined,
              lastName: lastNameCol || undefined,
              role: roleCol || undefined,
              dateCols,
            },
            assignments,
          }),
        });

        const j: UploadResponse | null = await res.json().catch(() => null);
        if (!res.ok) {
          setMsg({ type: 'err', text: j?.error || `Fehler ${res.status}` });
        } else {
          const uniqueUsers = new Set(assignments.filter(a => a.user_id).map(a => a.user_id)).size;
          const compact = buildCompactMessage(cur.name, filteredRows.length, uniqueUsers, dateCols.length, j, missingCount);
          setMsg({ type: 'ok', text: compact });
          setJsonOut(JSON.stringify(j, null, 2));
        }
      } catch (err: any) {
        setMsg({ type: 'err', text: String(err?.message || err) });
      } finally {
        setBusy(false);
      }
    },
    [cur, dateCols, firstNameCol, lastNameCol, headerIndex, assignments, userIdx, overrides, roleCol],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dienstplan hochladen (Excel – breite Tagesspalten)</h1>

      <div className="max-w-xl space-y-2">
        <label className="block text-sm font-medium">Excel (.xlsx/.xls)</label>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={e => onFileChange(e.target.files?.[0] ?? null)}
        />
        {file && <div className="text-xs text-gray-500">Datei: {file.name}</div>}
      </div>

      {sheets.length > 1 && (
        <div className="max-w-xl">
          <label className="block text-sm font-medium mb-1">Tabelle (Sheet)</label>
          <select
            value={sheetIdx}
            onChange={e => setSheetIdx(Number(e.target.value))}
            className="w-full border rounded px-2 py-1.5"
          >
            {sheets.map((s, i) => (
              <option key={s.name} value={i}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {cur && (
        <div className="max-w-4xl space-y-3">
          <div className="text-sm font-medium">Spalten-Zuordnung</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <MapSelect label="Nachname" value={lastNameCol} onChange={setLastNameCol} options={headerOptions} />
            <MapSelect label="Vorname" value={firstNameCol} onChange={setFirstNameCol} options={headerOptions} />
            <MapSelect label="Aufgabe/Rolle" value={roleCol} onChange={setRoleCol} options={headerOptions} />
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Datums-Spalten</div>
            <div className="flex flex-wrap gap-2">
              {cur.headers.map(h => {
                const checked = dateCols.includes(h);
                return (
                  <label
                    key={h}
                    className={`text-xs px-2 py-1 rounded border cursor-pointer ${
                      checked ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mr-1"
                      checked={checked}
                      onChange={e =>
                        setDateCols(prev => (e.target.checked ? [...prev, h] : prev.filter(x => x !== h)))
                      }
                    />
                    {h}
                  </label>
                );
              })}
            </div>
            <div className="text-xs text-gray-500 mt-1">{dateCols.length} ausgewählt</div>
          </div>

          {/* Overrides (optional) */}
          <details className="max-w-3xl">
            <summary className="cursor-pointer text-sm font-medium">Overrides (JSON) – Sonderfälle</summary>
            <div className="mt-2 space-y-2">
              <textarea
                className="w-full border rounded p-2 text-xs font-mono"
                rows={4}
                placeholder={`{ "weissbach sarah": "sarah.weissbach@example.com", "wanzek christoph": "c.wanzek@example.com" }`}
                value={overridesText}
                onChange={e => setOverridesText(e.target.value)}
                onBlur={() => {
                  try {
                    const obj = overridesText ? JSON.parse(overridesText) : {};
                    if (obj && typeof obj === 'object') setOverrides(obj as Record<string, string>);
                    setMsg(m => (m?.type === 'err' ? null : m));
                  } catch (err: any) {
                    setMsg({ type: 'err', text: `Overrides-JSON fehlerhaft: ${String(err.message || err)}` });
                  }
                }}
              />
              <div className="text-xs text-gray-500">
                Schlüssel sind normalisierte Namen (Toleranz aktiv); Werte: <code>email</code>, <code>user_id</code>,{' '}
                <code>employee_no</code> oder eindeutiger Name.
              </div>
            </div>
          </details>
        </div>
      )}

      {cur && (
        <div className="max-w-3xl space-y-2">
          <div className="text-sm font-medium">Mitarbeiter-Zuordnung (Excel → Benutzer)</div>
          {assignments.length === 0 && <div className="text-xs text-gray-500">Keine Personen gefunden.</div>}
          <ul className="divide-y border rounded bg-white">
            {assignments.map(a => (
              <li key={a.sheetName} className="p-2 flex items-center gap-3">
                <div className="min-w-[220px] text-sm">{a.sheetName}</div>
                <select
                  value={a.user_id}
                  onChange={e => setAssign(a.sheetName, e.target.value)}
                  className="flex-1 border rounded px-2 py-1.5 text-sm"
                >
                  <option value="">— nicht zuordnen —</option>
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <div className="text-xs text-gray-500">
            Auto-Zuordnung via ID/Email/Personalnr – sonst Name (inkl. Flip & Fuzzy).
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-2 max-w-xl">
        {msg && (
          <div className={`text-sm ${msg.type === 'err' ? 'text-red-600' : 'text-green-700'}`}>{msg.text}</div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-70"
            disabled={busy || !cur || !dateCols.length}
          >
            {busy ? 'Speichern…' : 'Speichern'}
          </button>
          <span className="text-xs text-gray-500">
            {assignments.filter(a => a.user_id).length} von {assignments.length} Personen zugeordnet
          </span>
        </div>
      </form>

      {jsonOut && (
        <details className="max-w-xl mt-2">
          <summary className="cursor-pointer text-sm text-gray-700">Roh-JSON anzeigen</summary>
          <pre className="bg-black/5 p-3 rounded text-xs whitespace-pre-wrap">{jsonOut}</pre>
        </details>
      )}

      {previewRows.length > 0 && (
        <div className="max-w-xl overflow-auto border rounded mt-5">
          <div className="text-sm font-medium mb-2">Vorschau (erste 20 Zeilen · nur Tageszellen)</div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 border-b text-left">Mitarbeiter (Excel)</th>
                {dateCols.map(h => (
                  <th key={h} className="px-2 py-1.5 border-b text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-gray-50/50">
                  <td className="px-2 py-1.5 border-b">{r.person}</td>
                  {r.cols.map((c, ci) => (
                    <td key={ci} className="px-2 py-1.5 border-b whitespace-pre align-top">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MapSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-sm">
      <span className="block mb-1">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full border rounded px-2 py-1.5">
        <option value="">— keine —</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
