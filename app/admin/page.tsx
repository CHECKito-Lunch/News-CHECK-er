// app/admin/page.tsx
import Link from 'next/link';
import { headers as nextHeaders } from 'next/headers';
import {
  Newspaper, ListChecks, Vote, Store, Tags, Award,
  Users2, Wrench, CalendarDays, Bot, Activity, UserCircle2, Ticket
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const tiles = [
  { href: '/admin/news',          label: 'Beitrag anlegen',    icon: Newspaper },
  { href: '/admin/posts-list',    label: 'Beiträge',           icon: ListChecks },
  { href: '/admin/polls',         label: 'Abstimmungen',       icon: Vote },
  { href: '/admin/vendors',       label: 'Veranstalter',       icon: Store },
  { href: '/admin/categories',    label: 'Kategorien',         icon: Tags },
  { href: '/admin/badges',        label: 'Badges',             icon: Award },
  { href: '/admin/vendor-groups', label: 'Veranstalter-Gruppen', icon: Users2 },
  { href: '/admin/termine',       label: 'Termine',            icon: CalendarDays },
  { href: '/admin/events',        label: 'Events',             icon: Ticket },
  { href: '/admin/tools',         label: 'Tools',              icon: Wrench },
  { href: '/admin/news-agent',    label: 'News-Agent',         icon: Bot },
  { href: '/admin/kpis',          label: 'KPIs',               icon: Activity },
  { href: '/admin/users',         label: 'Benutzer',           icon: UserCircle2 },
];

async function absoluteUrl(path: string) {
  const h = await nextHeaders(); // ⬅️ await!
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  if (!host) throw new Error('Missing host header');
  return new URL(path.startsWith('/') ? path : `/${path}`, `${proto}://${host}`).toString();
}

async function getStats() {
  const url = await absoluteUrl('/api/admin/stats'); // ⬅️ await!
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export default async function AdminHome() {
  const data = await getStats();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-300">Schnellzugriff</h2>
        <ul className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tiles.map(({ href, label, icon: Icon }) => (
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
