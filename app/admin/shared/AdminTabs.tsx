// app/admin/shared/AdminTabs.tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Newspaper, ListChecks, Vote, Store, Tags, Award, Users2, Trophy,
  Wrench, CalendarDays, Bot, Activity, UserCircle2, Ticket, ChevronLeft,
  FilePlus, ClipboardCheck, MessageSquare
} from 'lucide-react';

type Role = 'admin' | 'moderator' | 'user' | 'teamleiter';

type Item = {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  roles?: Role[];
};
type Group = { title: string; items: Item[] };

/** Navigationsdefinition inkl. Rollenrechten (Icons angepasst) */
const NAV_ALL: Group[] = [
  {
    title: 'Inhalte',
    items: [
      { href: '/admin/news',         label: 'Beitrag anlegen',   icon: FilePlus,       roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/posts-list',   label: 'Beiträge',          icon: ListChecks,     roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/polls',        label: 'Abstimmungen',      icon: Vote,           roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/categories',   label: 'Kategorien',        icon: Tags,           roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/badges',       label: 'Badges',            icon: Award,          roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/termine',      label: 'Termine',           icon: CalendarDays,   roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/events',       label: 'Events',            icon: Ticket,         roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/checkiade',    label: 'CHECKiade',         icon: Trophy,         roles: ['admin','teamleiter'] },
      { href: '/admin/tools',        label: 'Tools',             icon: Wrench,         roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/kpis',         label: 'KPIs',              icon: Activity,       roles: ['admin','teamleiter'] },
      { href: '/admin/feedback',     label: 'Kunden-Feedbacks',  icon: MessageSquare,  roles: ['admin','teamleiter'] },
      { href: '/admin/qa',           label: 'Mitarbeiter-Feedbacks', icon: ClipboardCheck, roles: ['admin','teamleiter'] },
    ],
  },
  {
    title: 'Veranstalter',
    items: [
      { href: '/admin/vendors',       label: 'Veranstalter',          icon: Store,   roles: ['admin','moderator','teamleiter'] },
      { href: '/admin/vendor-groups', label: 'Veranstalter-Gruppen',  icon: Users2,  roles: ['admin','moderator','teamleiter'] },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/admin/news-agent', label: 'News-Agent',           icon: Bot,           roles: ['admin','teamleiter'] },
      { href: '/admin/users',      label: 'Benutzer & Gruppen',   icon: UserCircle2,   roles: ['admin','moderator','teamleiter'] },
    ],
  },
];

export default function AdminTabs() {
  const pathname = usePathname();
  const router = useRouter();

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

  const NAV = useMemo<Group[]>(() => {
    const effectiveRole: Role = role ?? 'user';
    const canSee = (it: Item) =>
      !it.roles ? (effectiveRole === 'admin' || effectiveRole === 'moderator')
                : it.roles.includes(effectiveRole);

    return NAV_ALL
      .map(g => ({ ...g, items: g.items.filter(canSee) }))
      .filter(g => g.items.length > 0);
  }, [role]);

  const flatItems = useMemo(() => NAV.flatMap(g => g.items), [NAV]);
  const current = flatItems.find(i => pathname === i.href || pathname.startsWith(i.href + '/')) ?? flatItems[0];

  // collapsed state (persist)
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const v = localStorage.getItem('adminSidebarCollapsed');
    if (v) setCollapsed(v === '1');
  }, []);
  useEffect(() => {
    localStorage.setItem('adminSidebarCollapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  if (!NAV.length) return null;

  return (
    <>
      {/* Mobile Dropdown */}
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

      {/* Desktop Sidebar – sticky/floaty, schicke Optik */}
      <div className={`hidden md:block ${collapsed ? 'w-16' : 'w-72'} shrink-0`}>
        <aside
          className={`
            sticky top-16
            h-[calc(100dvh-4rem)]
            overflow-y-auto
            pr-3 pt-6
            border-r border-gray-200 dark:border-gray-800
            bg-white/60 dark:bg-gray-900/50 backdrop-blur
          `}
          aria-label="Admin Navigation"
        >
          {/* Collapse Toggle */}
          <div className="px-2">
            <button
              onClick={() => setCollapsed(v => !v)}
              className="mb-4 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
            >
              <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {NAV.map(group => (
            <nav key={group.title} className="mb-6">
              {!collapsed && (
                <h3 className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
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
                          'group relative flex items-center gap-2 rounded-xl px-2 py-2 text-sm transition',
                          active
                            ? 'bg-blue-50 text-blue-900 dark:bg-blue-500/15 dark:text-blue-100'
                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/60',
                          collapsed ? 'justify-center' : ''
                        ].join(' ')}
                      >
                        {/* Active indicator bar (links) */}
                        <span
                          aria-hidden
                          className={[
                            'absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full',
                            active ? 'bg-blue-600' : 'bg-transparent'
                          ].join(' ')}
                        />
                        <Icon className={`h-4 w-4 ${active ? 'opacity-100' : 'opacity-80'}`} />
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
