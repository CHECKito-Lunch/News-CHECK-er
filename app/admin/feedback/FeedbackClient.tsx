'use client';

import { useEffect, useMemo, useState } from 'react';

type User = { id: string; user_id?: string|null; name?: string; email?: string };

// Shape aus /api/admin/feedback/parse
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
  // Client-seitig ergänzen:
  note?: string;
};

export default function AdminFeedbackPage(){
  const [users,setUsers]=useState<User[]>([]);
  const [userId,setUserId]=useState('');               // <- UUID
  const [rows,setRows]=useState<ParsedRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);

  // Nutzerliste laden (und auf UUID normalisieren)
  useEffect(()=>{(async()=>{
    try{
      const r=await fetch('/api/admin/users',{cache:'no-store'});
      const j=await r.json().catch(()=>({}));
      const arr = Array.isArray(j?.data)? j.data : [];
      setUsers(arr.map((u:any)=>({
        id: String(u?.user_id ?? u?.id ?? ''),     // <- value wird zur UUID, Fallback: bigint id (nicht ideal)
        user_id: u?.user_id ?? null,
        name: u?.name ?? null,
        email: u?.email ?? null,
      })));
    }catch{}
  })();},[]);

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
        const raw=await r.text(); // robust gegen leere Bodies
        const j = ct.includes('application/json') ? (raw? JSON.parse(raw):{}) : { ok:false, error:'Unerwarteter Inhalt' };

        if(r.ok && j?.ok){
          const parsed = Array.isArray(j.rows)? j.rows as ParsedRow[] : [];
          // kleine Absicherung + leeres note-Feld anhängen
          const safe = parsed.map(x=>({
            ts: x.ts ?? null,
            bewertung: numOrNull(x.bewertung),
            beraterfreundlichkeit: numOrNull(x.beraterfreundlichkeit),
            beraterqualifikation: numOrNull(x.beraterqualifikation),
            angebotsattraktivitaet: numOrNull(x.angebotsattraktivitaet),
            kommentar: strOrNull(x.kommentar),
            template_name: strOrNull(x.template_name),
            rekla: ynOrNull(x.rekla),
            geklaert: ynOrNull(x.geklaert),
            feedbacktyp: strOrNull(x.feedbacktyp),
            note: '',
          }));
          setRows(safe);
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

  async function save(){
    if(!userId || rows.length===0) return;
    setSaving(true);
    try{
      const r=await fetch('/api/admin/feedback/import',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        // schickt die UUID (userId) und die Zeilen 1:1 an die Import-API
        body: JSON.stringify({ user_id:userId, rows })
      });
      const j=await r.json().catch(()=>({}));
      if(r.ok && j?.ok){ 
        setRows([]); 
        alert(`Import ok – ${j.inserted ?? 0} Zeilen`);
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

  const selectedUser = useMemo(()=> users.find(u=>u.id===userId) ?? null, [userId,users]);

  return (
    <div className="container max-w-6xl mx-auto py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Feedback-Import</h1>
        <a href="/api/admin/feedback/template" className="text-sm text-blue-600 hover:underline">CSV-Vorlage herunterladen</a>
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

          <div className="flex items-end">
            <button 
              onClick={pickCSV}
              className="px-3 py-2 rounded-xl border bg-white dark:bg-white/10 hover:bg-gray-50 dark:hover:bg-white/20 dark:border-gray-700 w-full"
            >
              {loading? 'Lese CSV…' : 'CSV auswählen'}
            </button>
          </div>
        </div>

        {rows.length>0 && (
          <>
            <div className="mt-4 text-sm text-gray-600">
              Vorschau: {rows.length} Einträge {selectedUser ? `→ ${selectedUser.name||selectedUser.email}` : ''}
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
                  {rows.map((r,idx)=>(
                    <tr key={idx} className="border-t border-gray-100 dark:border-gray-800 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">{r.ts ?? '–'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.feedbacktyp ?? '–'}</td>
                      {/* Nur importierte Bewertung, kein avg */}
                      <td className="px-3 py-2 font-medium">{r.bewertung ?? '–'}</td>
                      <td className="px-3 py-2">{r.beraterfreundlichkeit ?? '–'}</td>
                      <td className="px-3 py-2">{r.beraterqualifikation ?? '–'}</td>
                      <td className="px-3 py-2">{r.angebotsattraktivitaet ?? '–'}</td>
                      <td className="px-3 py-2 max-w-[28rem]">
                        {r.kommentar ? <span className="whitespace-pre-wrap">{r.kommentar}</span> : '–'}
                      </td>
                      <td className="px-3 py-2">{r.template_name ?? '–'}</td>
                      <td className="px-3 py-2">{r.rekla ?? '–'}</td>
                      <td className="px-3 py-2">{r.geklaert ?? '–'}</td>
                      <td className="px-3 py-2 w-[22rem]">
                        <input
                          value={r.note||''}
                          onChange={(e)=>setRows(prev=>prev.map((x,i)=> i===idx ? {...x, note:e.target.value} : x))}
                          placeholder="optional…"
                          className="w-full px-2 py-1 rounded border dark:border-gray-700 bg-white dark:bg-white/10"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                onClick={save}
                disabled={!userId || rows.length===0 || saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2 text-sm"
              >
                {saving ? 'Speichere…' : 'Speichern & veröffentlichen'}
              </button>
            </div>
          </>
        )}

        {rows.length===0 && !loading && (
          <p className="mt-4 text-sm text-gray-500">
            Wähle zuerst einen Mitarbeiter und lade dann eine CSV hoch.
          </p>
        )}
      </section>
    </div>
  );
}

/* ===== Helpers ===== */
function numOrNull(v:any): number|null {
  const n = Number(String(v??'').replace(',','.').trim());
  return Number.isFinite(n) ? n : null;
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
