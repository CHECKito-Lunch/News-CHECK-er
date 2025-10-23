/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';

type User = { id: string; name?: string|null; email?: string|null };

type ParsedRow = {
  ts?: string | null;
  incident_type?: string | null;
  category?: string | null;
  severity?: string | null;
  description?: string | null;
  booking_number?: string | null;
  agent_first?: string | null;
  agent_last?: string | null;
  agent_name?: string | null;
};

const norm = (s?: string|null) => (s??'').toLowerCase().replace(/\s+/g,' ').trim();

const buildAgentKey = (r: ParsedRow) => {
  const fallback = [r.agent_first, r.agent_last].filter(Boolean).join(' ').trim();
  return norm(r.agent_name || fallback) || '';
};

/**
 * 🔥 Verbessertes Name-Matching (auch für "Nachname, Vorname" Format)
 */
function normalizeNameForMatching(name: string): string[] {
  const clean = name.trim().replace(/\s+/g, ' ');
  const variants = new Set<string>();
  
  variants.add(clean.toLowerCase());
  
  // Handle "Nachname, Vorname" Format
  if (clean.includes(',')) {
    const parts = clean.split(',').map(p => p.trim());
    if (parts.length === 2) {
      variants.add(`${parts[1]} ${parts[0]}`.toLowerCase());
      variants.add(`${parts[0]} ${parts[1]}`.toLowerCase());
    }
  }
  
  // Regular "Vorname Nachname" -> umdrehen
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length >= 2 && !clean.includes(',')) {
    variants.add(parts.reverse().join(' ').toLowerCase());
    parts.reverse();
  }
  
  const wordSet = parts.map(p => p.toLowerCase()).join('|');
  variants.add(wordSet);
  
  return Array.from(variants);
}

function namesMatch(name1: string, name2: string): boolean {
  const variants1 = normalizeNameForMatching(name1);
  const variants2 = normalizeNameForMatching(name2);
  
  for (const v1 of variants1) {
    for (const v2 of variants2) {
      if (v1 === v2) return true;
    }
  }
  
  const words1 = name1.toLowerCase().replace(/,/g, ' ').split(/\s+/).filter(w => w.length > 1);
  const words2 = name2.toLowerCase().replace(/,/g, ' ').split(/\s+/).filter(w => w.length > 1);
  const matches = words1.filter(w => words2.includes(w));
  
  return matches.length >= Math.min(2, Math.min(words1.length, words2.length));
}

/**
 * 🔥 Auto-Matching mit Debug-Logging
 */
function autoMatchAgents(
  agents: { key: string; label: string; count: number }[], 
  users: User[]
): Record<string, string> {
  const matched: Record<string, string> = {};
  
  for (const agent of agents) {
    const csvName = agent.label || agent.key;
    if (!csvName) continue;

    const match = users.find(u => {
      const userName = u.name || u.email || '';
      return namesMatch(csvName, userName);
    });

    if (match) {
      matched[agent.key] = match.id;
      console.log(`[QA Import] ✓ Match: "${csvName}" -> "${match.name || match.email}"`);
    } else {
      console.log(`[QA Import] ✗ No match: "${csvName}"`);
    }
  }

  return matched;
}

export default function AdminQAPage(){
  const [users, setUsers] = useState<User[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [dropDupes, setDropDupes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});

  const usersById = useMemo(()=> new Map(users.map(u=>[u.id, u])), [users]);

  useEffect(()=>{(async()=>{
    try{
      const r = await fetch('/api/admin/users', { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      const data = Array.isArray(j?.data) ? j.data : [];
      setUsers(data.map((u:any)=>({ 
        id: String(u.user_id ?? u.id ?? ''), 
        name: u.name ?? null, 
        email: u.email ?? null 
      })));
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
          console.log('parsed example row', Array.isArray(j.rows) ? j.rows[0] : j.rows);
          
          setRows(parsed);
          setSelectedIdx(new Set(parsed.map((_,i)=>i)));
          
          const unique = new Map<string,string>();
          for (const row of parsed) {
            const key = buildAgentKey(row); if (!key) continue;
            const label = (row.agent_name || [row.agent_first,row.agent_last].filter(Boolean).join(' ').trim() || '').trim();
            if (!unique.has(key)) unique.set(key, label || key);
          }
          
          const agentSummary = Array.from(unique.entries()).map(([key, label]) => ({
            key,
            label,
            count: parsed.filter(r => buildAgentKey(r) === key).length
          }));

          const autoMatched = autoMatchAgents(agentSummary, users);
          setAgentMap(autoMatched);
          
          console.log('[QA Import] Auto-matched:', Object.keys(autoMatched).length, '/', agentSummary.length);
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
      const key = [
        norm(r.ts||''), 
        norm(r.incident_type), 
        norm(r.category), 
        norm(r.severity), 
        (r.description||'').trim(), 
        (r.booking_number||'').trim(), 
        buildAgentKey(r)
      ].join('|');
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
      const cur = map.get(key) ?? { label, count:0 }; 
      cur.count++; 
      cur.label = cur.label || label; 
      map.set(key,cur);
    }
    return Array.from(map.entries()).map(([key,v])=>({ key, label: v.label || key, count: v.count }));
  },[rows]);



  const rowsForSave = useMemo(()=>{
    const filtered = rows.filter((_,i)=> selectedIdx.has(i) && !(dropDupes && dupInfo.dupIdx.has(i)));
    return filtered
      .filter(r=> !!(buildAgentKey(r) && agentMap[buildAgentKey(r)]))
      .map(r=>{
        const k = buildAgentKey(r); 
        const chosenId = agentMap[k];
        if (!chosenId) return r;
        const u = usersById.get(chosenId);
        if (u?.name) return { ...r, agent_name: u.name, agent_first:null, agent_last:null } as ParsedRow;
        return r;
      });
  },[rows, selectedIdx, dropDupes, dupInfo, agentMap, usersById]);

  const skippedCount = useMemo(() => {
  const filtered = rows.filter((_,i)=> selectedIdx.has(i) && !(dropDupes && dupInfo.dupIdx.has(i)));
  return filtered.filter(r => {
    const k = buildAgentKey(r);
    return !!(k && !agentMap[k]); // Hat Agent, aber keine Zuordnung
  }).length;
}, [rows, selectedIdx, dropDupes, dupInfo, agentMap]);

 async function save(){
  if (rowsForSave.length === 0) {
    alert('Keine Einträge zum Speichern (alle unzugeordnet oder abgewählt).');
    return;
  }

  const effectiveUserId = Object.values(agentMap).find(Boolean) || users[0]?.id || '';
  if (!effectiveUserId) {
    alert('Kein Benutzer gefunden.');
    return;
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
      const msg = `Import erfolgreich – ${j.inserted ?? 0} Zeilen gespeichert${skippedCount > 0 ? `, ${skippedCount} unzugeordnet übersprungen` : ''}`;
      alert(msg);
    } else { 
      alert(j?.error || 'Import fehlgeschlagen'); 
    }
  } finally { 
    setSaving(false); 
  }
}


  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">QA-Import</h1>
        <a href="/api/admin/qa/template" className="text-sm text-blue-600 hover:underline">CSV-Vorlage</a>
      </div>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900 space-y-4">
        
        {/* Upload Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={pickCSV}
            disabled={loading}
            className="px-4 py-2 rounded-xl border bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
          >
            {loading ? 'Lese CSV…' : 'CSV auswählen'}
          </button>
          <p className="text-sm text-gray-600">
            🔥 Automatisches Name-Matching aktiv – Mitarbeiter werden automatisch erkannt (auch &quot;Nachname, Vorname&quot; Format).
          </p>
        </div>

        {/* Agent Mapping */}
        {rows.length > 0 && agentSummary.length > 0 && (
          <AgentMapping agents={agentSummary} users={users} agentMap={agentMap} setAgentMap={setAgentMap} />
        )}

        {/* Preview */}
        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center gap-3">
                <span>Vorschau: {rows.length} Einträge</span>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={dropDupes} onChange={e=>setDropDupes(e.target.checked)} className="h-4 w-4" />
                  <span>Duplikate entfernen</span>
                </label>
                {dupInfo.dupIdx.size > 0 && (
                  <span className="ml-3 text-amber-700 dark:text-amber-400">
                    {dupInfo.dupIdx.size} Duplikate erkannt
                  </span>
                )}
              </div>
              <button 
  onClick={save} 
  disabled={saving || rowsForSave.length === 0}  // canSave entfernt!
  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm"
>
  {saving ? 'Speichere…' : `Speichern (${rowsForSave.length})`}
</button>
            </div>

            <div className="max-h-[60vh] overflow-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
                  <tr>
                    {['Datum','Typ','Kategorie','Severity','Beschreibung','BO','Agent'].map(h=> 
                      <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,idx)=>{
                    const hidden = dropDupes && dupInfo.dupIdx.has(idx);
                    const boDirect = r.booking_number
                      ? `https://backoffice.reisen.check24.de/booking/search/?booking_id=${encodeURIComponent(String(r.booking_number).replace(/\D+/g,''))}`
                      : null;
                    return (
                      <tr key={idx} className={`border-t border-gray-100 dark:border-gray-800 ${hidden ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2 whitespace-nowrap">{r.ts ?? '–'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.incident_type ?? '–'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.category ?? '–'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.severity ?? '–'}</td>
                        <td className="px-3 py-2 max-w-[28rem]">
                          {r.description ? <span className="whitespace-pre-wrap">{r.description}</span> : '–'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {boDirect && (
                            <a className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200" 
                               href={boDirect} target="_blank" rel="noreferrer">
                              extern
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.agent_name || [r.agent_first,r.agent_last].filter(Boolean).join(' ') || '–'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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
  if (agents.length === 0) return null;
  
  const matchedCount = Object.values(agentMap).filter(Boolean).length;
  
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/60 dark:bg-gray-800/30">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium">
          Erkannte Mitarbeiter in der CSV
          <span className="ml-2 text-xs text-gray-500">
            ({matchedCount}/{agents.length} automatisch zugeordnet)
          </span>
        </div>
      </div>
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
              const isAutoMatched = !!val;
              return (
                <tr key={a.key} className={`border-t border-gray-200 dark:border-gray-800 ${isAutoMatched ? 'bg-green-50/30 dark:bg-green-900/10' : 'bg-amber-50/30 dark:bg-amber-900/10'}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {a.label || '(leer)'}
                      {isAutoMatched ? (
                        <span className="text-xs text-green-600 dark:text-green-400">✓ automatisch</span>
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400">⚠ bitte manuell zuordnen</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{a.count}</td>
                  <td className="px-3 py-2">
                    <UserSelect 
                      users={users} 
                      value={val} 
                      onChange={(v)=> setAgentMap(prev=>({ ...prev, [a.key]: v }))} 
                      placeholder="– Mitarbeiter wählen –" 
                    />
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

function UserSelect({ users, value, onChange, placeholder }:{
  users:User[]; value:string; onChange:(v:string)=>void; placeholder?:string;
}){
  const [q, setQ] = useState('');
  const filtered = useMemo(()=>{
    const term = q.toLowerCase();
    return users.filter(u => (u.name||u.email||u.id).toLowerCase().includes(term));
  },[q,users]);
  const current = value ? users.find(u=>u.id===value) : undefined;
  const list = useMemo(()=> current ? [current, ...filtered.filter(u=>u.id!==current.id)] : filtered, [current,filtered]);
  
  return (
    <div className="grid gap-2 w-full">
      <input 
        value={q} 
        onChange={e=>setQ(e.target.value)} 
        placeholder="Suchen… (Name, E-Mail)" 
        className="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 w-full text-sm" 
      />
      <select 
        value={value} 
        onChange={e=>onChange(e.target.value)} 
        className="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 w-full text-sm"
      >
        <option value="">{placeholder||'– auswählen –'}</option>
        {list.map(u=>(<option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>))}
      </select>
    </div>
  );
}
