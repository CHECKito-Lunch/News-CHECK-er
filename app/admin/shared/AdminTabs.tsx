// app/admin/_shared/AdminTabs.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/admin/news',          label: 'Beitrag anlegen' },
  { href: '/admin/posts-list',    label: 'Beiträge' },
  { href: '/admin/vendors',       label: 'Veranstalter' },
  { href: '/admin/categories',    label: 'Kategorien' },
  { href: '/admin/badges',        label: 'Badges' },
  { href: '/admin/vendor-groups', label: 'Veranstalter-Gruppen' },
  { href: '/admin/tools',         label: 'Tools' },
  { href: '/admin/termine',       label: 'Termine' },
  { href: '/admin/news-agent',    label: 'News-Agent' },
  { href: '/admin/kpis',          label: 'KPIs' },
  { href: '/admin/users',         label: 'Benutzer' },
];

export default function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
      {tabs.map(t => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 rounded-t-lg text-sm font-medium
              ${active
                ? 'bg-white text-gray-900 border border-b-0 border-gray-200 dark:bg-gray-900 dark:text-white dark:border-gray-700'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/40'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
