'use client';

import { useState } from 'react';

export default function RosterUploadPage(){
  const [teamId, setTeamId] = useState('');
  const [file, setFile] = useState<File|null>(null);
  const [out, setOut] = useState<string>('');

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if (!file || !teamId) return;
    const fd = new FormData();
    fd.set('team_id', teamId);
    fd.set('file', file);
    const r = await fetch('/api/teamhub/roster/upload', { method:'POST', body:fd });
    const j = await r.json().catch(()=>null);
    setOut(JSON.stringify(j, null, 2));
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Dienstplan hochladen (CSV)</h1>
      <form onSubmit={submit} className="space-y-3 max-w-md">
        <input
          value={teamId}
          onChange={e=>setTeamId(e.target.value)}
          placeholder="Team-ID"
          className="w-full border rounded px-2 py-1.5"
        />
        <input type="file" accept=".csv,text/csv" onChange={e=>setFile(e.target.files?.[0] ?? null)} />
        <button className="px-3 py-1.5 rounded bg-blue-600 text-white">Hochladen</button>
      </form>
      {out && <pre className="bg-black/5 p-3 rounded text-xs whitespace-pre-wrap">{out}</pre>}
    </div>
  );
}
