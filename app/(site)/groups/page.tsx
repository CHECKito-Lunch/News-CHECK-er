'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/fetchWithSupabase';

type Group = { id: number; name: string; description?: string|null; is_private?: boolean; isMember?: boolean };

export default function GroupsHub() {
  const [items, setItems] = useState<Group[]>([]);
  useEffect(() => {
    (async () => {
      // deine existierenden Endpunkte nutzen:
      const [g, m] = await Promise.all([
        authedFetch('/api/groups').then(r => r.json()).catch(()=>({data:[]})),
        authedFetch('/api/groups/memberships').then(r=>r.json()).catch(()=>([])),
      ]);
      const memberIds: number[] = Array.isArray(m) ? m : Array.isArray(m?.groupIds) ? m.groupIds : [];
      const groups: Group[] = Array.isArray(g?.data) ? g.data : [];
      setItems(groups
        .filter(gr => gr.is_private ? memberIds.includes(gr.id) : true)
        .map(gr => ({ ...gr, isMember: memberIds.includes(gr.id) })));
    })();
  }, []);

  return (
    <div className="container max-w-5xl mx-auto py-8 space-y-4">
      <h1 className="text-2xl font-semibold">Gruppen</h1>
      <ul className="grid gap-3">
        {items.map(g => (
          <li key={g.id} className="p-4 rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{g.name}</div>
                {g.description && <div className="text-sm text-gray-600 dark:text-gray-300">{g.description}</div>}
              </div>
              <Link href={`/groups/${g.id}`} className="px-3 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white">
                {g.isMember ? 'Öffnen' : 'Beitreten zum Lesen'}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
