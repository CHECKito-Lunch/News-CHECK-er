'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

type TeamRow = { team_id: string; name: string };
type MappingKey = 'date'|'start'|'end'|'employee'|'role'|'note'|'team';
type Mapping = Partial<Record<MappingKey,string>>;

type ParsedSheet = { name: string; headers: string[]; rows: string[][] };

function normalizeHeader(h: string){
  const map: Record<string,string> = { 'ä':'ae','ö':'oe','ü':'ue','ß':'ss' };
  return h.trim().toLowerCase()
    .replace(/[äöüß]/g, ch => map[ch] || ch)
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'');
}

const guesses: Record<MappingKey, RegExp[]> = {
  date:     [/\bdatum\b/, /\bdate\b/, /\btag\b/],
  start:    [/\bstart\b/, /\banfang\b/, /\bbeginn\b/, /\bvon\b/, /\bstart_time\b/],
  end:      [/\bende\b/, /\bend\b/, /\bbis\b/, /\bend_time\b/],
  employee: [/\bname\b/, /\bmitarbeiter\b/, /\bberater\b/, /\buser\b/, /\bvorname\b/, /\bnachname\b/, /\bvollname\b/, /\bfullname\b/],
  role:     [/\brolle\b/, /\brole\b/, /\bposition\b/, /\bfunktion\b/],
  note:     [/\bnotiz\b/, /\bnote\b/, /\bkommentar\b/, /\bbemerkung\b/],
  team:     [/\bteam\b/, /\bteamname\b/],
};

function autoMap(headers: string[]): Mapping {
  const norm = headers.map(h => ({ raw:h, norm: normalizeHeader(h) }));
  const pick = (key: MappingKey) => {
    const hit = norm.find(h => guesses[key].some(rx => rx.test(h.norm)));
    return hit?.raw;
  };
  return {
    date:     pick('date'),
    start:    pick('start'),
    end:      pick('end'),
    employee: pick('employee'),
    role:     pick('role'),
    note:     pick('note'),
    team:     pick('team'),
  };
}

function excelToSheets(file: File): Promise<ParsedSheet[]> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      try {
        const data = new Uint8Array(fr.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheets: ParsedSheet[] = [];
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          if (!ws) continue;
          const aoa = XLSX.utils.sheet_to_json<string[]> (ws, { header: 1, raw: true });
          const rows = (aoa as any[]).filter(r => Array.isArray(r) && r.length>0) as string[][];
          if (rows.length === 0) continue;
          const headers = (rows[0] || []).map(v => String(v ?? ''));
          const body = rows.slice(1).map(r => headers.map((_,i) => String(r[i] ?? '')));
          sheets.push({ name, headers, rows: body });
        }
        resolve(sheets);
      } catch (e) {
        reject(e);
      }
    };
    fr.readAsArrayBuffer(file);
  });
}

// Excel-Serienzahl → ISO (UTC Datum)
function excelSerialToISO(n: number): string | null {
  if (!Number.isFinite(n)) return null;
  // Excel (1900-System), + misst die 1900-Leap-Year-Anomalie (2 Tage Korrektur)
  const epoch = Date.UTC(1899, 11, 30);
  const ms = (n - 0) * 86400000;
  const d = new Date(epoch + ms);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Zeit-String oder Excel-Fraktion → "HH:MM"
function asHHMM(v: string): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  // Excel-Fraktion (z. B. 0.5 = 12:00)
  const num = Number(s);
  if (Number.isFinite(num) && num > 0 && num < 2) {
    const totalMin = Math.round(num * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  // HH:MM / H:MM
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = Math.min(23, Math.max(0, parseInt(m[1],10)));
    const mi = Math.min(59, Math.max(0, parseInt(m[2],10)));
    return `${String(hh).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;
  }
  return null;
}

export default function RosterUploadPage(){
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState<string>('');

  const [file, setFile] = useState<File|null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);

  const cur = sheets[sheetIdx];
  const [mapping, setMapping] = useState<Mapping>({});
  const [teamAutofill, setTeamAutofill] = useState<string>('');

  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async ()=>{
      const r = await fetch('/api/teamhub/my-teams', { cache:'no-store' });
      const j = await r.json().catch(()=>null);
      const arr: TeamRow[] = Array.isArray(j?.items) ? j.items : [];
      setTeams(arr);
      if (!teamId && arr.length) setTeamId(arr[0].team_id);
    })();
  }, []);

  async function onFileChange(f: File|null){
    setFile(f); setSheets([]); setMapping({}); setTeamAutofill(''); setOut(''); setErr('');
    if (!f) return;
    const parsed = await excelToSheets(f);
    setSheets(parsed);
    setSheetIdx(0);
    if (parsed[0]) {
      const auto = autoMap(parsed[0].headers);
      setMapping(auto);

      // Team-Autofill
      const teamCol = auto.team ? parsed[0].headers.indexOf(auto.team) : -1;
      if (teamCol >= 0) {
        const setVals = new Set(parsed[0].rows.map(r => (r[teamCol] ?? '').trim()).filter(Boolean));
        if (setVals.size === 1) {
          const only = [...setVals][0].toLowerCase();
          setTeamAutofill(only);
          const hit = teams.find(t => t.name.toLowerCase() === only);
          if (hit) setTeamId(hit.team_id);
        }
      }
    }
  }

  // Sheet-Wechsel → Mapping neu raten
  useEffect(() => {
    if (!cur) return;
    setMapping(prev => Object.keys(prev).length ? prev : autoMap(cur.headers));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetIdx, cur?.headers.join('|')]);

  const headerOptions = useMemo(()=> (cur?.headers||[]).map(h=>({value:h,label:h})), [cur?.headers]);

  function setMap(key: MappingKey, val: string){
    setMapping(m => ({ ...m, [key]: val || undefined }));
  }

  // Erste 30 Zeilen als Vorschau
  const preview = useMemo(()=> (cur?.rows||[]).slice(0,30), [cur]);

  async function submit(e:React.FormEvent){
    e.preventDefault();
    setErr(''); setOut('');
    if (!teamId) { setErr('Bitte Team wählen.'); return; }
    if (!cur || !file) { setErr('Bitte Excel auswählen.'); return; }
    // Pflichtfelder
    const need: MappingKey[] = ['date','start','end','employee'];
    for (const k of need) if (!mapping[k]) { setErr('Bitte Mapping vervollständigen.'); return; }

    setBusy(true);
    try {
      // JSON-Rows vorbereiten (roh; Server normalisiert Zeiten/Datum)
      const m = mapping as Required<Mapping>;
      const idx = (col: string) => cur.headers.indexOf(col);
      const iDate = idx(m.date), iStart = idx(m.start), iEnd = idx(m.end);
      const iEmp  = idx(m.employee), iRole = m.role?idx(m.role):-1, iNote = m.note?idx(m.note):-1;

      const rows = cur.rows.map(r => ({
        date_raw:  r[iDate],
        start_raw: r[iStart],
        end_raw:   r[iEnd],
        employee:  r[iEmp],
        role:      iRole>=0 ? r[iRole] : null,
        note:      iNote>=0 ? r[iNote] : null,
      }));

      const fd = new FormData();
      fd.set('team_id', teamId);
      fd.set('sheet_name', cur.name);
      fd.set('mapping', JSON.stringify(mapping));
      fd.set('rows', JSON.stringify(rows));   // wir schicken die extrahierten Rows als JSON

      const res = await fetch('/api/teamhub/roster/upload', { method:'POST', body: fd });
      const j = await res.json().catch(()=>null);
      if (!res.ok) setErr(j?.error || `Fehler ${res.status}`);
      setOut(JSON.stringify(j, null, 2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Dienstplan hochladen (Excel)</h1>

      {/* Team */}
      <div className="max-w-xl space-y-2">
        <label className="block text-sm font-medium">Team</label>
        <select value={teamId} onChange={e=>setTeamId(e.target.value)} className="w-full border rounded px-2 py-1.5">
          {teams.map(t => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
        </select>
        {teamAutofill && <div className="text-xs text-gray-500">Aus Datei erkannt: <b>{teamAutofill}</b></div>}
      </div>

      {/* Datei */}
      <div className="max-w-xl space-y-2">
        <label className="block text-sm font-medium">Excel-Datei (.xlsx/.xls)</label>
        <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
               onChange={e=>onFileChange(e.target.files?.[0] ?? null)} />
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
            <MapSelect label="Datum" required value={mapping.date||''} onChange={v=>setMap('date', v)} options={headerOptions} />
            <MapSelect label="Beginn" required value={mapping.start||''} onChange={v=>setMap('start', v)} options={headerOptions} />
            <MapSelect label="Ende" required value={mapping.end||''} onChange={v=>setMap('end', v)} options={headerOptions} />
            <MapSelect label="Mitarbeiter" required value={mapping.employee||''} onChange={v=>setMap('employee', v)} options={headerOptions} />
            <MapSelect label="Rolle" value={mapping.role||''} onChange={v=>setMap('role', v)} options={headerOptions} />
            <MapSelect label="Notiz" value={mapping.note||''} onChange={v=>setMap('note', v)} options={headerOptions} />
          </div>
        </div>
      )}

      {/* Vorschau */}
      {cur && (
        <div className="max-w-6xl">
          <div className="text-sm font-medium mb-2">Vorschau: {cur.name} (erste 30 Zeilen)</div>
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>{cur.headers.map((h,i)=>(<th key={i} className="px-2 py-1.5 border-b text-left">{h}</th>))}</tr>
              </thead>
              <tbody>
                {preview.length===0 && (<tr><td className="px-2 py-2 text-gray-500" colSpan={cur.headers.length}>Keine Daten</td></tr>)}
                {preview.map((row,ri)=>(
                  <tr key={ri} className="odd:bg-white even:bg-gray-50/50">
                    {row.map((cell,ci)=>(<td key={ci} className="px-2 py-1.5 border-b align-top">{cell}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Upload sendet die extrahierten Zeilen als JSON an <code>/api/teamhub/roster/upload</code>.
          </div>
        </div>
      )}

      {/* Submit */}
      <form onSubmit={submit} className="space-y-3 max-w-xl">
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-60"
                disabled={!cur || !teamId || !file || busy}>
          {busy ? 'Hochladen…' : 'Hochladen'}
        </button>
      </form>

      {out && <pre className="bg-black/5 p-3 rounded text-xs whitespace-pre-wrap">{out}</pre>}
    </div>
  );
}

function MapSelect({
  label, value, onChange, options, required
}:{
  label:string; value:string; onChange:(v:string)=>void;
  options: Array<{value:string; label:string}>; required?:boolean;
}){
  return (
    <label className="block text-sm">
      <span className="block mb-1">{label}{required && <span className="text-red-600"> *</span>}</span>
      <select value={value} onChange={e=>onChange(e.target.value)} className="w-full border rounded px-2 py-1.5">
        <option value="">— keine —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
