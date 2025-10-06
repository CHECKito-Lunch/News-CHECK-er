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
   Helpers (lokal)
=========================== */
const normName = (s?: string|null) =>
  (s ?? '').toLowerCase().replace(/\s+/g,' ').trim();

const buildAgentKey = (r: ParsedRow) => {
  const fallback = [r.agent_first, r.agent_last].filter(Boolean).join(' ').trim();
  return normName(r.agent_name || fallback) || '';
};

/* ===========================
   Page
=========================== */
export default function AdminFeedbackPage(){
  const [users,setUsers]=useState<User[]>([]);
  const [assignMode,setAssignMode]=useState<'auto'|'fixed'>('auto');

  // Import: fixed target OR auto-fallback
  const [fixedUserId,setFixedUserId]=useState('');
  const [fallbackUserId,setFallbackUserId]=useState('');

  // Ansicht bestehender Feedbacks (unabhängig)
  const [viewUserId,setViewUserId]=useState('');

  const [tab,setTab]=useState<'upload'|'existing'>('upload');

  // Upload-Vorschau
  const [rows,setRows]=useState<ParsedRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [dropDupes,setDropDupes]=useState(true);

  // Bestehende
  const [existing,setExisting]=useState<ExistingRow[]>([]);
  const [loadingExisting,setLoadingExisting]=useState(false);

  // Modal
  const [openId,setOpenId]=useState<number|null>(null);
  const openItem = useMemo(()=> existing.find(x=>x.id===openId) ?? null, [openId, existing]);
  const [modalDraft,setModalDraft]=useState<Partial<ExistingRow>>({});
  const [savingModal,setSavingModal]=useState(false);

  // Agent-Mapping (pro erkannter Name → userId|'auto')
  const [agentMap, setAgentMap] = useState<Record<string, string|'auto'>>({});

  /* ---------- Nutzerliste ---------- */
  useEffect(()=>{(async()=>{
    try{
      const r=await fetch('/api/admin/users',{cache:'no-store'});
      const j=await r.json().catch(()=>({}));
      const arr = Array.isArray(j?.data)? j.data : [];
      const mapped = arr.map((u:any)=>({
        id: String(u?.user_id ?? u?.id ?? ''),
        user_id: u?.user_id ?? null,
        name: u?.name ?? null,
        email: u?.email ?? null,
      }));
      setUsers(mapped);
    }catch{}
  })();},[]);

  /* ---------- Bestehende laden (Ansicht) ---------- */
  useEffect(()=>{
    if (!viewUserId || tab!=='existing') return;
    (async ()=>{
      setLoadingExisting(true);
      try{
        const r = await fetch(`/api/admin/feedback?user_id=${encodeURIComponent(viewUserId)}`, { cache:'no-store' });
        const j = await r.json().catch(()=>({}));
        const items: ExistingRow[] = Array.isArray(j?.items) ? j.items : [];
        setExisting(items);
      } finally {
        setLoadingExisting(false);
      }
    })();
  },[viewUserId, tab]);

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
            booking_number: strOrNull((x as any).booking_number),
            agent_first: strOrNull((x as any).agent_first),
            agent_last:  strOrNull((x as any).agent_last),
            agent_name:  strOrNull((x as any).agent_name),
          }));
          setRows(safe);
          setTab('upload');
          // Agent-Mapping initialisieren (Auto-Vorschläge)
          const initialMap: Record<string,string|'auto'> = {};
          const unique = new Map<string,{label:string,count:number}>();
          for (const r of safe) {
            const key = buildAgentKey(r);
            if (!key) continue;
            const label = (r.agent_name || [r.agent_first, r.agent_last].filter(Boolean).join(' ').trim() || '').trim();
            const cur = unique.get(key) ?? { label, count:0 };
            cur.count++; cur.label = cur.label || label;
            unique.set(key, cur);
          }
          // Auto-Suggest: exakter Name (case/space-normalized) → user
          const userIndex = new Map(users.map(u => [normName(u.name), u.id]));
          unique.forEach((_v, key)=>{
            const uId = userIndex.get(key);
            initialMap[key] = uId || 'auto';
          });
          setAgentMap(initialMap);
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

  /* ---------- Duplikate in Vorschau ---------- */
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
    return { dupIdx, duplicates: map };
  },[rows]);

  const rowsForSave = useMemo(()=>{
    const base = dropDupes ? rows.filter((_,i)=> !dupInfo.dupIdx.has(i)) : rows;
    // Mapping anwenden: Wenn für Agent-Key explizit User gewählt → agent_name auf exakten User-Namen setzen
    const byId = new Map(users.map(u => [u.id, u]));
    return base.map(r=>{
      const key = buildAgentKey(r);
      const mapChoice = key ? agentMap[key] : undefined;
      if (mapChoice && mapChoice !== 'auto') {
        const u = byId.get(mapChoice);
        if (u?.name) {
          return { ...r, agent_name: u.name, agent_first: null, agent_last: null };
        }
      }
      return r;
    });
  },[rows, dropDupes, dupInfo, agentMap, users]);

  /* ---------- Speichern ----------
     fixed  → braucht fixedUserId
     auto   → braucht fallbackUserId
  --------------------------------- */
  async function save(){
    const effectiveUserId = assignMode==='fixed' ? fixedUserId : fallbackUserId;
    if (!effectiveUserId) {
      alert(assignMode==='fixed'
        ? 'Bitte Mitarbeiter für feste Zuordnung wählen.'
        : 'Bitte Fallback-Mitarbeiter für nicht zuordenbare Einträge wählen.');
      return;
    }
    if(rowsForSave.length===0) return;

    setSaving(true);
    try{
      const r=await fetch('/api/admin/feedback/import',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          user_id: effectiveUserId,
          rows: rowsForSave
        })
      });
      const j=await r.json().catch(()=>({}));
      if(r.ok && j?.ok){
        setRows([]);
        setAgentMap({});
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

  /* ---------- Modal öffnen/schließen ---------- */
  function openModal(id:number){
    const row = existing.find(x=>x.id===id);
    if (!row) return;
    setModalDraft({ ...row });
    setOpenId(id);
  }
  function closeModal(){
    setOpenId(null);
    setModalDraft({});
  }

  /* ---------- Modal speichern/löschen ---------- */
  async function saveModal(){
    if (!openId) return;
    setSavingModal(true);
    try{
      const r = await fetch(`/api/admin/feedback/${openId}`,{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(modalDraft)
      });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'save_failed');
      setExisting(prev=> prev.map(it => it.id===openId ? { ...it, ...modalDraft } as ExistingRow : it));
      closeModal();
    } catch(e:any){
      console.error(e);
      alert('Speichern fehlgeschlagen.');
    } finally {
      setSavingModal(false);
    }
  }
  async function deleteModal(){
    if (!openId) return;
    if (!confirm('Eintrag wirklich löschen?')) return;
    try{
      const r = await fetch(`/api/admin/feedback/${openId}`, { method:'DELETE' });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || !j?.ok) throw new Error('delete_failed');
      setExisting(prev=> prev.filter(x=>x.id!==openId));
      closeModal();
    } catch(e){
      console.error(e);
      alert('Löschen fehlgeschlagen.');
    }
  }

  /* ---------- Agent-Übersicht (CSV) ---------- */
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

      {/* Kopf: Import-Einstellungen + CSV + Ansichtsauswahl */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900 space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Import-Einstellungen */}
          <fieldset className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            <legend className="px-1 text-sm text-gray-600">Zuordnung beim Import</legend>

            <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-3">
              <button
                onClick={()=>setAssignMode('auto')}
                className={`px-4 py-2 text-sm ${assignMode==='auto'?'bg-blue-600 text-white':'bg-transparent'}`}
              >Automatisch (per Bearbeiter-Name)</button>
              <button
                onClick={()=>setAssignMode('fixed')}
                className={`px-4 py-2 text-sm ${assignMode==='fixed'?'bg-blue-600 text-white':'bg-transparent'}`}
              >Fest (alle Zeilen)</button>
            </div>

            {assignMode==='auto' ? (
              <div className="grid gap-2">
                <div className="text-sm">Fallback-Mitarbeiter (nur wenn kein Name gematcht wird)</div>
                <UserSelect users={users} value={fallbackUserId} onChange={setFallbackUserId} placeholder="– Fallback wählen –" />
              </div>
            ) : (
              <div className="grid gap-2">
                <div className="text-sm">Fest zuordnen zu Mitarbeiter</div>
                <UserSelect users={users} value={fixedUserId} onChange={setFixedUserId} placeholder="– Mitarbeiter wählen –" />
              </div>
            )}

            <div className="mt-4">
              <button
                onClick={pickCSV}
                className="px-3 py-2 rounded-xl border bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 dark:border-gray-700"
              >
                {loading? 'Lese CSV…' : 'CSV auswählen'}
              </button>
            </div>
          </fieldset>

          {/* Ansicht bestehender Feedbacks */}
          <fieldset className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            <legend className="px-1 text-sm text-gray-600">Bestehende Feedbacks ansehen</legend>
            <div className="grid gap-2">
              <UserSelect users={users} value={viewUserId} onChange={setViewUserId} placeholder="– Mitarbeiter wählen –" />
              <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden self-start">
                <button
                  onClick={()=>setTab('upload')}
                  className={`px-4 py-2 text-sm ${tab==='upload'?'bg-blue-600 text-white':'bg-transparent'}`}
                >Neu importieren</button>
                <button
                  onClick={()=>setTab('existing')}
                  className={`px-4 py-2 text-sm ${tab==='existing'?'bg-blue-600 text-white':'bg-transparent'}`}
                  disabled={!viewUserId}
                  title={!viewUserId ? 'Bitte oben Mitarbeiter wählen' : ''}
                >Bestehende bearbeiten</button>
              </div>
            </div>
          </fieldset>
        </div>

        {/* Agent-Mapping Panel (nur wenn CSV vorhanden & auto/fallback sinnvoll) */}
        {tab==='upload' && rows.length>0 && (
          <AgentMappingPanel
            agents={agentSummary}
            users={users}
            agentMap={agentMap}
            setAgentMap={setAgentMap}
          />
        )}

        {/* ---------- Upload Vorschau ---------- */}
        {tab==='upload' && (
          <>
            {rows.length>0 ? (
              <>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <div>
                    Vorschau: {rows.length} Einträge
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
                        {['Datum','Channel','Ø','F','Q','A','Kommentar','Template','Rekla','Geklärt?','BO','Interne Notiz'].map(h=>(
                          <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r,idx)=>{
                        const isDup = dupInfo.dupIdx.has(idx);
                        const boDirect = r.booking_number ? `https://backoffice.reisen.check24.de/booking/search/?booking_number=${encodeURIComponent(r.booking_number)}` : undefined;
                        const boRedirect = r.booking_number ? `/api/bo/${encodeURIComponent(r.booking_number)}` : undefined;
                        return (
                          <tr key={idx} className={`border-t border-gray-100 dark:border-gray-800 align-top ${isDup && dropDupes ? 'opacity-50' : ''}`}>
                            <td className="px-3 py-2 whitespace-nowrap">{r.ts ?? '–'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{r.feedbacktyp ?? '–'}</td>
                            <td className="px-3 py-2 font-medium">{r.bewertung ?? '–'}</td>
                            <td className="px-3 py-2">{r.beraterfreundlichkeit ?? '–'}</td>
                            <td className="px-3 py-2">{r.beraterqualifikation ?? '–'}</td>
                            <td className="px-3 py-2">{r.angebotsattraktivitaet ?? '–'}</td>
                            <td className="px-3 py-2 max-w-[26rem]">
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
                            <td className="px-3 py-2 whitespace-nowrap">
                              {boDirect ? (
                                <div className="flex items-center gap-2">
                                  <a className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs" href={boDirect} target="_blank" rel="noreferrer">extern</a>
                                  <a className="inline-flex items-center px-2 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-200 text-xs" href={boRedirect} target="_blank" rel="noreferrer">/api/bo</a>
                                </div>
                              ) : <span className="text-gray-400">–</span>}
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
                    disabled={(assignMode==='fixed' ? !fixedUserId : !fallbackUserId) || rowsForSave.length===0 || saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm"
                  >
                    {saving ? 'Speichere…' : `Speichern (${rowsForSave.length})`}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Wähle oben den Import-Modus, optional Mitarbeiter/Fallback, und lade dann eine CSV hoch.
              </p>
            )}
          </>
        )}

        {/* ---------- Bestehende: kompakte Liste + Modal ---------- */}
        {tab==='existing' && (
          <>
            {!viewUserId && (
              <div className="text-sm text-amber-700">Bitte oben „Mitarbeiter wählen“.</div>
            )}
            {loadingExisting && <div className="text-sm text-gray-500">Lade…</div>}
            {!loadingExisting && viewUserId && existing.length===0 && (
              <div className="text-sm text-gray-500">Keine Feedbacks gefunden.</div>
            )}

            {!loadingExisting && existing.length>0 && (
              <ul className="divide-y divide-gray-200 dark:divide-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {existing.map((r)=>(
                  <li key={r.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer" onClick={()=>openModal(r.id)}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {r.feedback_at} · <span className="text-gray-600">{r.channel || '—'}</span>
                        </div>
                        <div className="text-xs text-gray-500 line-clamp-1">
                          {r.comment_raw || '—'}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-base font-semibold">{avgOf([
                          r.rating_friend, r.rating_qual, r.rating_offer
                        ]) ?? r.rating_overall ?? '–'}</div>
                        <div className="text-[11px] text-gray-500">Score</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Modal */}
            <Modal open={!!openId} title="Feedback bearbeiten" onClose={closeModal}
              footer={
                <div className="flex items-center justify-between w-full">
                  {openItem?.booking_number_hash ? (
                    <a href={`/api/bo/${openItem.booking_number_hash}`} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">
                      Im Backoffice suchen
                    </a>
                  ) : <span />}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={deleteModal}
                      className="px-3 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white"
                    >Löschen</button>
                    <button
                      onClick={saveModal}
                      disabled={savingModal}
                      className="px-3 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white"
                    >{savingModal ? 'Speichere…' : 'Speichern'}</button>
                  </div>
                </div>
              }
            >
              {openItem && (
                <div className="grid gap-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="Datum">
                      <input
                        value={modalDraft.ts ?? openItem.ts ?? openItem.feedback_at}
                        onChange={(e)=>setModalDraft(d=>({...d, ts: e.target.value}))}
                        className="w-full px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10"
                      />
                    </Field>
                    <Field label="Channel">
                      <input
                        value={modalDraft.channel ?? openItem.channel ?? ''}
                        onChange={(e)=>setModalDraft(d=>({...d, channel: e.target.value || null}))}
                        className="w-full px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <Field label="Ø">
                      <NumInput value={modalDraft.rating_overall ?? openItem.rating_overall} onChange={(v)=>setModalDraft(d=>({...d, rating_overall:v }))}/>
                    </Field>
                    <Field label="F">
                      <NumInput value={modalDraft.rating_friend ?? openItem.rating_friend} onChange={(v)=>setModalDraft(d=>({...d, rating_friend:v }))}/>
                    </Field>
                    <Field label="Q">
                      <NumInput value={modalDraft.rating_qual ?? openItem.rating_qual} onChange={(v)=>setModalDraft(d=>({...d, rating_qual:v }))}/>
                    </Field>
                    <Field label="A">
                      <NumInput value={modalDraft.rating_offer ?? openItem.rating_offer} onChange={(v)=>setModalDraft(d=>({...d, rating_offer:v }))}/>
                    </Field>
                  </div>

                  <Field label="Template">
                    <input
                      value={modalDraft.template_name ?? openItem.template_name ?? ''}
                      onChange={(e)=>setModalDraft(d=>({...d, template_name: e.target.value || null}))}
                      className="w-full px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10"
                    />
                  </Field>

                  <Field label="Kommentar">
                    <textarea
                      rows={4}
                      value={modalDraft.comment_raw ?? openItem.comment_raw ?? ''}
                      onChange={(e)=>setModalDraft(d=>({...d, comment_raw: e.target.value || null}))}
                      className="w-full px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Rekla">
                      <BoolToggle
                        value={!!(modalDraft.reklamation ?? openItem.reklamation)}
                        onChange={(v)=>setModalDraft(d=>({...d, reklamation:v }))}
                      />
                    </Field>
                    <Field label="Geklärt?">
                      <BoolToggle
                        value={!!(modalDraft.resolved ?? openItem.resolved)}
                        onChange={(v)=>setModalDraft(d=>({...d, resolved:v }))}
                      />
                    </Field>
                  </div>

                  <Field label="Interne Notiz">
                    <input
                      value={modalDraft.note ?? openItem.note ?? ''}
                      onChange={(e)=>setModalDraft(d=>({...d, note: e.target.value || null}))}
                      className="w-full px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10"
                    />
                  </Field>

                  {openItem.booking_number_hash ? (
                    <div className="text-xs text-gray-600">
                      BO: <a className="underline text-blue-600" target="_blank" rel="noreferrer" href={`/api/bo/${openItem.booking_number_hash}`}>/api/bo/{openItem.booking_number_hash}</a>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">Kein BO-Link vorhanden.</div>
                  )}
                </div>
              )}
            </Modal>
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
  agentMap: Record<string, string|'auto'>;
  setAgentMap: React.Dispatch<React.SetStateAction<Record<string, string|'auto'>>>;
}){
  if (agents.length === 0) return null;
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/60 dark:bg-gray-800/30">
      <div className="text-sm font-medium mb-2">Erkannte Bearbeiter in der CSV</div>
      <div className="overflow-auto">
        <table className="min-w-[680px] w-full text-sm">
          <thead className="bg-white/70 dark:bg-gray-900/40">
            <tr>
              <th className="text-left px-3 py-2">Name (CSV)</th>
              <th className="text-left px-3 py-2">Häufigkeit</th>
              <th className="text-left px-3 py-2 w-[420px]">Zuordnung</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(a=>{
              const val = agentMap[a.key] ?? 'auto';
              return (
                <tr key={a.key} className="border-t border-gray-200 dark:border-gray-800">
                  <td className="px-3 py-2">{a.label || '(leer)'}</td>
                  <td className="px-3 py-2">{a.count}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={val}
                        onChange={e=>{
                          const v = e.target.value as string;
                          setAgentMap(prev=>({ ...prev, [a.key]: v==='auto' ? 'auto' : v }));
                        }}
                        className="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 w-full"
                      >
                        <option value="auto">Automatisch (Name matcht zu app_users.name)</option>
                        {users.map(u=>(
                          <option key={u.id} value={u.id}>
                            {u.name || u.email || u.id}
                          </option>
                        ))}
                      </select>
                      {val!=='auto' && <span className="text-xs text-gray-500">wird erzwungen</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-600">
        Hinweis: Manuelle Zuordnung setzt in den betroffenen Zeilen den <code>agent_name</code> auf den exakten Mitarbeiternamen – so greift das Matching sicher. Nicht zuordenbare Einträge fallen im Auto-Modus auf den Fallback.
      </p>
    </section>
  );
}

/* ===========================
   Kleine UI-Bausteine
=========================== */
function UserSelect({ users, value, onChange, placeholder }:{
  users: User[]; value: string; onChange:(v:string)=>void; placeholder?:string;
}){
  return (
    <select
      value={value}
      onChange={e=>onChange(e.target.value)}
      className="px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-white/10 w-full"
    >
      <option value="">{placeholder || '– auswählen –'}</option>
      {users.map(u=>(
        <option key={u.id} value={u.id}>
          {u.name || u.email || u.id}
        </option>
      ))}
    </select>
  );
}

function Field({ label, children }:{ label:string; children:React.ReactNode }){
  return (
    <label className="grid gap-1">
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}

function Modal({
  open, title, children, onClose, footer,
}:{
  open:boolean; title?:string; children:React.ReactNode; onClose:()=>void; footer?:React.ReactNode;
}){
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 top-20 mx-auto max-w-3xl rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-lg">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="text-lg font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-white/10"
          >
            Schließen
          </button>
        </div>
        <div className="p-5">{children}</div>
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
          {footer}
        </div>
      </div>
    </div>
  );
}

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
      className="w-16 px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10 text-center"
      placeholder="–"
    />
  );
}

/* ===========================
   Deine bestehenden Helpers nutzt der Code weiter
   (avgOf, numOrNull, strOrNull, ynOrNull, normTs, fixMojibake)
=========================== */
function avgOf(arr:(number|null)[]){
  const xs = arr.filter((n): n is number => Number.isFinite(n as number));
  if (!xs.length) return null;
  return (xs.reduce((s,n)=>s+n,0)/xs.length).toFixed(2);
}
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
