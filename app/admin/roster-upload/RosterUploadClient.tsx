/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

type TeamRow = { team_id: string; name: string };
type Member  = { user_id: string; name: string };

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
          const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: true }) as any[];
          const rows = (aoa || []).filter(r => Array.isArray(r) && r.length>0) as string[][];
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

// "Mittwoch, 1. Oktober 2025"
const deLongDateRx = /^[A-Za-zÄÖÜäöüß]+,\s*\d{1,2}\.\s*[A-Za-zÄÖÜäöüß]+\s+\d{4}\s*$/;

const compactSpaces = (s: string) => s.trim().replace(/\s+/g, ' ');
const normName = (s: string) => compactSpaces(s).toLowerCase();

export default function RosterUploadPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState<string>('');

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoadedFor, setMembersLoadedFor] = useState<string>('');

  const [file, setFile] = useState<File|null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const cur = sheets[sheetIdx];

  // Mapping der Excel-Header
  const [firstNameCol, setFirstNameCol] = useState('');
  const [lastNameCol,  setLastNameCol]  = useState('');
  const [fullNameCol,  setFullNameCol]  = useState('');
  const [roleCol,      setRoleCol]      = useState('');
  const [dateCols,     setDateCols]     = useState<string[]>([]);

  // Excel-Name -> user_id (Dropdown)
  const [assignments, setAssignments] = useState<Array<{sheetName:string; user_id:string|''}>>([]);

  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  const [out,  setOut]  = useState('');

  /* ========== 1) Teams laden ========== */
  useEffect(()=>{(async()=>{
    const r = await fetch('/api/teamhub/my-teams', { cache:'no-store' });
    const j = await r.json().catch(()=>null);
    const arr: TeamRow[] = Array.isArray(j?.items) ? j.items : [];
    setTeams(arr);
    if (!teamId && arr.length) setTeamId(arr[0].team_id);
  })()},[]);

  /* ========== 2) Team-Mitglieder laden ========== */
  useEffect(()=>{(async()=>{
    if (!teamId) { setMembers([]); setMembersLoadedFor(''); return; }
    // Deine /members-Route kann optional ?team_id verstehen – wenn nicht, ignoriert sie den Param.
    const r = await fetch(`/api/teamhub/members?team_id=${encodeURIComponent(teamId)}`, { cache:'no-store' });
    const j = await r.json().catch(()=>null);
    // Erwartetes Format: { members: [{user_id, name}, ...] }
    const arr: Member[] = Array.isArray(j?.members) ? j.members : [];
    setMembers(arr);
    setMembersLoadedFor(teamId);
  })()},[teamId]);

  /* ========== 3) Datei einlesen ========== */
  async function onFileChange(f: File|null){
    setFile(f);
    setSheets([]);
    setErr('');
    setOut('');
    setFirstNameCol(''); setLastNameCol(''); setFullNameCol(''); setRoleCol('');
    setDateCols([]);
    setAssignments([]);
    if (!f) return;
    const parsed = await excelToSheets(f);
    setSheets(parsed);
    setSheetIdx(0);
  }

  /* ========== 4) Auto-Guess / Neuaufbau bei Sheet- oder Mapping-Änderungen ========== */
  useEffect(()=>{
    if (!cur) return;

    // 4a) Heuristik für Spaltenvorschläge nur beim ersten Betreten des Sheets
    if (!firstNameCol && !lastNameCol && !fullNameCol && !roleCol && !dateCols.length) {
      const norm = cur.headers.map(h=>({ raw:h, norm: normalizeHeader(h) }));
      const find = (keys: string[]) => norm.find(h=>keys.includes(h.norm))?.raw || '';

      setLastNameCol (find(['nachname','name_nachname']));
      setFirstNameCol(find(['vorname','name_vorname']));
      setFullNameCol (find(['name','mitarbeiter','vollname','fullname']));
      setRoleCol     (find(['aufgabe','rolle','role','position','funktion']));

      const dCols = cur.headers.filter(h => deLongDateRx.test(String(h).trim()));
      setDateCols(dCols);
    }

    // 4b) Personenliste auf Basis der (aktuellen) Mapping-Auswahl
    const idx = (label:string) => cur.headers.indexOf(label);
    const peopleSeen = new Set<string>();
    const people: string[] = [];
    const iFull  = idx(fullNameCol);
    const iFirst = idx(firstNameCol);
    const iLast  = idx(lastNameCol);

    for (const row of cur.rows) {
      const full  = iFull  >= 0 ? row[iFull]  : '';
      const first = iFirst >= 0 ? row[iFirst] : '';
      const last  = iLast  >= 0 ? row[iLast]  : '';
      const person = full ? compactSpaces(String(full)) : compactSpaces([last, first].filter(Boolean).join(' '));
      if (!person) continue;
      const key = normName(person);
      if (!peopleSeen.has(key)) { peopleSeen.add(key); people.push(person); }
    }

    // 4c) Assignments neu bauen, bisherige Wahl dabei erhalten
    setAssignments(prev=>{
      const prevMap = new Map(prev.map(a=>[normName(a.sheetName), a.user_id]));
      const next = people.map(p=>{
        const keep = prevMap.get(normName(p)) || '';
        if (keep) return { sheetName: p, user_id: keep };
        // Auto-Match, wenn Excel-Name exakt Team-Mitgliedsname
        const hit = members.find(m => normName(m.name||'') === normName(p));
        return { sheetName: p, user_id: hit?.user_id || '' };
      });
      return next;
    });

  // Dependencies: wenn sich Sheet, Header, Mapping oder Mitglieder ändern → neu berechnen
  }, [
    sheetIdx,
    cur?.headers.join('|'),
    cur?.rows.length,
    firstNameCol, lastNameCol, fullNameCol, roleCol,
    members.map(m=>m.user_id).join(',')
  ]);

  /* ========== 5) Helpers ========== */
  const headerOptions = useMemo(()=> (cur?.headers||[]).map(h=>({value:h,label:h})), [cur?.headers]);

  function setAssign(name:string, user_id:string){
    setAssignments(prev => prev.map(a => a.sheetName===name ? { ...a, user_id } : a));
  }

  // Vorschau: erste 20 Zeilen, nur die gewählten Tages-Spalten
  const previewRows = useMemo(()=>{
    if (!cur) return [];
    const idx = (label:string) => cur.headers.indexOf(label);
    const iFull  = idx(fullNameCol);
    const iFirst = idx(firstNameCol);
    const iLast  = idx(lastNameCol);
    const di = dateCols.map(h => idx(h));

    return cur.rows.slice(0, 20).map(r => {
      const full  = iFull  >= 0 ? r[iFull]  : '';
      const first = iFirst >= 0 ? r[iFirst] : '';
      const last  = iLast  >= 0 ? r[iLast]  : '';
      const person = full ? compactSpaces(String(full)) : compactSpaces([last, first].filter(Boolean).join(' '));
      const cols = di.map(i => i>=0 ? String(r[i] ?? '') : '');
      return { person, cols };
    });
  }, [cur, firstNameCol, lastNameCol, fullNameCol, dateCols]);

  /* ========== 6) Submit ========== */
  async function submit(e:React.FormEvent){
    e.preventDefault();
    setErr(''); setOut('');
    if (!teamId) { setErr('Bitte Team wählen.'); return; }
    if (!cur) { setErr('Bitte Excel auswählen.'); return; }
    if (!dateCols.length) { setErr('Keine Datums-Spalten erkannt.'); return; }
    if (!firstNameCol && !lastNameCol && !fullNameCol) {
      setErr('Bitte Namensspalten zuordnen (Vorname/Nachname oder Name).'); return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/teamhub/roster/upload', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          team_id: Number(teamId),
          sheet_name: cur.name,
          headers: cur.headers,
          rows: cur.rows,
          mapping: {
            firstName: firstNameCol || undefined,
            lastName:  lastNameCol  || undefined,
            fullName:  fullNameCol  || undefined,
            role:      roleCol || undefined,
            dateCols
          },
          assignments
        })
      });
      const j = await res.json().catch(()=>null);
      if (!res.ok) setErr(j?.error || `Fehler ${res.status}`);
      else setOut(JSON.stringify(j, null, 2));
    } finally { setBusy(false); }
  }

  /* ========== UI ========== */
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dienstplan hochladen (Excel – breite Tagesspalten)</h1>

      {/* Team */}
      <div className="max-w-xl space-y-2">
        <label className="block text-sm font-medium">Team</label>
        <select value={teamId} onChange={e=>setTeamId(e.target.value)} className="w-full border rounded px-2 py-1.5">
          {teams.map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
        </select>
        {teamId && membersLoadedFor!==teamId && <div className="text-xs text-gray-500">Lade Teammitglieder…</div>}
      </div>

      {/* Datei */}
      <div className="max-w-xl space-y-2">
        <label className="block text-sm font-medium">Excel (.xlsx/.xls)</label>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={e=>onFileChange(e.target.files?.[0] ?? null)}
        />
        {file && <div className="text-xs text-gray-500">Datei: {file.name}</div>}
      </div>

      {/* Sheet-Picker */}
      {sheets.length > 1 && (
        <div className="max-w-xl">
          <label className="block text-sm font-medium mb-1">Tabelle (Sheet)</label>
          <select value={sheetIdx} onChange={e=>setSheetIdx(Number(e.target.value))}
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
            <MapSelect label="Nachname"     value={lastNameCol}  onChange={setLastNameCol}  options={headerOptions} />
            <MapSelect label="Vorname"      value={firstNameCol} onChange={setFirstNameCol} options={headerOptions} />
            <MapSelect label="Name (voll)"  value={fullNameCol}  onChange={setFullNameCol}  options={headerOptions} />
            <MapSelect label="Aufgabe/Rolle" value={roleCol}     onChange={setRoleCol}      options={headerOptions} />
          </div>

          {/* Date Columns Auswahl */}
          <div>
            <div className="text-sm font-medium mb-1">Datums-Spalten</div>
            <div className="flex flex-wrap gap-2">
              {cur.headers.map(h=>(
                <label key={h} className={`text-xs px-2 py-1 rounded border cursor-pointer ${dateCols.includes(h)?'bg-blue-50 border-blue-200':'bg-gray-50 border-gray-200'}`}>
                  <input type="checkbox" className="mr-1"
                    checked={dateCols.includes(h)}
                    onChange={(e)=>{
                      setDateCols(prev => e.target.checked ? [...prev, h] : prev.filter(x=>x!==h));
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
          <div className="text-sm font-medium">Mitarbeiter-Zuordnung (Excel → Teammitglied)</div>
          {assignments.length === 0 && <div className="text-xs text-gray-500">Keine Personen gefunden.</div>}
          <ul className="divide-y border rounded bg-white">
            {assignments.map(a=>(
              <li key={a.sheetName} className="p-2 flex items-center gap-3">
                <div className="min-w-[220px] text-sm">{a.sheetName}</div>
                <select
                  value={a.user_id}
                  onChange={e=>setAssign(a.sheetName, e.target.value)}
                  className="flex-1 border rounded px-2 py-1.5 text-sm"
                >
                  <option value="">— nicht zuordnen —</option>
                  {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <div className="text-xs text-gray-500">
            Tipp: Automatisch zugeordnet, wenn Excel-Name exakt dem Team-Mitgliedsnamen entspricht.
          </div>
        </div>
      )}

      {/* Vorschau */}
      {cur && (
        <div className="max-w-[1000px]">
          <div className="text-sm font-medium mb-2">Vorschau (erste 20 Zeilen · nur Tageszellen)</div>
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1.5 border-b text-left">Mitarbeiter (Excel)</th>
                  {dateCols.map(h => <th key={h} className="px-2 py-1.5 border-b text-left">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {previewRows.length===0 && (<tr><td className="px-2 py-2 text-gray-500" colSpan={dateCols.length+1}>Keine Daten</td></tr>)}
                {previewRows.map((r,i)=>(
                  <tr key={i} className="odd:bg-white even:bg-gray-50/50">
                    <td className="px-2 py-1.5 border-b">{r.person}</td>
                    {r.cols.map((c,ci)=><td key={ci} className="px-2 py-1.5 border-b align-top whitespace-pre">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submit */}
      <form onSubmit={submit} className="space-y-2">
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-60"
                disabled={!cur || !teamId || !dateCols.length || busy}>
          {busy ? 'Hochladen…' : 'Hochladen'}
        </button>
      </form>

      {out && <pre className="bg-black/5 p-3 rounded text-xs whitespace-pre-wrap">{out}</pre>}
    </div>
  );
}

function MapSelect({
  label, value, onChange, options
}:{ label:string; value:string; onChange:(v:string)=>void; options:Array<{value:string;label:string}> }) {
  return (
    <label className="block text-sm">
      <span className="block mb-1">{label}</span>
      <select value={value} onChange={e=>onChange(e.target.value)} className="w-full border rounded px-2 py-1.5">
        <option value="">— keine —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
