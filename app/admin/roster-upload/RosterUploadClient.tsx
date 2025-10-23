/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

type Member  = { user_id: string; name: string };
type Team    = { team_id: string; name: string };
type ParsedSheet = { name: string; headers: string[]; rows: string[][] };

function normalizeHeader(h: string){
  const map: Record<string,string> = { 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' };
  return String(h||'').trim().toLowerCase()
    .replace(/[äöüß]/g, ch => map[ch] || ch)
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'');
}

function excelToSheets(file: File): Promise<ParsedSheet[]> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      try {
        const wb = XLSX.read(new Uint8Array(fr.result as ArrayBuffer), { type: 'array' });
        const out: ParsedSheet[] = [];
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          if (!ws) continue;
          const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: true }) as string[][];
          const rows = (aoa || []).filter(r => Array.isArray(r) && r.length>0);
          if (!rows.length) continue;
          const headers = (rows[0] || []).map(v => String(v ?? '').trim());
          const body = rows.slice(1).map(r => headers.map((_,i)=>String(r[i] ?? '')));
          out.push({ name, headers, rows: body });
        }
        resolve(out);
      } catch (e){ reject(e); }
    };
    fr.readAsArrayBuffer(file);
  });
}

const deLongDateRx = /^[A-Za-zÄÖÜäöüß]+,\s*\d{1,2}\.\s*[A-Za-zÄÖÜäöüß]+\s+\d{4}\s*$/;
const compactSpaces = (s: string) => s.trim().replace(/\s+/g, ' ');
const normName = (s: string) => compactSpaces(s).toLowerCase();

export default function RosterUploadPage() {
  const defaultTeamId = '1'; // fallback
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [file, setFile] = useState<File|null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const cur = sheets[sheetIdx];

  const [firstNameCol, setFirstNameCol] = useState('');
  const [lastNameCol,  setLastNameCol]  = useState('');
  const [roleCol,      setRoleCol]      = useState('');
  const [dateCols,     setDateCols]     = useState<string[]>([]);
  const [assignments, setAssignments]   = useState<Array<{sheetName:string; user_id:string|''; team_name?: string}>>([]);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  const [out,  setOut]  = useState('');

  // Teams laden (unbemerkt für Nutzer)
  useEffect(() => {
    (async() => {
      const r = await fetch('/api/teamhub/all-teams', { cache:'no-store' });
      const j = await r.json().catch(() => null);
      const arr: Team[] = Array.isArray(j?.items) ? j.items : [];
      setTeams(arr);
    })();
  }, []);

  // Nutzer laden
  useEffect(() => {
    (async() => {
      const r = await fetch('/api/admin/users?page=1&pageSize=500', { cache:'no-store' });
      const j = await r.json().catch(() => null);
      const arr: Member[] = Array.isArray(j?.data)
           ? j.data.map((u: any) => ({ user_id: String(u.user_id), name: u.name ?? '' }))
           : [];
      setMembers(arr);
    })();
  }, []);

  async function onFileChange(f: File|null){
    setFile(f);
    setSheets([]);
    setErr('');
    setOut('');
    setFirstNameCol('');
    setLastNameCol('');
    setRoleCol('');
    setDateCols([]);
    setAssignments([]);
    if (!f) return;
    const parsed = await excelToSheets(f);
    setSheets(parsed);
    setSheetIdx(0);
  }

  // Dependency extraction for useEffect
  const curHeaders = cur?.headers.join('|') ?? '';
  const curRowsLength = cur?.rows.length ?? 0;
  const membersList = members.map(m => m.user_id).join(',');
  const teamsList = teams.map(t => t.team_id).join(',');

  useEffect(() => {
    if (!cur) return;
    if (!firstNameCol && !lastNameCol && !roleCol && !dateCols.length) {
      const norm = cur.headers.map(h => ({ raw: h, norm: normalizeHeader(h) }));
      const find = (keys: string[]) => norm.find(h => keys.includes(h.norm))?.raw || '';
      setLastNameCol(find(['nachname', 'name_nachname']));
      setFirstNameCol(find(['vorname', 'name_vorname']));
      setRoleCol(find(['aufgabe', 'rolle', 'role', 'position', 'funktion']));
      const dCols = cur.headers.filter(h => deLongDateRx.test(String(h).trim()));
      setDateCols(dCols);
    }

    // Personenliste auf Basis der Zuordnung
    const idx = (label: string) => cur.headers.indexOf(label);
    const peopleSeen = new Set<string>();
    const people: string[] = [];
    const iFirst = idx(firstNameCol);
    const iLast = idx(lastNameCol);

    for (const row of cur.rows) {
      const first = iFirst >= 0 ? row[iFirst] : '';
      const last = iLast >= 0 ? row[iLast] : '';
      const person = compactSpaces([first, last].filter(Boolean).join(' '));
      if (!person) continue;
      const key = normName(person);
      if (!peopleSeen.has(key)) { peopleSeen.add(key); people.push(person); }
    }

    setAssignments(prev => {
      const prevMap = new Map(prev.map(a => [normName(a.sheetName), a.user_id]));
      const next = people.map(p => {
        const keep = prevMap.get(normName(p)) || '';
        if (keep) return { sheetName: p, user_id: keep, team_name: prevMap.get(normName(p)) ? _findTeamNameForUser(keep) : '' };
        const hit = members.find(m => normName(m.name || '') === normName(p));
        return { sheetName: p, user_id: hit?.user_id || '', team_name: hit?.user_id ? _findTeamNameForUser(hit.user_id) : '' };
      });
      return next;
    });

  }, [sheetIdx, curHeaders, curRowsLength, firstNameCol, lastNameCol, roleCol, dateCols.length, membersList, teamsList]);

  // Hilfsfunktion, um Teamname für User zu finden.
  function _findTeamNameForUser(user_id: string): string {
    // Prüfe alle Teams, ob user Mitglied ist. 
    // Hier brauchst du eine Data-Struktur von Teams + deren Members am besten im State.
    // Wenn nicht verfügbar, nur Dummy-Logik (oder leer)
    // Beispiel, wenn teams Zustand so was beinhaltet (team_id und team_name):
    // Da wir nur teams haben und nicht Members pro Team im Frontend, müsstest du serverseitig erweitern oder per API.
    // Für jetzt gibt es keine Member-Teams im Frontend, deshalb leer:
    return '';
  }

  const headerOptions = useMemo(() => (cur?.headers || []).map(h => ({ value: h, label: h })), [cur?.headers]);

  function setAssign(name: string, user_id: string) {
    setAssignments(prev => prev.map(a => a.sheetName === name ? { ...a, user_id } : a));
  }

  const previewRows = useMemo(() => {
    if (!cur) return [];
    const idx = (label: string) => cur.headers.indexOf(label);
    const iFirst = idx(firstNameCol);
    const iLast = idx(lastNameCol);
    const di = dateCols.map(h => idx(h));
    return cur.rows.slice(0, 20).map(r => {
      const first = iFirst >= 0 ? r[iFirst] : '';
      const last = iLast >= 0 ? r[iLast] : '';
      const person = compactSpaces([first, last].filter(Boolean).join(' '));
      const cols = di.map(i => i >= 0 ? String(r[i] ?? '') : '');
      return { person, cols };
    });
  }, [cur, firstNameCol, lastNameCol, dateCols]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setOut('');
    const teamId = defaultTeamId;
    if (!cur) { setErr('Bitte Excel auswählen.'); return; }
    if (!dateCols.length) { setErr('Keine Datums-Spalten erkannt.'); return; }
    if (!firstNameCol && !lastNameCol) {
      setErr('Bitte Namensspalten zuordnen (Vorname/Nachname).');
      return;
    }
    setBusy(true);
    try {
      const idx = (label: string) => cur.headers.indexOf(label);
      const iFirst = idx(firstNameCol);
      const iLast = idx(lastNameCol);
      const di = dateCols.map(h => idx(h));

      const assignedMap = new Map(assignments.filter(a => a.user_id).map(a => [normName(a.sheetName), a.user_id]));
      const assignedRows = cur.rows.filter(row => {
        const first = iFirst >= 0 ? row[iFirst] : '';
        const last = iLast >= 0 ? row[iLast] : '';
        const person = compactSpaces([first, last].filter(Boolean).join(' '));
        const norm = normName(person);
        return assignedMap.has(norm);
      });

      const seen = new Set<string>();
      const filteredRows = assignedRows.filter(row => {
        const first = iFirst >= 0 ? row[iFirst] : '';
        const last = iLast >= 0 ? row[iLast] : '';
        const basePerson = normName(compactSpaces([first, last].filter(Boolean).join(' ')));
        let isUnique = false;
        for (const dIdx of di) {
          const date = dIdx >= 0 ? row[dIdx] : '';
          const key = `${teamId}|${basePerson}|${date}`;
          if (!seen.has(key) && date) {
            seen.add(key);
            isUnique = true;
          }
        }
        return isUnique;
      });

      const res = await fetch('/api/teamhub/roster/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: Number(teamId),
          sheet_name: cur.name,
          headers: cur.headers,
          rows: filteredRows,
          mapping: {
            firstName: firstNameCol || undefined,
            lastName: lastNameCol || undefined,
            role: roleCol || undefined,
            dateCols
          },
          assignments
        })
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) setErr(j?.error || `Fehler ${res.status}`);
      else setOut(JSON.stringify(j, null, 2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dienstplan hochladen (Excel – breite Tagesspalten)</h1>
      {/* Datei */}
      <div className="max-w-xl space-y-2">
        <label className="block text-sm font-medium">Excel (.xlsx/.xls)</label>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={e => onFileChange(e.target.files?.[0] ?? null)}
        />
        {file && <div className="text-xs text-gray-500">Datei: {file.name}</div>}
      </div>
      {/* Sheet-Picker */}
      {sheets.length > 1 && (
        <div className="max-w-xl">
          <label className="block text-sm font-medium mb-1">Tabelle (Sheet)</label>
          <select value={sheetIdx} onChange={e => setSheetIdx(Number(e.target.value))}
            className="w-full border rounded px-2 py-1.5">
            {sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
          </select>
        </div>
      )}
      {/* Mapping */}
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
              {cur.headers.map(h => (
                <label key={h} className={`text-xs px-2 py-1 rounded border cursor-pointer ${dateCols.includes(h) ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                  <input type="checkbox" className="mr-1"
                    checked={dateCols.includes(h)}
                    onChange={(e) => {
                      setDateCols(prev => e.target.checked ? [...prev, h] : prev.filter(x => x !== h));
                    }} />
                  {h}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Mitarbeiter-Zuordnung */}
      {cur && (
        <div className="max-w-3xl space-y-2">
          <div className="text-sm font-medium">Mitarbeiter-Zuordnung (Excel → Benutzer im System)</div>
          {assignments.length === 0 && <div className="text-xs text-gray-500">Keine Personen gefunden.</div>}
          <ul className="divide-y border rounded bg-white">
            {assignments.map(a => (
              <li key={a.sheetName} className="p-2 flex items-center gap-3">
                <div className="min-w-[220px] text-sm">{a.sheetName} {a.team_name && <span className="text-gray-500 ml-2">({a.team_name})</span>}</div>
                <select
                  value={a.user_id}
                  onChange={e => setAssign(a.sheetName, e.target.value)}
                  className="flex-1 border rounded px-2 py-1.5 text-sm"
                >
                  <option value="">— nicht zuordnen —</option>
                  {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <div className="text-xs text-gray-500">
            Tipp: Automatisch zugeordnet, wenn Excel-Name exakt dem System-Namen entspricht.
          </div>
        </div>
      )}
    </div>
  );
}

function MapSelect({
  label, value, onChange, options
}: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="block text-sm">
      <span className="block mb-1">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full border rounded px-2 py-1.5">
        <option value="">— keine —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
