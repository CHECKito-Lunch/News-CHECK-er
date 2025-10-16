/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';
import { useEffect, useMemo, useState } from 'react';

type Member = { user_id: string; name: string; email?: string };
type Absence = {
  id: string;
  start: string;
  end: string;
  user: { firstName?:string; lastName?:string; email?:string };
  type: { name?: string };
  status?: string;
};

function fmtRange(a?:string, b?:string) {
  if (!a || !b) return '—';
  const da = new Date(a), db = new Date(b);
  const same = da.toDateString() === db.toDateString();
  const toDE = (d:Date)=> d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
  return same ? toDE(da) : `${toDE(da)} – ${toDE(db)}`;
}

export default function TeamAbsenceList({ members }: { members: Member[] }) {
  const [items, setItems] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);

  const memberUserIds = useMemo(() => members.map(m => m.user_id).join(','), [members]);
  const memberParams = useMemo(() => {
    const p = new URLSearchParams();
    members.forEach(m => p.append('member_user_id', m.user_id));
    return p.toString();
  }, [members]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const r = await fetch(`/api/absence/upcoming?${memberParams}`, { cache:'no-store' });
      const j = await r.json().catch(()=>null);
      setItems(Array.isArray(j?.items) ? j.items : []);
      setLoading(false);
    };
    run();
  }, [memberParams]);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center">
        <div className="font-semibold text-sm">Abwesenheiten (nächste 7 Tage)</div>
        <span className="ml-auto text-xs text-gray-500">{loading ? 'lädt…' : items.length}</span>
      </div>
      <ul className="max-h-[260px] overflow-auto divide-y divide-gray-100 dark:divide-gray-800">
        {loading && <li className="p-3 text-sm text-gray-500">Lade…</li>}
        {!loading && items.length === 0 && (
          <li className="p-3 text-sm text-gray-500">Keine Abwesenheiten</li>
        )}
        {items.map(a => (
          <li key={a.id} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">
                {[a.user?.firstName, a.user?.lastName].filter(Boolean).join(' ') || a.user?.email || '—'}
              </div>
              <div className="text-[12px] text-gray-500">{fmtRange(a.start, a.end)}</div>
            </div>
            <div className="shrink-0 text-[11px] px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
              {a.type?.name || 'Abwesenheit'}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
