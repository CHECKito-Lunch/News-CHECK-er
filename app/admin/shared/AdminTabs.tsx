// app/admin/shared/AdminTabs.tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Newspaper, ListChecks, Vote, Store, Tags, Award, Users2, Trophy,
  Wrench, CalendarDays, Bot, Activity, UserCircle2, Ticket, ChevronLeft
} from 'lucide-react';

type Role = 'admin' | 'moderator' | 'user'| 'teamleiter';
type Item = {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  roles?: Role[]; // ⬅️ erlaubt: welche Rollen sehen den Punkt (leer/undef ⇒ alle Admin+Mod)
};
type Group = { title: string; items: Item[] };

/** Navigationsdefinition inkl. Rollenrechten */
const NAV_ALL: Group[] = [
  {
    title: 'Inhalte',
    items: [
      { href: '/admin/news',         label: 'Beitrag anlegen',   icon: Newspaper,   roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/posts-list',   label: 'Beiträge',          icon: ListChecks,  roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/polls',        label: 'Abstimmungen',      icon: Vote,        roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/categories',   label: 'Kategorien',        icon: Tags,        roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/badges',       label: 'Badges',            icon: Award,       roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/termine',      label: 'Termine',           icon: CalendarDays,roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/events',       label: 'Events',            icon: Ticket,      roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/checkiade',    label: 'CHECKiade',         icon: Trophy,      roles: ['admin','teamleiter'] },
      { href: '/admin/tools',        label: 'Tools',             icon: Wrench,      roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/kpis',         label: 'KPIs',              icon: Activity,    roles: ['admin','teamleiter'] },
      { href: '/admin/feedback',     label: 'Feedbacks',         icon: Vote,        roles: ['admin','teamleiter'] },
      { href: '/admin/qa',     label: 'Mitarbeiter Feedbacks',         icon: Vote,        roles: ['admin','teamleiter'] },
    ],
  },
  {
    title: 'Veranstalter',
    items: [
      { href: '/admin/vendors',        label: 'Veranstalter',          icon: Store,  roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/vendor-groups',  label: 'Veranstalter-Gruppen',  icon: Users2, roles: ['admin','moderator','teamleiter'] },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/admin/news-agent', label: 'News-Agent',           icon: Bot,          roles: ['admin', 'teamleiter'] },
      { href: '/admin/users',      label: 'Benutzer und Gruppen', icon: UserCircle2,  roles: ['admin','moderator','teamleiter'] },
    ],
  },
];

export default function AdminTabs() {
  const pathname = usePathname();
  const router = useRouter();

  /** Rolle laden (aus /api/me) */
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch('/api/me', { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        const rr = (j?.user?.role as Role | undefined) ?? null;
        if (mounted) setRole(rr);
      } catch {
        if (mounted) setRole(null);
      }
    })();
    return () => { mounted = false; };
  }, []);

  /** Sichtbare Navigation anhand der Rolle filtern */
  const NAV = useMemo<Group[]>(() => {
    // Standard: wenn Rolle noch nicht bekannt ⇒ Admin-only ausblenden
    const effectiveRole: Role = role ?? 'user';

    const canSee = (it: Item) =>
      !it.roles ? (effectiveRole === 'admin' || effectiveRole === 'moderator')
                : it.roles.includes(effectiveRole);

    return NAV_ALL
      .map(g => ({ ...g, items: g.items.filter(canSee) }))
      .filter(g => g.items.length > 0);
  }, [role]);

  const flatItems = useMemo(() => NAV.flatMap(g => g.items), [NAV]);
  // Fallback: falls leer (z. B. user), zeigen wir gar nichts
  const current = flatItems.find(i => pathname === i.href || pathname.startsWith(i.href + '/')) ?? flatItems[0];

  // --- Collapsed state (persist to localStorage)
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const v = localStorage.getItem('adminSidebarCollapsed');
    if (v) setCollapsed(v === '1');
  }, []);
  useEffect(() => {
    localStorage.setItem('adminSidebarCollapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  // Wenn keine Items sichtbar sind (z. B. falsche Rolle), nichts rendern
  if (!NAV.length) return null;

  return (
    <>
      {/* Mobile: Select */}
      <div className="md:hidden mb-4">
        <label htmlFor="admin-nav" className="sr-only">Bereich wählen</label>
        <select
          id="admin-nav"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-700"
          value={current?.href ?? ''}
          onChange={(e) => router.push(e.target.value)}
        >
          {NAV.map(group => (
            <optgroup key={group.title} label={group.title}>
              {group.items.map(item => (
                <option key={item.href} value={item.href}>{item.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Desktop: Sidebar */}
      <div className={`hidden md:block ${collapsed ? 'w-16' : 'w-72'} shrink-0`}>
        <aside
          className="
            h-[calc(100dvh-4rem)]
            sticky top-16
            border-r border-gray-200 dark:border-gray-800
            bg-transparent
            overflow-y-auto
            pt-6
            pr-3
          "
          aria-label="Admin Navigation"
        >
          {/* Collapse Toggle */}
          <button
            onClick={() => setCollapsed(v => !v)}
            className="mb-4 ml-2 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          >
            <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>

          {NAV.map(group => (
            <nav key={group.title} className="mb-6">
              {!collapsed && (
                <h3 className="px-2 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {group.title}
                </h3>
              )}
              <ul className="space-y-1">
                {group.items.map(item => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon ?? Newspaper;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        className={[
                          'group flex items-center gap-2 rounded-lg px-2 py-2 text-sm',
                          active
                            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/60',
                          collapsed ? 'justify-center' : ''
                        ].join(' ')}
                      >
                        <Icon className="h-4 w-4 opacity-80" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}
        </aside>
      </div>
    </>
  );
}
