'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/fetchWithSupabase';

type Thread = {
  feedback_id: number;
  member_name: string;
  channel: string|null;
  last_comment_at: string|null;
  last_comment_snippet: string|null;
  unread: number;
  labels: Array<{id:number; name:string; color?:string}>;
};

export default function TeamHub() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [onlyUnread, setOnlyUnread] = useState(true);

  async function load(){
    const r = await authedFetch(`/api/teamhub/threads?only_unread=${onlyUnread?'true':'false'}`);
    const j = await r.json();
    setThreads(Array.isArray(j?.items) ? j.items : []);
  }
  useEffect(()=>{ load(); }, [onlyUnread]);

  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Feedback Hub (Teamleiter)</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={onlyUnread} onChange={e=>setOnlyUnread(e.target.checked)} />
            nur Ungelesene
          </label>
          <Link href="/" className="text-sm text-blue-600 hover:underline">Zurück</Link>
        </div>
      </header>

      {threads.length===0 ? (
        <div className="text-sm text-gray-500">Keine Threads.</div>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {threads.map(t=>(
            <li key={t.feedback_id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {t.member_name} · <span className="text-gray-600">{t.channel || '—'}</span>
                  </div>
                  <div className="text-xs text-gray-500 line-clamp-1">
                    {t.last_comment_snippet || '—'}
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    {t.labels.map(l=>(
                      <span key={l.id} className="text-[11px] px-2 py-0.5 rounded-full border"
                            style={{ borderColor: l.color||'#ddd' }}>{l.name}</span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {t.unread>0 && (
                    <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                      {t.unread} neu
                    </span>
                  )}
                  <div className="text-[11px] text-gray-500">
                    {t.last_comment_at ? new Date(t.last_comment_at).toLocaleString('de-DE') : '—'}
                  </div>
                  <Link href={`/feedback/${t.feedback_id}`} className="text-sm text-blue-600 hover:underline">Öffnen</Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
