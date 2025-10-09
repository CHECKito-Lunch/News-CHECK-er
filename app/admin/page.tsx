/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/admin/page.tsx
import Link from 'next/link';
import { headers as nextHeaders, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  Newspaper, ListChecks, Vote, Store, Tags, Award, Trophy,
  Users2, Wrench, CalendarDays, Bot, Activity, UserCircle2, Ticket
} from 'lucide-react';

export const dynamic = 'force-dynamic';

type Role = 'admin' | 'moderator' | 'user' |  'teamleiter' | null;

async function getRole(): Promise<Role> {
  const c = await cookies();                         // Next 15: async
  return (c.get('user_role')?.value as Role) ?? null;
}

/* ---- Kacheln mit Rollen ---- */
const tiles: Array<{
  href: string; label: string; icon: any; roles: Array<'admin' | 'moderator' | 'teamleiter'>;
}> = [
  { href: '/admin/news',          label: 'Beitrag anlegen',      icon: Newspaper,    roles: ['admin','moderator','teamleiter'] },
  { href: '/admin/posts-list',    label: 'Beiträge',             icon: ListChecks,   roles: ['admin','moderator','teamleiter']  },
  { href: '/admin/polls',         label: 'Abstimmungen',         icon: Vote,         roles: ['admin','moderator','teamleiter'] },
  { href: '/admin/vendors',       label: 'Veranstalter',         icon: Store,        roles: ['admin','moderator','teamleiter']  },
  { href: '/admin/categories',    label: 'Kategorien',           icon: Tags,         roles: ['admin','moderator','teamleiter'] },
  { href: '/admin/badges',        label: 'Badges',               icon: Award,        roles: ['admin','moderator','teamleiter']  },
  { href: '/admin/vendor-groups', label: 'Veranstalter-Gruppen', icon: Users2,       roles: ['admin','moderator','teamleiter']  },
  { href: '/admin/termine',       label: 'Termine',              icon: CalendarDays, roles: ['admin','moderator','teamleiter']  },
  { href: '/admin/events',        label: 'Events',               icon: Ticket,       roles: ['admin','moderator','teamleiter'] },
  { href: '/admin/tools',         label: 'Tools',                icon: Wrench,       roles: ['admin','moderator','teamleiter']  },

  // admin-only
  { href: '/admin/news-agent',    label: 'News-Agent',           icon: Bot,          roles: ['admin','teamleiter'] },
  { href: '/admin/kpis',          label: 'KPIs',                 icon: Activity,     roles: ['admin','teamleiter'] },
  { href: '/admin/users',         label: 'Benutzer',             icon: UserCircle2,  roles: ['admin','moderator','teamleiter'] },
  { href: '/admin/checkiade',     label: 'CHECKiade',            icon: Trophy,       roles: ['admin','teamleiter'] },
  { href: '/admin/feedback',      label: 'Feedbacks',            icon: Vote,         roles: ['admin','teamleiter'] },
];

async function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const h = await nextHeaders();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  if (!host) throw new Error('Missing host header');
  return new URL(path.startsWith('/') ? path : `/${path}`, `${proto}://${host}`).toString();
}

type StatsResponse = {
  auth?: any;
  content?: any;
  dauTrend?: Array<{ day: string; value: number }>;
  postsTrend?: Array<{ day: string; value: number }>;
  auth_disabled?: boolean;
  error?: string;
};

async function getStats(): Promise<StatsResponse | null> {
  try {
    const h = await nextHeaders();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? 'http';
    if (!host) return null;

    const url = new URL('/api/admin/stats', `${proto}://${host}`).toString();

    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        cookie: h.get('cookie') ?? '',
        'x-forwarded-host': host,
        'x-forwarded-proto': proto,
      },
    });

    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) return null;

    return await res.json();
  } catch {
    return null;
  }
}

export default async function AdminHome() {
  // Seite selbst absichern (zusätzlich zur Middleware)
  const role = await getRole();
  if (role !== 'admin' && role !== 'moderator' && role !== 'teamleiter') {
    redirect('/login'); // oder redirect('/')
  }

  const data = await getStats();
  const visibleTiles = tiles.filter(t => t.roles.includes(role));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-300">Schnellzugriff</h2>
        <ul className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleTiles.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="group flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 sm:p-4 hover:shadow-sm hover:border-gray-300 dark:hover:border-gray-700 transition"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 dark:border-gray-700">
                  <Icon className="h-4 w-4 opacity-80" />
                </span>
                <span className="font-medium">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {data && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-300">Kennzahlen</h2>
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="text-xs text-gray-500">Beiträge gesamt</div>
              <div className="mt-1 text-xl font-semibold">{data.content?.posts_total ?? 0}</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="text-xs text-gray-500">Heute veröffentlicht</div>
              <div className="mt-1 text-xl font-semibold">{data.content?.posts_published_today ?? 0}</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="text-xs text-gray-500">Offene Abstimmungen</div>
              <div className="mt-1 text-xl font-semibold">{data.content?.polls_open ?? 0}</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="text-xs text-gray-500">Events diese Woche</div>
              <div className="mt-1 text-xl font-semibold">{data.content?.events_this_week ?? 0}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="text-xs text-gray-500">Nächste Termine (7d)</div>
              <div className="mt-1 text-xl font-semibold">{data.content?.termine_next_7d ?? 0}</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="text-xs text-gray-500">Aktive Veranstalter (30d)</div>
              <div className="mt-1 text-xl font-semibold">{data.content?.active_vendors_30d ?? 0}</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="text-xs text-gray-500">Gruppen gesamt</div>
              <div className="mt-1 text-xl font-semibold">{data.content?.groups_total ?? 0}</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <div className="text-xs text-gray-500">Badges vergeben</div>
              <div className="mt-1 text-xl font-semibold">{data.content?.badges_total ?? 0}</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
