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
};

type ExistingRow = {
  id: number;
  ts?: string | null;                  // optional (falls später getrennte ts-Spalte kommt)
  feedback_at: string;                 // YYYY-MM-DD
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
};

/* ===========================
   Page
=========================== */
export default function AdminFeedbackPage(){
  const [users,setUsers]=useState<User[]>([]);
  const [userId,setUserId]=useState('');               // UUID (App-User.user_id)
  const [tab,setTab]=useState<'upload'|'existing'>('upload');

  // Upload-Vorschau
  const [rows,setRows]=useState<ParsedRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [dropDupes,setDropDupes]=useState(true);

  // Bestehende
  const [existing,setExisting]=useState<ExistingRow[]>([]);
  const [loadingExisting,setLoadingExisting]=useState(false);
  const [dirty,setDirty]=useState<Record<number, Partial<ExistingRow>>>({});
  const [savingExisting,setSavingExisting]=useState(false);

  /* ---------- Nutzerliste laden ---------- */
  useEffect(()=>{(async()=>{
    try{
      const r=await fetch('/api/admin/users',{cache:'no-store'});
      const j=await r.json().catch(()=>({}));
      const arr = Array.isArray(j?.data)? j.data : [];
      setUsers(arr.map((u:any)=>({
        id: String(u?.user_id ?? u?.id ?? ''),
        user_id: u?.user_id ?? null,
        name: u?.name ?? null,
        email: u?.email ?? null,
      })));
    }catch{}
  })();},[]);

  /* ---------- Bestehende Feedbacks laden (Frontend zuerst; API danach) ----------
     Erwartete API: GET /api/admin/feedback?user_id={uuid}[&from=YYYY-MM-DD&to=YYYY-MM-DD]
     Response: { ok:true, items: ExistingRow[] }
  ------------------------------------------------------------------------------- */
  useEffect(()=>{
    if (!userId || tab!=='existing') return;
    (async ()=>{
      setLoadingExisting(true);
      try{
        const r = await fetch(`/api/admin/feedback?user_id=${encodeURIComponent(userId)}`, { cache:'no-store' });
        const j = await r.json().catch(()=>({}));
        const items: ExistingRow[] = Array.isArray(j?.items) ? j.items : [];
        setExisting(items);
        setDirty({});
      } finally {
        setLoadingExisting(false);
      }
    })();
  },[userId, tab]);

  /* ---------- CSV wählen & parsen ---------- */
  async function pickCSV(){
    const i=document.createElement('input'); 
    i.type='file'; 
    i.accept='.csv,text/csv';
    i.onchange=async()=>{
      const f=i.files?.[0]; 
      if(!f) return;
      setLoading(true);
      const fd=new FormData(); 
      fd.append('file', f);
      try{
        const r=await fetch('/api/admin/feedback/parse',{method:'POST',body:fd});
        const ct=r.headers.get('content-type')||'';
        const raw=await r.text();
        const j = ct.includes('application/json') ? (raw? JSON.parse(raw):{}) : { ok:false, error:'Unerwarteter Inhalt' };

        if(r.ok && j?.ok){
          const parsed = Array.isArray(j.rows)? j.rows as ParsedRow[] : [];
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
          }));
          setRows(safe);
          setTab('upload');
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

  /* ---------- Duplikate in der Vorschau erkennen ---------- */
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
      ].join('|');
      const arr = map.get(key) ?? [];
      arr.push(i);
      map.set(key, arr);
    });
    const dupIdx = new Set<number>();
    map.forEach(arr=>{ if (arr.length>1) arr.slice(1).forEach(i=>dupIdx.add(i)); });
    return { dupIdx, duplicates: map };
  },[rows]);

  const rowsForSave = useMemo(()=>{
    if (!dropDupes) return rows;
    const { dupIdx } = dupInfo;
    return rows.filter((_,i)=> !dupIdx.has(i));
  },[rows, dropDupes, dupInfo]);

  /* ---------- Upload speichern ---------- */
  async function save(){
    if(!userId || rowsForSave.length===0) return;
    setSaving(true);
    try{
      const r=await fetch('/api/admin/feedback/import',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id:userId, rows: rowsForSave })
      });
      const j=await r.json().catch(()=>({}));
      if(r.ok && j?.ok){ 
        setRows([]); 
        alert(`Import ok – ${j.inserted ?? 0} Zeilen${j.skipped? ` (übersprungen: ${j.skipped})` : ''}`);
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

  /* ---------- Bestehende: Zelle editieren / boolean toggles ---------- */
  const markDirty = (id:number, patch:Partial<ExistingRow>)=>{
    setExisting(prev=>prev.map(r=> r.id===id ? { ...r, ...patch } : r));
    setDirty(prev=> ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  async function saveOne(id:number){
    const patch = dirty[id];
    if (!patch) return;
    // Erwartete API: PATCH /api/admin/feedback/{id}  body: { ...patch }
    setSavingExisting(true);
    try{
      const r = await fetch(`/api/admin/feedback/${id}`,{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(patch)
      });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'save_failed');
      const { [id]:_, ...rest } = dirty;
      setDirty(rest);
    } catch(e:any){
      console.error(e);
      alert('Speichern fehlgeschlagen.');
    } finally {
      setSavingExisting(false);
    }
  }

  async function saveAllDirty(){
    const ids = Object.keys(dirty).map(Number);
    if (!ids.length) return;
    setSavingExisting(true);
    try{
      // Optionaler Bulk-Endpunkt; solange nicht vorhanden: nacheinander
      for (const id of ids) {
        const patch = dirty[id];
        const r = await fetch(`/api/admin/feedback/${id}`,{
          method:'PATCH',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(patch)
        });
        if (!r.ok) throw new Error('save_failed');
      }
      setDirty({});
      alert('Änderungen gespeichert.');
    } catch(e){
      console.error(e);
      alert('Speichern fehlgeschlagen.');
    } finally {
      setSavingExisting(false);
    }
  }

  async function removeOne(id:number){
    if (!confirm('Eintrag wirklich löschen?')) return;
    // Erwartete API: DELETE /api/admin/feedback/{id}
    try{
      const r = await fetch(`/api/admin/feedback/${id}`, { method:'DELETE' });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j?.ok) throw new Error('delete_failed');
      setExisting(prev=>prev.filter(x=>x.id!==id));
      setDirty(prev=>{ const p={...prev}; delete p[id]; return p; });
    } catch(e){
      console.error(e);
      alert('Löschen fehlgeschlagen.');
    }
  }

  const selectedUser = useMemo(()=> users.find(u=>u.id===userId) ?? null, [userId,users]);

  /* ===========================
     UI
  ============================ */
  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Feedback-Import & Bearbeitung</h1>
        <a href="/api/admin/feedback/template" className="text-sm text-blue-600 hover:underline">
          CSV-Vorlage herunterladen
        </a>
      </div>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Mitarbeiter</span>
            <select 
              value={userId} 
              onChange={e=>setUserId(e.target.value)}
              className="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10"
            >
              <option value="">– auswählen –</option>
              {users.map(u=>(
                <option key={u.id} value={u.id}>
                  {u.name || u.email || u.id}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button 
              onClick={pickCSV}
              className="px-3 py-2 rounded-xl border bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 dark:border-gray-700 w-full"
            >
              {loading? 'Lese CSV…' : 'CSV auswählen'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 inline-flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onClick={()=>setTab('upload')}
            className={`px-4 py-2 text-sm ${tab==='upload'?'bg-blue-600 text-white':'bg-transparent'}`}
          >Neu importieren</button>
          <button
            onClick={()=>setTab('existing')}
            className={`px-4 py-2 text-sm ${tab==='existing'?'bg-blue-600 text-white':'bg-transparent'}`}
            disabled={!userId}
            title={!userId ? 'Bitte zuerst Mitarbeiter auswählen' : ''}
          >Bestehende bearbeiten</button>
        </div>

        {/* ---------- Upload Vorschau ---------- */}
        {tab==='upload' && (
          <>
            {rows.length>0 ? (
              <>
                <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                  <div>
                    Vorschau: {rows.length} Einträge {selectedUser ? `→ ${selectedUser.name||selectedUser.email}` : ''}
                    {dupInfo.dupIdx.size>0 && (
                      <span className="ml-3 text-amber-700 dark:text-amber-400">
                        {dupInfo.dupIdx.size} mögliche Duplikate erkannt
                      </span>
                    )}
                  </div>
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={dropDupes} onChange={e=>setDropDupes(e.target.checked)} />
                    Duplikate vor dem Speichern entfernen
                  </label>
                </div>

                <div className="mt-2 max-h-[60vh] overflow-auto rounded-xl border border-gray-200 dark:border-gray-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
                      <tr>
                        {['Datum','Channel','Ø','F','Q','A','Kommentar','Template','Rekla','Geklärt?','Interner Kommentar'].map(h=>(
                          <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r,idx)=>{
                        const isDup = dupInfo.dupIdx.has(idx);
                        return (
                          <tr key={idx} className={`border-t border-gray-100 dark:border-gray-800 align-top ${isDup && dropDupes ? 'opacity-50' : ''}`}>
                            <td className="px-3 py-2 whitespace-nowrap">{r.ts ?? '–'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.feedbacktyp ?? '–'}</td>
                            <td className="px-3 py-2 font-medium">{r.bewertung ?? '–'}</td>
                            <td className="px-3 py-2">{r.beraterfreundlichkeit ?? '–'}</td>
                            <td className="px-3 py-2">{r.beraterqualifikation ?? '–'}</td>
                            <td className="px-3 py-2">{r.angebotsattraktivitaet ?? '–'}</td>
                            <td className="px-3 py-2 max-w-[28rem]">
                              {r.kommentar ? <span className="whitespace-pre-wrap">{r.kommentar}</span> : '–'}
                            </td>
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
                    disabled={!userId || rowsForSave.length===0 || saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm"
                  >
                    {saving ? 'Speichere…' : `Speichern (${rowsForSave.length})`}
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-gray-500">
                Wähle zuerst einen Mitarbeiter und lade dann eine CSV hoch.
              </p>
            )}
          </>
        )}

        {/* ---------- Bestehende bearbeiten ---------- */}
        {tab==='existing' && (
          <>
            {loadingExisting && <div className="mt-4 text-sm text-gray-500">Lade…</div>}
            {!loadingExisting && existing.length===0 && (
              <div className="mt-4 text-sm text-gray-500">Keine Feedbacks gefunden.</div>
            )}

            {!loadingExisting && existing.length>0 && (
              <>
                <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                  <div>Gefunden: {existing.length} Einträge</div>
                  <button
                    onClick={saveAllDirty}
                    disabled={Object.keys(dirty).length===0 || savingExisting}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm"
                  >
                    {savingExisting ? 'Speichere…' : `Alle Änderungen speichern (${Object.keys(dirty).length})`}
                  </button>
                </div>

                <div className="mt-2 max-h-[60vh] overflow-auto rounded-xl border border-gray-200 dark:border-gray-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
                      <tr>
                        {['Datum','Channel','Ø','F','Q','A','Kommentar','Template','Rekla','Geklärt?','Notiz',''].map(h=>(
                          <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {existing.map(r=>(
                        <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                          <td className="px-3 py-2 whitespace-nowrap">{r.ts || r.feedback_at}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <input
                              value={r.channel||''}
                              onChange={(e)=>markDirty(r.id,{ channel: e.target.value || null })}
                              className="px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10"
                            />
                          </td>
                          <td className="px-3 py-2 w-16">
                            <NumInput value={r.rating_overall} onChange={(v)=>markDirty(r.id,{ rating_overall:v })}/>
                          </td>
                          <td className="px-3 py-2 w-16">
                            <NumInput value={r.rating_friend} onChange={(v)=>markDirty(r.id,{ rating_friend:v })}/>
                          </td>
                          <td className="px-3 py-2 w-16">
                            <NumInput value={r.rating_qual} onChange={(v)=>markDirty(r.id,{ rating_qual:v })}/>
                          </td>
                          <td className="px-3 py-2 w-16">
                            <NumInput value={r.rating_offer} onChange={(v)=>markDirty(r.id,{ rating_offer:v })}/>
                          </td>
                          <td className="px-3 py-2 max-w-[28rem]">
                            <textarea
                              value={r.comment_raw||''}
                              onChange={(e)=>markDirty(r.id,{ comment_raw: e.target.value || null })}
                              rows={2}
                              className="w-full px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={r.template_name||''}
                              onChange={(e)=>markDirty(r.id,{ template_name: e.target.value || null })}
                              className="px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <BoolToggle value={!!r.reklamation} onChange={(v)=>markDirty(r.id,{ reklamation:v })}/>
                          </td>
                          <td className="px-3 py-2">
                            <BoolToggle value={!!r.resolved} onChange={(v)=>markDirty(r.id,{ resolved:v })}/>
                          </td>
                          <td className="px-3 py-2 w-[20rem]">
                            <input
                              value={r.note||''}
                              onChange={(e)=>markDirty(r.id,{ note: e.target.value || null })}
                              className="w-full px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10"
                            />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={()=>saveOne(r.id)}
                                disabled={!dirty[r.id] || savingExisting}
                                className="px-3 py-1.5 rounded-lg text-sm border bg-white hover:bg-gray-50 dark:bg-white/10 dark:hover:bg-white/20 dark:border-gray-700"
                              >Speichern</button>
                              <button
                                onClick={()=>removeOne(r.id)}
                                className="px-3 py-1.5 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white"
                              >Löschen</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/* ===========================
   Kleine UI-Bausteine
=========================== */
function YnToggle({ value, onChange }:{ value:'ja'|'nein'|null, onChange:(v:'ja'|'nein'|null)=>void }) {
  return (
    <div className="inline-flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={()=>onChange(value==='ja'? null : 'ja')}
        className={`px-2 py-1 text-xs ${value==='ja' ? 'bg-emerald-600 text-white' : ''}`}
      >ja</button>
      <button
        type="button"
        onClick={()=>onChange(value==='nein'? null : 'nein')}
        className={`px-2 py-1 text-xs ${value==='nein' ? 'bg-red-600 text-white' : ''}`}
      >nein</button>
    </div>
  );
}

function BoolToggle({ value, onChange }:{ value:boolean, onChange:(v:boolean)=>void }) {
  return (
    <button
      type="button"
      onClick={()=>onChange(!value)}
      className={`px-2 py-1 rounded-md text-xs border ${value ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-white/10'}`}
    >
      {value ? 'ja' : 'nein'}
    </button>
  );
}

function NumInput({ value, onChange }:{ value:number|null, onChange:(v:number|null)=>void }){
  return (
    <input
      value={value ?? ''}
      onChange={(e)=>{
        const v = e.target.value.trim();
        if (v==='') return onChange(null);
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        const i = Math.max(1, Math.min(5, Math.trunc(n)));
        onChange(i);
      }}
      inputMode="numeric"
      className="w-14 px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10 text-center"
      placeholder="–"
    />
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
  if (['ja','yes','y','true','1'].includes(s)) return 'ja';
  if (['nein','no','n','false','0'].includes(s)) return 'nein';
  return (s==='ja'||s==='nein') ? (s as any) : null;
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
    .replace(/â€“/g,'–').replace(/â€”/g,'—')
    .replace(/â€ž/g,'„').replace(/â€œ/g,'“')
    .replace(/Â·/g,'·').replace(/Â /g,' ')
    .replace(/â€¦/g,'…')
    .trim();
}
