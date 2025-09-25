// app/admin/page.tsx
import Link from 'next/link';
import {
  Newspaper, ListChecks, Vote, Store, Tags, Award,
  Users2, Wrench, CalendarDays, Bot, Activity, UserCircle2, Ticket
} from 'lucide-react';

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

export default function AdminHome() {
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
    </div>
  );
}
