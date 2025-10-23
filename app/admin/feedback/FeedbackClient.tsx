/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-html-link-for-pages */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-const */
'use client';

import { useEffect, useMemo, useState } from 'react';

/* ===========================
   Types
=========================== */
type User = { id: string; user_id?: string|null; name?: string; email?: string };

type ParsedRow = {
  ts?: string | null;
  bewertung?: number | null;
  beraterfreundlichkeit?: number | null;
  beraterqualifikation?: number | null;
  angebotsattraktivitaet?: number | null;
  kommentar?: string | null;
  template_name?: string | null;
  rekla?: 'ja' | 'nein' | null;
  geklaert?: 'ja' | 'nein' | null;
  feedbacktyp?: string | null;
  note?: string;
  booking_number?: string | null;
  agent_first?: string | null;
  agent_last?: string | null;
  agent_name?: string | null;
};

type ExistingRow = {
  id: number;
  ts?: string | null;
  feedback_at: string;
  channel: string | null;
  rating_overall: number | null;
  rating_friend: number | null;
  rating_qual: number | null;
  rating_offer: number | null;
  comment_raw: string | null;
  template_name: string | null;
  reklamation: boolean | null;
  resolved: boolean | null;
  note: string | null;
  booking_number_hash?: string | null;
};

/* ===========================
   Helpers
=========================== */
const normName = (s?: string|null) =>
  (s ?? '').toLowerCase().replace(/\s+/g,' ').trim();

const buildAgentKey = (r: ParsedRow) => {
  const fallback = [r.agent_first, r.agent_last].filter(Boolean).join(' ').trim();
  return normName(r.agent_name || fallback) || '';
};

/**
 * 🔥 Verbessertes Name-Matching (auch für "Nachname, Vorname" Format)
 */
function normalizeNameForMatching(name: string): string[] {
  const clean = name.trim().replace(/\s+/g, ' ');
  const variants = new Set<string>();
  
  // Original
  variants.add(clean.toLowerCase());
  
  // Handle "Nachname, Vorname" Format
  if (clean.includes(',')) {
    const parts = clean.split(',').map(p => p.trim());
    if (parts.length === 2) {
      // "Schwarz, Sarah" -> "sarah schwarz"
      variants.add(`${parts[1]} ${parts[0]}`.toLowerCase());
      // Auch umgekehrt
      variants.add(`${parts[0]} ${parts[1]}`.toLowerCase());
    }
  }
  
  // Regular "Vorname Nachname" -> umdrehen
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length >= 2 && !clean.includes(',')) {
    variants.add(parts.reverse().join(' ').toLowerCase());
    parts.reverse();
  }
  
  // Wort-Set für partial matching
  const wordSet = parts.map(p => p.toLowerCase()).join('|');
  variants.add(wordSet);
  
  return Array.from(variants);
}

function namesMatch(name1: string, name2: string): boolean {
  const variants1 = normalizeNameForMatching(name1);
  const variants2 = normalizeNameForMatching(name2);
  
  // Exakte Übereinstimmung
  for (const v1 of variants1) {
    for (const v2 of variants2) {
      if (v1 === v2) return true;
    }
  }
  
  // Wort-basiertes Matching
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
      console.log(`[Feedback] ✓ Match: "${csvName}" -> "${match.name || match.email}"`);
    } else {
      console.log(`[Feedback] ✗ No match: "${csvName}"`);
    }
  }

  return matched;
}

const parseTsToMs = (ts?: string | null, fallbackDate?: string) => {
  const s = (ts ?? fallbackDate ?? '').trim();
  if (!s) return 0;
  const m1 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m1) {
    let [, dd, mm, yy, hh='00', mi='00'] = m1 as any;
    let year = +yy; if (yy.length===2) year = 2000 + year;
    return Date.UTC(year, +mm-1, +dd, +hh, +mi, 0);
  }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m2) {
    let [, dd, mm, yy, hh='00', mi='00'] = m2 as any;
    let year = +yy; if (yy.length===2) year = 2000 + year;
    return Date.UTC(year, +mm-1, +dd, +hh, +mi, 0);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

/* ===========================
   Page
=========================== */
export default function AdminFeedbackPage(){
  const [users, setUsers] = useState<User[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dropDupes, setDropDupes] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [agentMap, setAgentMap] = useState<Record<string, string>>({});

  const usersById = useMemo(()=> new Map(users.map(u=>[u.id, u])), [users]);

  /* ---------- Nutzerliste laden ---------- */
  useEffect(()=>{(async()=>{
    try{
      const r = await fetch('/api/admin/users', { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      const arr = Array.isArray(j?.data) ? j.data : [];
      const mapped = arr.map((u:any)=>({
        id: String(u?.user_id ?? u?.id ?? ''),
        user_id: u?.user_id ?? null,
        name: u?.name ?? null,
        email: u?.email ?? null,
      }));
      setUsers(mapped);
    }catch{}
  })();},[]);

  /* ---------- CSV wählen & parsen ---------- */
  async function pickCSV(){
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.csv,text/csv';
    i.onchange = async()=>{
      const f = i.files?.[0];
      if(!f) return;
      setLoading(true);
      const fd = new FormData();
      fd.append('file', f);
      try{
        const r = await fetch('/api/admin/feedback/parse', { method:'POST', body:fd });
        const ct = r.headers.get('content-type')||'';
        const raw = await r.text();
        const j = ct.includes('application/json') ? (raw ? JSON.parse(raw):{}) : { ok:false, error:'Unerwarteter Inhalt' };

        if(r.ok && j?.ok){
          const parsed = Array.isArray(j.rows) ? j.rows as ParsedRow[] : [];
          const safe = parsed.map(x=>({
            ts: x.ts ?? null,
            bewertung: numOrNull(x.bewertung),
            beraterfreundlichkeit: numOrNull(x.beraterfreundlichkeit),
            beraterqualifikation: numOrNull(x.beraterqualifikation),
            angebotsattraktivitaet: numOrNull(x.angebotsattraktivitaet),
            kommentar: fixMojibake(strOrNull(x.kommentar)),
            template_name: fixMojibake(strOrNull(x.template_name)),
            rekla: ynOrNull(x.rekla),
            geklaert: ynOrNull(x.geklaert),
            feedbacktyp: strOrNull(x.feedbacktyp),
            note: '',
            booking_number: strOrNull((x as any).booking_number),
            agent_first: strOrNull((x as any).agent_first),
            agent_last:  strOrNull((x as any).agent_last),
            agent_name:  strOrNull((x as any).agent_name),
          }));
          
          setRows(safe);
          setSelectedIdx(new Set(safe.map((_,i)=> i)));

          // 🔥 Erkannte Agenten sammeln
          const unique = new Map<string,string>();
          for (const r of safe) {
            const key = buildAgentKey(r);
            if (!key) continue;
            const label = (r.agent_name || [r.agent_first, r.agent_last].filter(Boolean).join(' ').trim() || '').trim();
            if (!unique.has(key)) unique.set(key, label || key);
          }
          
          const agentSummary = Array.from(unique.entries()).map(([key, label]) => ({
            key,
            label,
            count: safe.filter(r => buildAgentKey(r) === key).length
          }));

          // 🔥 Automatisches Matching
          const autoMatched = autoMatchAgents(agentSummary, users);
          setAgentMap(autoMatched);
          
          console.log('[Feedback] Auto-matched:', Object.keys(autoMatched).length, '/', agentSummary.length);
        } else {
          alert(j?.error||'CSV konnte nicht gelesen werden');
        }
      } catch (e){
        console.error(e);
        alert('Fehler beim Einlesen der CSV.');
      } finally {
        setLoading(false);
      }
    };
    i.click();
  }

  const dupInfo = useMemo(()=>{
    const map = new Map<string, number[]>();
    rows.forEach((r, i)=>{
      const key = [
        normTs(r.ts),
        (r.feedbacktyp||'').toLowerCase(),
        r.bewertung ?? -1,
        r.beraterfreundlichkeit ?? -1,
        r.beraterqualifikation ?? -1,
        r.angebotsattraktivitaet ?? -1,
        (r.kommentar||'').trim(),
        (r.template_name||'').trim(),
        (r.rekla||'').toLowerCase(),
        (r.geklaert||'').toLowerCase(),
        (r.booking_number||'').trim(),
        buildAgentKey(r),
      ].join('|');
      const arr = map.get(key) ?? [];
      arr.push(i);
      map.set(key, arr);
    });
    const dupIdx = new Set<number>();
    map.forEach(arr=>{ if (arr.length>1) arr.slice(1).forEach(i=>dupIdx.add(i)); });
    return { dupIdx };
  },[rows]);

  const agentSummary = useMemo(()=>{
    const map = new Map<string,{label:string,count:number}>();
    for (const r of rows) {
      const key = buildAgentKey(r);
      if (!key) continue;
      const label = (r.agent_name || [r.agent_first, r.agent_last].filter(Boolean).join(' ').trim() || '').trim();
      const cur = map.get(key) ?? { label, count: 0 };
      cur.count++; cur.label = cur.label || label;
      map.set(key, cur);
    }
    return Array.from(map.entries()).map(([key, v])=>({ key, label: v.label || key, count: v.count }));
  }, [rows]);

  const canSave = useMemo(()=>{
    for (const a of agentSummary) {
      if (!agentMap[a.key]) return false;
    }
    return true;
  }, [agentSummary, agentMap]);

  function isAllVisibleSelected(){
    let all=true, any=false;
    rows.forEach((_,i)=>{
      if (dropDupes && dupInfo.dupIdx.has(i)) return;
      const sel = selectedIdx.has(i);
      any = any || sel;
      all = all && sel;
    });
    return {all, any};
  }
  
  function toggleAllVisible(){
    const {all} = isAllVisibleSelected();
    const next = new Set<number>(selectedIdx);
    rows.forEach((_,i)=>{
      if (dropDupes && dupInfo.dupIdx.has(i)) return;
      if (all) next.delete(i); else next.add(i);
    });
    setSelectedIdx(next);
  }

  const rowsForSave = useMemo(()=>{
    const filtered = rows.filter((_,i)=> selectedIdx.has(i) && !(dropDupes && dupInfo.dupIdx.has(i)));
    return filtered
      .filter(r=> !!(buildAgentKey(r) && agentMap[buildAgentKey(r)]))
      .map(r=>{
        const key = buildAgentKey(r);
        const chosenId = agentMap[key];
        if (!chosenId) return r;
        const u = usersById.get(chosenId);
        if (u?.name) return { ...r, agent_name: u.name, agent_first: null, agent_last: null } as ParsedRow;
        return r;
      });
  }, [rows, dropDupes, dupInfo, agentMap, usersById, selectedIdx]);

  async function save(){
    if (rowsForSave.length === 0 || !canSave) {
      alert('Bitte allen Mitarbeitern einen User zuordnen.');
      return;
    }

    const fallbackUserId = Object.values(agentMap).find(Boolean) || users[0]?.id;
    if (!fallbackUserId) {
      alert('Kein Benutzer vorhanden.');
      return;
    }

    setSaving(true);
    try{
      const r = await fetch('/api/admin/feedback/import',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          user_id: fallbackUserId,
          rows: rowsForSave
        })
      });
      const j = await r.json().catch(()=>({}));
      if(r.ok && j?.ok){
        setRows([]);
        setAgentMap({});
        setSelectedIdx(new Set());
        alert(`Import erfolgreich – ${j.inserted ?? 0} Zeilen${j.skipped ? ` (${j.skipped} übersprungen)` : ''}`);
      } else {
        alert(j?.error||'Import fehlgeschlagen');
      }
    } catch(e){
      console.error(e);
      alert('Netzwerk-/Serverfehler beim Import.');
    } finally {
      setSaving(false);
    }
  }

  const { all: allSelected } = isAllVisibleSelected();

  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Feedback-Import</h1>
        <a href="/api/admin/feedback/template" className="text-sm text-blue-600 hover:underline">
          CSV-Vorlage herunterladen
        </a>
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
            🔥 Automatisches Name-Matching aktiv – Mitarbeiter werden automatisch erkannt und zugeordnet.
          </p>
        </div>

        {/* Agent Mapping */}
        {rows.length > 0 && agentSummary.length > 0 && (
          <AgentMappingPanel
            agents={agentSummary}
            users={users}
            agentMap={agentMap}
            setAgentMap={setAgentMap}
          />
        )}

        {/* Preview Table */}
        {rows.length > 0 && (
          <>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center gap-3">
                <span>Vorschau: {rows.length} Einträge</span>
                <button
                  onClick={toggleAllVisible}
                  className="px-2 py-1 rounded border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/10"
                >
                  {allSelected ? 'Alle abwählen' : 'Alle auswählen'}
                </button>
                <span className="text-gray-500">
                  Ausgewählt: {[...selectedIdx].filter(i=>!(dropDupes && dupInfo.dupIdx.has(i))).length}
                </span>
                {dupInfo.dupIdx.size > 0 && (
                  <span className="ml-3 text-amber-700 dark:text-amber-400">
                    {dupInfo.dupIdx.size} Duplikate erkannt
                  </span>
                )}
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dropDupes}
                  onChange={e => setDropDupes(e.target.checked)}
                  className="h-4 w-4"
                />
                <span>Duplikate entfernen</span>
              </label>
            </div>

            <div className="mt-2 max-h-[60vh] overflow-auto rounded-xl border border-gray-200 dark:border-gray-800">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <input type="checkbox" checked={allSelected} onChange={toggleAllVisible} />
                    </th>
                    {['Datum','Channel','Ø','F','Q','A','Kommentar','Template','Rekla','Geklärt?','BO','Notiz'].map(h=> (
                      <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,idx)=>{
                    const isDup = dupInfo.dupIdx.has(idx);
                    const hiddenByDup = dropDupes && isDup;
                    const boDirect = r.booking_number ? `https://backoffice.reisen.check24.de/booking/search/?booking_number=${encodeURIComponent(r.booking_number)}` : undefined;
                    return (
                      <tr key={idx} className={`border-t border-gray-100 dark:border-gray-800 ${hiddenByDup ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2">
                          {!hiddenByDup && (
                            <input
                              type="checkbox"
                              checked={selectedIdx.has(idx)}
                              onChange={(e)=>{
                                const next = new Set(selectedIdx);
                                if (e.target.checked) next.add(idx); else next.delete(idx);
                                setSelectedIdx(next);
                              }}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.ts ?? '–'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.feedbacktyp ?? '–'}</td>
                        <td className="px-3 py-2 font-medium">{r.bewertung ?? '–'}</td>
                        <td className="px-3 py-2">{r.beraterfreundlichkeit ?? '–'}</td>
                        <td className="px-3 py-2">{r.beraterqualifikation ?? '–'}</td>
                        <td className="px-3 py-2">{r.angebotsattraktivitaet ?? '–'}</td>
                        <td className="px-3 py-2 max-w-[26rem]">{r.kommentar ? <span className="whitespace-pre-wrap">{r.kommentar}</span> : '–'}</td>
                        <td className="px-3 py-2">{r.template_name ?? '–'}</td>
                        <td className="px-3 py-2">
                          <YnToggle
                            value={r.rekla ?? null}
                            onChange={(v)=>setRows(prev=>prev.map((x,i)=> i===idx ? {...x, rekla:v} : x))}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <YnToggle
                            value={r.geklaert ?? null}
                            onChange={(v)=>setRows(prev=>prev.map((x,i)=> i===idx ? {...x, geklaert:v} : x))}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {boDirect && (
                            <a className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200" href={boDirect} target="_blank" rel="noreferrer">
                              extern
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2 w-[22rem]">
                          <input
                            value={r.note||''}
                            onChange={(e)=>setRows(prev=>prev.map((x,i)=> i===idx ? {...x, note:e.target.value} : x))}
                            placeholder="optional…"
                            className="w-full px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                onClick={save}
                disabled={saving || rowsForSave.length === 0 || !canSave}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm"
              >
                {saving ? 'Speichere…' : `Speichern (${rowsForSave.length})`}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/* ===========================
   Agent-Mapping Panel
=========================== */
function AgentMappingPanel({
  agents, users, agentMap, setAgentMap
}:{
  agents: { key:string; label:string; count:number }[];
  users: User[];
  agentMap: Record<string, string>;
  setAgentMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
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
                    <UserSelectWithSearch
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

/* ===========================
   UI Components
=========================== */
function UserSelectWithSearch({ users, value, onChange, placeholder }:{
  users: User[]; value: string; onChange:(v:string)=>void; placeholder?:string;
}){
  const [q, setQ] = useState('');
  const filtered = useMemo(()=>{
    const term = q.toLowerCase();
    return users.filter(u => (u.name || u.email || u.id).toLowerCase().includes(term));
  }, [q, users]);

  const current = value ? users.find(u=>u.id===value) : undefined;
  const list = useMemo(()=>{
    if (!current) return filtered;
    return [current, ...filtered.filter(u=>u.id!==current.id)];
  }, [current, filtered]);

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
        <option value="">{placeholder || '– auswählen –'}</option>
        {list.map(u=> (
          <option key={u.id} value={u.id}>
            {u.name || u.email || u.id}
          </option>
        ))}
      </select>
    </div>
  );
}

function YnToggle({ value, onChange }:{ value:'ja'|'nein'|null, onChange:(v:'ja'|'nein'|null)=>void }) {
  return (
    <div className="inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <button type="button" onClick={()=>onChange(value==='ja'? null : 'ja')}
        className={`px-2 py-1 text-xs ${value==='ja' ? 'bg-emerald-600 text-white' : ''}`}>ja</button>
      <button type="button" onClick={()=>onChange(value==='nein'? null : 'nein')}
        className={`px-2 py-1 text-xs ${value==='nein' ? 'bg-red-600 text-white' : ''}`}>nein</button>
    </div>
  );
}

/* ===========================
   Helpers
=========================== */
function numOrNull(v:any): number|null {
  const n = Number(String(v??'').replace(',','.').trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function strOrNull(v:any): string|null {
  const s = String(v??'').trim();
  return s ? s : null;
}
function ynOrNull(v:any): 'ja'|'nein'|null {
  const s = String(v??'').trim().toLowerCase();
  if (!s) return null;
  if (['ja','yes','y','true','1','x','✓','✔'].includes(s)) return 'ja';
  if (['nein','no','n','false','0'].includes(s)) return 'nein';
  return null;
}
function normTs(s:string|null|undefined){
  if (!s) return '';
  return s.replace(/\s+/g,' ').trim();
}
function fixMojibake(s:string|null){
  if (!s) return s;
  return s
    .replace(/Ã¤/g,'ä').replace(/Ã„/g,'Ä')
    .replace(/Ã¶/g,'ö').replace(/Ã–/g,'Ö')
    .replace(/Ã¼/g,'ü').replace(/Ãœ/g,'Ü')
    .replace(/ÃŸ/g,'ß')
    .replace(/â€"/g,'–').replace(/â€"/g,'—')
    .replace(/â€ž/g,'„').replace(/â€œ/g,'"')
    .replace(/Â·/g,'·').replace(/Â /g,' ')
    .replace(/â€¦/g,'…')
    .trim();
}
