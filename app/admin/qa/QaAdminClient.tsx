/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';

// Re-Use: einfache User-Struktur wie im bestehenden Admin-Feedback
type User = { id: string; name?: string|null; email?: string|null };

// CSV → Parsed Row (rohe Werte aus Upload)
type ParsedRow = {
  ts?: string | null;              // Datum/Uhrzeit (z. B. 14.10.2025 09:30)
  incident_type?: string | null;   // z. B. "Fehler", "Hinweis", "Rekla"
  category?: string | null;        // z. B. "Angebot", "Beratung", "Sonstiges"
  severity?: string | null;        // z. B. "low|medium|high" oder Score
  description?: string | null;     // Freitext / Kommentar
  booking_number?: string | null;  // optional, wird zu BO verlinkt
  agent_first?: string | null;     // aus CSV
  agent_last?: string | null;      // aus CSV
  agent_name?: string | null;      // aus CSV (falls vorhanden)
};

// Bereits gespeicherter Datensatz (vereinfacht)
type ExistingRow = {
  id: number;
  created_at: string;
  ts?: string | null;
  user_id: string;
  agent_name: string | null;
  incident_type: string | null;
  category: string | null;
  severity: string | null;
  description: string | null;
  booking_number_hash?: string | null;
};

const norm = (s?: string|null) => (s??'').toLowerCase().replace(/\s+/g,' ').trim();
const buildAgentKey = (r: ParsedRow) => {
  const fallback = [r.agent_first, r.agent_last].filter(Boolean).join(' ').trim();
  return norm(r.agent_name || fallback) || '';
};

export default function AdminQAPage(){
  const [users, setUsers] = useState<User[]>([]);
  const [assignMode, setAssignMode] = useState<'auto'|'fixed'>('auto');
  const [fixedUserId, setFixedUserId] = useState('');

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [dropDupes, setDropDupes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [agentMap, setAgentMap] = useState<Record<string, string>>({}); // erkannter Name → user_id

  const usersById = useMemo(()=> new Map(users.map(u=>[u.id, u])), [users]);

  useEffect(()=>{(async()=>{
    try{
      const r = await fetch('/api/admin/users', { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      const data = Array.isArray(j?.data) ? j.data : [];
      setUsers(data.map((u:any)=>({ id:String(u.user_id??u.id??''), name:u.name??null, email:u.email??null })));
    }catch{}
  })();},[]);

  async function pickCSV(){
    const i = document.createElement('input');
    i.type = 'file'; i.accept = '.csv,text/csv';
    i.onchange = async ()=>{
      const f = i.files?.[0]; if (!f) return;
      setLoading(true);
      try {
        const fd = new FormData(); fd.append('file', f);
        const r = await fetch('/api/admin/qa/parse', { method:'POST', body: fd });
        const j = await r.json().catch(()=>({ ok:false }));
        if (r.ok && j?.ok) {
          const parsed: ParsedRow[] = Array.isArray(j.rows) ? j.rows : [];
          // Debug-Ausgabe , um zu sehen, was aus der API kommt:
  console.log('parsed example row', Array.isArray(j.rows) ? j.rows[0] : j.rows);
          setRows(parsed);
          setSelectedIdx(new Set(parsed.map((_,i)=>i)));
          // erkannte Agenten sammeln
          const unique = new Map<string,string>();
          for (const row of parsed) {
            const key = buildAgentKey(row); if (!key) continue;
            const label = (row.agent_name || [row.agent_first,row.agent_last].filter(Boolean).join(' ').trim() || '').trim();
            if (!unique.has(key)) unique.set(key, label || key);
          }
          const empty: Record<string,string> = {}; unique.forEach((_v,k)=> empty[k] = '');
          setAgentMap(empty);
        } else {
          alert(j?.error || 'CSV konnte nicht gelesen werden');
        }
      } finally { setLoading(false); }
    };
    i.click();
  }

  const dupInfo = useMemo(()=>{
    const map = new Map<string, number[]>();
    rows.forEach((r,i)=>{
      const key = [norm(r.ts||''), norm(r.incident_type), norm(r.category), norm(r.severity), (r.description||'').trim(), (r.booking_number||'').trim(), buildAgentKey(r)].join('|');
      const arr = map.get(key) ?? []; arr.push(i); map.set(key, arr);
    });
    const dupIdx = new Set<number>();
    map.forEach(arr=>{ if (arr.length>1) arr.slice(1).forEach(i=>dupIdx.add(i)); });
    return { dupIdx };
  },[rows]);

  const agentSummary = useMemo(()=>{
    const map = new Map<string,{label:string,count:number}>();
    for (const r of rows) {
      const key = buildAgentKey(r); if (!key) continue;
      const label = (r.agent_name || [r.agent_first,r.agent_last].filter(Boolean).join(' ').trim() || '').trim();
      const cur = map.get(key) ?? { label, count:0 }; cur.count++; cur.label = cur.label || label; map.set(key,cur);
    }
    return Array.from(map.entries()).map(([key,v])=>({ key, label: v.label || key, count: v.count }));
  },[rows]);

  const rowsForSave = useMemo(()=>{
    const filtered = rows.filter((_,i)=> selectedIdx.has(i) && !(dropDupes && dupInfo.dupIdx.has(i)));
    return filtered.filter(r=> assignMode==='fixed' ? true : !!(buildAgentKey(r) && agentMap[buildAgentKey(r)]) )
      .map(r=>{
        const k = buildAgentKey(r); const chosenId = agentMap[k];
        if (assignMode==='auto' && chosenId) {
          const u = usersById.get(chosenId);
          if (u?.name) return { ...r, agent_name: u.name, agent_first:null, agent_last:null } as ParsedRow;
        }
        return r;
      });
  },[rows, selectedIdx, dropDupes, dupInfo, assignMode, agentMap, usersById]);

  async function save(){
    if (rowsForSave.length===0) return;
    let effectiveUserId = '';
    if (assignMode==='fixed') {
      if (!fixedUserId) return alert('Bitte Mitarbeiter für feste Zuordnung wählen.');
      effectiveUserId = fixedUserId;
    } else {
      effectiveUserId = Object.values(agentMap).find(Boolean) || users[0]?.id || '';
      if (!effectiveUserId) return alert('Kein Benutzer gefunden.');
    }
    setSaving(true);
    try{
      const r = await fetch('/api/admin/qa/import',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: effectiveUserId, rows: rowsForSave })
      });
      const j = await r.json().catch(()=>({}));
      if (r.ok && j?.ok) {
        setRows([]); setSelectedIdx(new Set()); setAgentMap({});
        alert(`Import ok – ${j.inserted ?? 0} Zeilen${j.skipped? ` (übersprungen: ${j.skipped})` : ''}`);
      } else { alert(j?.error || 'Import fehlgeschlagen'); }
    } finally { setSaving(false); }
  }

  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">QA-Import (CSV) & Zuordnung</h1>
        <a href="/api/admin/qa/template" className="text-sm text-blue-600 hover:underline">CSV-Vorlage</a>
      </div>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900 space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <fieldset className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            <legend className="px-1 text-sm text-gray-600">Import-Modus</legend>
            <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-3">
              <button onClick={()=>setAssignMode('auto')} className={`px-4 py-2 text-sm ${assignMode==='auto'?'bg-blue-600 text-white':''}`}>Manuell je Agent</button>
              <button onClick={()=>setAssignMode('fixed')} className={`px-4 py-2 text-sm ${assignMode==='fixed'?'bg-blue-600 text-white':''}`}>Alle → 1 Mitarbeiter</button>
            </div>
            {assignMode==='fixed' && (
              <div className="grid gap-2">
                <div className="text-sm">Fest zuordnen zu</div>
                <UserSelect users={users} value={fixedUserId} onChange={setFixedUserId} placeholder="– Mitarbeiter wählen –" />
              </div>
            )}
            <div className="mt-4">
              <button onClick={pickCSV} className="px-3 py-2 rounded-xl border bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 dark:border-gray-700">
                {loading? 'Lese CSV…' : 'CSV auswählen'}
              </button>
            </div>
          </fieldset>
          <fieldset className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            <legend className="px-1 text-sm text-gray-600">Hinweise</legend>
            <ul className="list-disc pl-5 text-sm text-gray-600 dark:text-gray-300 space-y-1">
              <li>Namens-Erkennung: Spalten <code>agent_name</code> oder <code>agent_first/agent_last</code>.</li>
              <li>Duplikate werden optional entfernt (gleicher Timestamp/Typ/Kategorie/Text/Agent).</li>
              <li>BO-Link wird aus <code>booking_number</code> erstellt, sofern vorhanden.</li>
            </ul>
          </fieldset>
        </div>

        {rows.length>0 && assignMode==='auto' && (
          <AgentMapping agents={agentSummary} users={users} agentMap={agentMap} setAgentMap={setAgentMap} />
        )}

        {/* Vorschau */}
        {rows.length>0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center gap-3">
                <span>Vorschau: {rows.length}</span>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={dropDupes} onChange={e=>setDropDupes(e.target.checked)} className="h-4 w-4" />
                  <span>Duplikate vor dem Speichern entfernen</span>
                </label>
              </div>
              <button onClick={save} disabled={saving || rowsForSave.length===0 || (assignMode==='fixed' && !fixedUserId)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm">
                {saving? 'Speichere…' : `Speichern (${rowsForSave.length})`}
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
                  <tr>
                    {['Datum','Typ','Kategorie','Severity','Beschreibung','BO','Agent'].map(h=> <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,idx)=>{
                    const hidden = dropDupes && dupInfo.dupIdx.has(idx);
                    const boDirect = r.booking_number
  ? `https://backoffice.reisen.check24.de/booking/search/?booking_id=${encodeURIComponent(String(r.booking_number).replace(/\D+/g,''))}`
  : null;
                    return (
                      <tr key={idx} className={`border-t border-gray-100 dark:border-gray-800 ${hidden? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2 whitespace-nowrap">{r.ts ?? '–'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.incident_type ?? '–'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.category ?? '–'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.severity ?? '–'}</td>
                        <td className="px-3 py-2 max-w-[28rem]">{r.description ? <span className="whitespace-pre-wrap">{r.description}</span> : '–'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{boDirect ? <a className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200" href={boDirect} target="_blank" rel="noreferrer">extern</a> : '–'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.agent_name || [r.agent_first,r.agent_last].filter(Boolean).join(' ') || '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">CSV auswählen, dann werden Vorschau & Mapping angezeigt.</p>
        )}
      </section>
    </div>
  );
}

function AgentMapping({ agents, users, agentMap, setAgentMap }:{
  agents: { key:string; label:string; count:number }[];
  users: User[];
  agentMap: Record<string,string>;
  setAgentMap: React.Dispatch<React.SetStateAction<Record<string,string>>>;
}){
  if (agents.length===0) return null;
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/60 dark:bg-gray-800/30">
      <div className="text-sm font-medium mb-2">Erkannte Namen in der CSV (bitte zuordnen)</div>
      <div className="overflow-auto">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="bg-white/70 dark:bg-gray-900/40">
            <tr>
              <th className="text-left px-3 py-2">Name (CSV)</th>
              <th className="text-left px-3 py-2">Häufigkeit</th>
              <th className="text-left px-3 py-2 w-[420px]">Zuordnung</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(a=>{
              const val = agentMap[a.key] ?? '';
              return (
                <tr key={a.key} className="border-t border-gray-200 dark:border-gray-800">
                  <td className="px-3 py-2">{a.label || '(leer)'}</td>
                  <td className="px-3 py-2">{a.count}</td>
                  <td className="px-3 py-2">
                    <UserSelect users={users} value={val} onChange={(v)=> setAgentMap(prev=>({ ...prev, [a.key]: v }))} placeholder="– Mitarbeiter wählen –" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UserSelect({ users, value, onChange, placeholder }:{ users:User[]; value:string; onChange:(v:string)=>void; placeholder?:string; }){
  const [q, setQ] = useState('');
  const filtered = useMemo(()=>{
    const term = q.toLowerCase();
    return users.filter(u => (u.name||u.email||u.id).toLowerCase().includes(term));
  },[q,users]);
  const current = value ? users.find(u=>u.id===value) : undefined;
  const list = useMemo(()=> current ? [current, ...filtered.filter(u=>u.id!==current.id)] : filtered, [current,filtered]);
  return (
    <div className="grid gap-2 w-full">
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Suchen… (Name, E-Mail)" className="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 w-full" />
      <select value={value} onChange={e=>onChange(e.target.value)} className="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 w-full">
        <option value="">{placeholder||'– auswählen –'}</option>
        {list.map(u=>(<option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>))}
      </select>
    </div>
  );
}