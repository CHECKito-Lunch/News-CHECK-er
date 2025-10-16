/* eslint-disable react-hooks/exhaustive-deps */
 
'use client';

import { useEffect, useMemo, useState } from 'react';

/** ====== Typen ====== */
type TeamRow = { team_id: string; name: string };

type ParsedCSV = {
  headers: string[];
  rows: string[][];
};

type MappingKey = 'date' | 'start' | 'end' | 'employee' | 'role' | 'note' | 'team';

type Mapping = Partial<Record<MappingKey, string>>;

/** ====== Hilfsfunktionen ====== */

// robustes CSV-Parsing (1-Zeichen-Delimiter, quotes-aware)
function splitQuoted(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delim) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function buildDelimCandidates(){
  return [
    { label:'\\t', split: (s:string)=>splitQuoted(s, '\t') },
    { label:';',   split: (s:string)=>splitQuoted(s, ';') },
    { label:',',   split: (s:string)=>splitQuoted(s, ',') },
  ];
}

function pickSplitter(lines: string[]){
  const first = (lines.find(l=>l.trim().length>0) ?? '').replace(/^\uFEFF/, '');
  const cands = buildDelimCandidates();
  const scored = cands.map(c => ({ c, cols: c.split(first).length }));
  scored.sort((a,b)=>b.cols-a.cols);
  return scored[0].cols>1 ? scored[0].c : cands[0];
}

function parseCSVText(text: string): ParsedCSV {
  const rawLines = text.split(/\r?\n/).filter(l => l.length>0);
  if (rawLines.length === 0) return { headers: [], rows: [] };
  const splitter = pickSplitter(rawLines);
  const header = splitter.split(rawLines[0].replace(/^\uFEFF/, '')).map(s=>dequote(s));
  const rows = rawLines.slice(1).map(line => splitter.split(line).map(dequote));
  return { headers: header, rows };
}

function dequote(v?: string | null): string {
  if (v == null) return '';
  let s = v.trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1,-1).replace(/""/g, '"');
  return s;
}

function normalizeHeader(h: string){
  const map: Record<string,string> = { 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' };
  return h
    .replace(/^\uFEFF/, '')
    .trim().toLowerCase()
    .replace(/[äöüß]/g, ch => map[ch] || ch)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g,'');
}

// Heuristiken für Auto-Mapping
const guesses: Record<MappingKey, RegExp[]> = {
  date: [
    /\bdatum\b/, /\bdate\b/, /\btag\b/, /\bday\b/,
  ],
  start: [
    /\bstart\b/, /\banfang\b/, /\bbeginn\b/, /\bvon\b/, /\bstart_time\b/,
  ],
  end: [
    /\bende\b/, /\bend\b/, /\bbis\b/, /\bend_time\b/,
  ],
  employee: [
    /\bname\b/, /\bmitarbeiter\b/, /\bberater\b/, /\bemploy(e|ee)\b/, /\buser\b/,
    /\bvorname\b/, /\bnachname\b/, /\bfullname\b/,
  ],
  role: [
    /\brolle\b/, /\brole\b/, /\bposition\b/, /\bfunktion\b/, /\btaetigkeit\b/,
  ],
  note: [
    /\bnotiz\b/, /\bnote\b/, /\bkommentar\b/, /\bbemerkung\b/,
  ],
  team: [
    /\bteam\b/, /\bteamname\b/,
  ],
};

function autoMap(headers: string[]): Mapping {
  const map: Mapping = {};
  const normalized = headers.map(h => ({ raw: h, norm: normalizeHeader(h) }));

  (Object.keys(guesses) as MappingKey[]).forEach(key => {
    const patterns = guesses[key];
    const found = normalized.find(h => patterns.some(rx => rx.test(h.norm)));
    if (found) map[key] = found.raw;
  });

  // Fallbacks: wenn z. B. start/end nicht gefunden, aber Spalten sehen wie HH:MM aus → heuristisch
  // (bewusst minimal gehalten)
  return map;
}

/** ====== Seite ====== */
export default function RosterUploadPage(){
  // Teams
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState<string>('');
  const [teamAutofill, setTeamAutofill] = useState<string>(''); // aus CSV erkannt (Teamname)

  // Datei / CSV
  const [file, setFile] = useState<File|null>(null);
  const [csv, setCsv] = useState<ParsedCSV>({ headers: [], rows: [] });

  // Mapping
  const [mapping, setMapping] = useState<Mapping>({});

  const [out, setOut] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Teams laden
  useEffect(() => {
    (async ()=>{
      try{
        const r = await fetch('/api/teamhub/my-teams', { cache:'no-store' });
        const j = await r.json().catch(()=>null);
        const arr: TeamRow[] = Array.isArray(j?.items) ? j.items : [];
        setTeams(arr);
        if (!teamId && arr.length) setTeamId(arr[0].team_id);
      }catch{
        setTeams([]);
      }
    })();
  }, []);

  // Datei -> CSV + Auto-Mapping + Team-Autofill
  async function onFileChange(f: File|null){
    setFile(f);
    setCsv({ headers: [], rows: [] });
    setMapping({});
    setTeamAutofill('');

    if (!f) return;
    const text = await f.text();
    const parsed = parseCSVText(text);
    setCsv(parsed);

    // Auto-Mapping
    const auto = autoMap(parsed.headers);
    setMapping(auto);

    // Team-Autofill: falls CSV eine Team-Spalte enthält, versuche Match zu meinen Teams
    const teamCol = auto.team ? parsed.headers.indexOf(auto.team) : -1;
    if (teamCol >= 0) {
      const distinct = new Set(parsed.rows.map(r => (r[teamCol] ?? '').trim()).filter(Boolean));
      if (distinct.size === 1) {
        const only = [...distinct][0].toLowerCase();
        setTeamAutofill(only);
        const hit = teams.find(t => t.name.toLowerCase() === only);
        if (hit) setTeamId(hit.team_id);
      }
    }
  }

  const headerOptions = useMemo(()=> csv.headers.map(h => ({ value: h, label: h })), [csv.headers]);

  function setMap(key: MappingKey, value: string){
    setMapping(m => ({ ...m, [key]: value || undefined }));
  }

  const previewRows = useMemo(() => csv.rows.slice(0, 20), [csv.rows]);

  async function submit(e:React.FormEvent){
    e.preventDefault();
    setOut(''); setError('');
    if (!file || !teamId) { setError('Bitte Team auswählen und Datei wählen.'); return; }
    setBusy(true);
    try{
      const fd = new FormData();
      fd.set('team_id', teamId);
      fd.set('file', file);
      fd.set('mapping', JSON.stringify(mapping));
      // Optional: Dry-Run Schalter (wenn du im Backend validieren willst)
      // fd.set('validate_only', 'false');

      const r = await fetch('/api/teamhub/roster/upload', { method:'POST', body:fd });
      const j = await r.json().catch(()=>null);
      if (!r.ok) {
        setError(j?.error || `Upload fehlgeschlagen (${r.status})`);
      }
      setOut(JSON.stringify(j, null, 2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Dienstplan hochladen (CSV)</h1>

      {/* Auswahl: Team */}
      <div className="max-w-xl space-y-2">
        <label className="block text-sm font-medium">Team</label>
        <select
          value={teamId}
          onChange={e=>setTeamId(e.target.value)}
          className="w-full border rounded px-2 py-1.5"
        >
          {teams.map(t => (
            <option key={t.team_id} value={t.team_id}>{t.name}</option>
          ))}
        </select>
        {teamAutofill && (
          <div className="text-xs text-gray-500">
            Aus CSV erkanntes Team: <b>{teamAutofill}</b> (automatisch versucht zuzuordnen)
          </div>
        )}
      </div>

      {/* Datei */}
      <div className="max-w-xl space-y-2">
        <label className="block text-sm font-medium">CSV-Datei</label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={e=>onFileChange(e.target.files?.[0] ?? null)}
          className="block"
        />
        {file && <div className="text-xs text-gray-500">Datei: {file.name} – {(file.size/1024).toFixed(1)} KB</div>}
      </div>

      {/* Mapping */}
      {csv.headers.length > 0 && (
        <div className="max-w-3xl space-y-3">
          <div className="text-sm font-medium">Spalten-Zuordnung</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <MapSelect label="Datum"       value={mapping.date||''}     onChange={v=>setMap('date', v)}       options={headerOptions} required />
            <MapSelect label="Beginn"      value={mapping.start||''}    onChange={v=>setMap('start', v)}      options={headerOptions} required />
            <MapSelect label="Ende"        value={mapping.end||''}      onChange={v=>setMap('end', v)}        options={headerOptions} required />
            <MapSelect label="Mitarbeiter" value={mapping.employee||''} onChange={v=>setMap('employee', v)}   options={headerOptions} required />
            <MapSelect label="Rolle"       value={mapping.role||''}     onChange={v=>setMap('role', v)}       options={headerOptions} />
            <MapSelect label="Notiz"       value={mapping.note||''}     onChange={v=>setMap('note', v)}       options={headerOptions} />
            <MapSelect label="Team (CSV)"  value={mapping.team||''}     onChange={v=>setMap('team', v)}       options={headerOptions} />
          </div>

          {/* Hinweis */}
          <div className="text-xs text-gray-500">
            Mindestens erforderlich: <b>Datum</b>, <b>Beginn</b>, <b>Ende</b>, <b>Mitarbeiter</b>.
          </div>
        </div>
      )}

      {/* Vorschau */}
      {csv.headers.length > 0 && (
        <div className="max-w-5xl">
          <div className="text-sm font-medium mb-2">Vorschau (erste 20 Zeilen)</div>
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {csv.headers.map((h, i) => (
                    <th key={i} className="text-left px-2 py-1.5 border-b">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.length === 0 && (
                  <tr><td className="px-2 py-2 text-gray-500" colSpan={csv.headers.length}>Keine Datenzeilen</td></tr>
                )}
                {previewRows.map((row, rIdx) => (
                  <tr key={rIdx} className="odd:bg-white even:bg-gray-50/50">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-2 py-1.5 border-b align-top">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mapping-Hinweis unter Vorschau */}
          <div className="mt-2 text-xs text-gray-500">
            Prüfe die passenden Spalten in den Drop-down-Feldern oben. Der Upload sendet die CSV **plus** dein Mapping an <code>/api/teamhub/roster/upload</code>.
          </div>
        </div>
      )}

      {/* Upload-Form */}
      <form onSubmit={submit} className="space-y-3 max-w-xl">
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button
          disabled={!file || !teamId || busy}
          className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-60"
        >
          {busy ? 'Lade hoch…' : 'Hochladen'}
        </button>
      </form>

      {out && <pre className="bg-black/5 p-3 rounded text-xs whitespace-pre-wrap">{out}</pre>}
    </div>
  );
}

/** ====== kleine UI-Komponente ====== */
function MapSelect({
  label, value, onChange, options, required
}: {
  label: string;
  value: string;
  onChange: (v:string)=>void;
  options: Array<{value:string; label:string}>;
  required?: boolean;
}){
  return (
    <label className="block text-sm">
      <span className="block mb-1">
        {label}{required && <span className="text-red-600"> *</span>}
      </span>
      <select
        value={value}
        onChange={e=>onChange(e.target.value)}
        className="w-full border rounded px-2 py-1.5"
      >
        <option value="">— keine —</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}
