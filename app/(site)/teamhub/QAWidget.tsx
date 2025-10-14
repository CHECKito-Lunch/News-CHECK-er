'use client';
import { useEffect, useState } from 'react';

export default function QAWidget(){
  const [data, setData] = useState<{ ok:boolean; total:number; topCategory?:[string,number]; topAgent?:[string,number] }|null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{(async()=>{
    try{
      const r = await fetch('/api/teamhub/qa', { cache:'no-store' });
      const j = await r.json(); setData(j);
    } finally { setLoading(false); }
  })();},[]);

  if (loading) return <div className="text-sm text-gray-500">QA lädt…</div>;
  if (!data?.ok) return <div className="text-sm text-red-600">QA konnte nicht geladen werden.</div>;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-900">
      <div className="text-sm font-medium mb-1">QA (30 Tage)</div>
      <div className="text-2xl font-semibold">{data.total}</div>
      <div className="mt-2 text-sm text-gray-600 dark:text-gray-300 space-y-1">
        <div>Top-Kategorie: <b>{data.topCategory?.[0] ?? '—'}</b> ({data.topCategory?.[1] ?? 0})</div>
        <div>Top-Agent: <b>{data.topAgent?.[0] ?? '—'}</b> ({data.topAgent?.[1] ?? 0})</div>
      </div>
    </div>
  );
}