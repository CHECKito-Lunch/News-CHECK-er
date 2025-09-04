// app/admin/news-agent/NewsAgentClient.tsx
'use client';

import { useEffect, useState } from 'react';
import AdminTabs from '../_shared/AdminTabs';
import { useAdminAuth } from '../_shared/auth';
import { inputClass, cardClass } from '../_shared/ui';
import type { AgentConfig, AgentLog, Option } from '../_shared/types';

export default function NewsAgentClient() {
  const { loading, sessionOK, isAdmin, authMsg, userEmail, setUserEmail, userPassword, setUserPassword, doLogin } = useAdminAuth();

  const [meta, setMeta] = useState<{ categories: Option[]; badges: Option[]; vendors: Option[] }>({ categories: [], badges: [], vendors: [] });

  const [agent, setAgent] = useState<AgentConfig>({
    enabled: true,
    language: 'de',
    countries: ['DE','AT','CH','EU'],
    terms: ['Streik Flughafen', 'Lufthansa Streik', 'GDL Bahn', 'Reisewarnung', 'Sicherheitskontrolle Ausfall'],
    times: ['08:00','12:00','17:00'],
    maxArticles: 30,
    autoPublish: false,
    defaultVendorId: null,
    defaultCategoryId: null,
    defaultBadgeIds: [],
    model: undefined,
    temperature: 0.2,
  });
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentMsg, setAgentMsg] = useState('');
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => { fetch('/api/meta', { credentials:'same-origin' }).then(r=>r.json()).then(setMeta).catch(()=>setMeta({categories:[],badges:[],vendors:[]})); }, []);
  useEffect(() => { if (sessionOK && isAdmin) loadConfig(); }, [sessionOK, isAdmin]);

  async function loadConfig() {
    setAgentLoading(true); setAgentMsg('');
    try {
      const r = await fetch('/api/admin/news-agent', { credentials:'same-origin' });
      const j = await r.json().catch(()=>({}));
      if (j?.data) setAgent(prev => ({ ...prev, ...j.data }));
    } catch { setAgentMsg('Konnte Konfiguration nicht laden.'); }
    finally { setAgentLoading(false); }
  }

  async function saveConfig() {
    setAgentLoading(true); setAgentMsg('');
    const body: AgentConfig = {
      ...agent,
      terms: agent.terms.map(t=>t.trim()).filter(Boolean),
      times: agent.times.map(t=>t.trim()).filter(Boolean),
    };
    try {
      const r = await fetch('/api/admin/news-agent', { method:'PUT', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(j?.error || 'Fehler beim Speichern');
      setAgentMsg('Gespeichert.');
    } catch(e:any) { setAgentMsg(e?.message || 'Speichern fehlgeschlagen.'); }
    finally { setAgentLoading(false); }
  }

  async function runDry() {
    setAgentLoading(true); setAgentMsg('');
    try {
      const r = await fetch('/api/admin/news-agent/run?dry=1', { method:'POST', credentials:'same-origin' });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(j?.error || 'Fehler beim Testlauf');
      setAgentMsg(`Testlauf ok – gefunden: ${j.found ?? '—'}, Vorschläge: ${j.proposed ?? '—'}`);
      await loadLogs();
    } catch(e:any) { setAgentMsg(e?.message || 'Testlauf fehlgeschlagen.'); }
    finally { setAgentLoading(false); }
  }

  async function loadLogs() {
    setLogsLoading(true);
    try {
      const r = await fetch('/api/admin/news-agent/logs', { credentials:'same-origin' });
      const j = await r.json().catch(()=>({}));
      setLogs(Array.isArray(j?.data) ? j.data : []);
    } finally { setLogsLoading(false); }
  }

  // ---------- RENDER ----------
  return (
    <div className="container max-w-5xl mx-auto py-6 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Admin · News‑Agent</h1>
      <AdminTabs />

      {!loading && !sessionOK && (
        <div className={cardClass + ' space-y-3'}>
          <h2 className="text-lg font-semibold">Login</h2>
          <form onSubmit={doLogin} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="email" required placeholder="E-Mail" value={userEmail} onChange={(e)=>setUserEmail(e.target.value)} className={inputClass} />
            <input type="password" required placeholder="Passwort" value={userPassword} onChange={(e)=>setUserPassword(e.target.value)} className={inputClass} />
            <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">Anmelden</button>
          </form>
          {authMsg && <p className="text-sm text-gray-600 dark:text-gray-300">{authMsg}</p>}
        </div>
      )}

      {sessionOK && !isAdmin && (
        <div className={cardClass + ' space-y-2'}>
          <h2 className="text-lg font-semibold">Kein Zugriff</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">Du bist angemeldet, aber kein Admin/Moderator.</p>
        </div>
      )}

      {sessionOK && isAdmin && (
        <>
          <div className={cardClass + ' space-y-4'}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">News-Agent (Reise & Tourismus)</h2>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={agent.enabled} onChange={(e)=>setAgent(a=>({ ...a, enabled: e.target.checked }))} />
                  Aktiv
                </label>
                <button type="button" onClick={runDry} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white">Jetzt ausführen (Dry‑Run)</button>
                <button type="button" onClick={saveConfig} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white">Speichern</button>
              </div>
            </div>

            {agentMsg && <div className="text-sm text-gray-700 dark:text-gray-300">{agentMsg}</div>}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="form-label">Schlagwörter / Suchabfragen</label>
                  <textarea className={inputClass + ' min-h-[180px]'} value={agent.terms.join('\n')} onChange={(e)=>setAgent(a=>({ ...a, terms: e.target.value.split('\n') }))} placeholder={`z. B.:\nStreik Flughafen\nLufthansa Streik\nDeutsche Bahn Ausfall\nSicherheitskontrolle Frankfurt\nReisewarnung Auswärtiges Amt`} />
                  <p className="text-xs text-gray-500 mt-1">Eine Zeile pro Suchbegriff. Boolsche Operatoren (AND/OR/“-”) sind erlaubt.</p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: Math.max(3, agent.times.length || 0) }).map((_, i) => (
                    <div key={i}>
                      <label className="form-label">Zeit {i+1}</label>
                      <input type="time" className={inputClass} value={agent.times[i] ?? ''} onChange={(e)=>{
                        const v = e.target.value; setAgent(a=>{ const arr=[...a.times]; arr[i]=v; return { ...a, times: arr.filter(Boolean) }; });
                      }} />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="form-label">Sprache</label>
                    <select className={inputClass} value={agent.language} onChange={(e)=>setAgent(a=>({ ...a, language: e.target.value as AgentConfig['language'] }))}>
                      <option value="de">Deutsch</option><option value="en">Englisch</option><option value="fr">Französisch</option><option value="it">Italienisch</option><option value="es">Spanisch</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Max. Artikel pro Lauf</label>
                    <input type="number" min={5} max={100} className={inputClass} value={agent.maxArticles} onChange={(e)=>setAgent(a=>({ ...a, maxArticles: Math.max(1, Number(e.target.value||10)) }))} />
                  </div>
                </div>

                <div>
                  <label className="form-label">Länder (ISO-2, komma-separiert)</label>
                  <input className={inputClass} value={agent.countries.join(',')} onChange={(e)=>setAgent(a=>({ ...a, countries: e.target.value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean) }))} placeholder="DE,AT,CH,EU" />
                  <p className="text-xs text-gray-500 mt-1">„EU“ steht für EU‑weite Quellen (intern behandelt).</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="form-label">Modell (optional)</label>
                    <input className={inputClass} placeholder="z. B. gpt-4o-mini" value={agent.model || ''} onChange={(e)=>setAgent(a=>({ ...a, model: e.target.value.trim() || undefined }))} />
                  </div>
                  <div>
                    <label className="form-label">Temperature (0–1)</label>
                    <input type="number" step="0.1" min="0" max="1" className={inputClass} value={agent.temperature ?? 0.2} onChange={(e)=>setAgent(a=>({ ...a, temperature: Number(e.target.value) }))} />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Auto-Publish</div>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={agent.autoPublish} onChange={(e)=>setAgent(a=>({ ...a, autoPublish: e.target.checked }))} />
                      aktiv
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Wenn deaktiviert, legt der Agent Beiträge als <em>Entwurf</em> an.</p>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <label className="form-label">Standard-Kategorie</label>
                      <select className={inputClass} value={agent.defaultCategoryId ?? ''} onChange={(e)=>setAgent(a=>({ ...a, defaultCategoryId: e.target.value ? Number(e.target.value) : null }))}>
                        <option value="">—</option>
                        {meta.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Standard-Veranstalter</label>
                      <select className={inputClass} value={agent.defaultVendorId ?? ''} onChange={(e)=>setAgent(a=>({ ...a, defaultVendorId: e.target.value ? Number(e.target.value) : null }))}>
                        <option value="">—</option>
                        {meta.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Standard-Badges</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {meta.badges.map(b => {
                        const active = agent.defaultBadgeIds.includes(b.id);
                        return (
                          <button key={b.id} type="button" onClick={()=>setAgent(a=>({
                            ...a, defaultBadgeIds: active ? a.defaultBadgeIds.filter(x=>x!==b.id) : [...a.defaultBadgeIds, b.id]
                          }))} className={`px-3 py-1 rounded-full text-sm font-medium border inline-flex items-center gap-2
                            ${active ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                                     : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800 dark:border-gray-700'}`}>
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color ?? '#94a3b8' }} />
                            {b.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Letzte Läufe</div>
                    <button className="px-3 py-1.5 rounded border text-sm dark:border-gray-700" onClick={loadLogs} type="button">Aktualisieren</button>
                  </div>
                  {logsLoading ? (
                    <div className="text-sm text-gray-500 mt-2">lädt…</div>
                  ) : logs.length === 0 ? (
                    <div className="text-sm text-gray-500 mt-2">Noch keine Einträge.</div>
                  ) : (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-800 mt-2">
                      {logs.map(l => (
                        <li key={l.id} className="py-2 text-sm flex items-center justify-between">
                          <div>
                            <div className="font-medium">{new Date(l.ranAt).toLocaleString()}</div>
                            <div className="text-gray-500">gefunden: {l.found} · eingefügt: {l.inserted} · {l.dryRun ? 'Dry‑Run' : 'Live'}{l.note ? ` · ${l.note}` : ''}</div>
                          </div>
                          <div className="text-gray-500">{Math.round(l.tookMs)} ms</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" onClick={saveConfig} disabled={agentLoading} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                {agentLoading ? 'Speichert…' : 'Speichern'}
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-300">Der Server‑Cron liest diese Konfiguration und triggert den Agenten zu den Zeiten.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
