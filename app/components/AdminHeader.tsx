/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import type { Role } from '@/lib/auth';
import {
  Home, Newspaper, Users2, CalendarDays, Trophy, MessageSquare,
  ClipboardCheck, Briefcase, UserCircle2, Shield, Power
} from 'lucide-react';

type Me = { user: { sub: string; role: Role; name?: string } | null };

export default function AdminHeader({ initialRole }: { initialRole?: Role }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me['user']>(initialRole ? { sub: 'me', role: initialRole } : null);

  // User laden
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await fetch('/api/me', { cache: 'no-store' });
        const j: Me = await r.json();
        if (mounted) setMe(j.user);
      } catch {
        if (mounted) setMe(null);
      }
    };
    load();
    const onAuth = () => load();
    window.addEventListener('auth-changed', onAuth);
    return () => {
      mounted = false;
      window.removeEventListener('auth-changed', onAuth);
    };
  }, []);

  // Navigation Items
  const navItems = useMemo(() => {
    const items: Array<{ href: string; label: string; icon: any }> = [
      { href: '/', label: 'Start', icon: Home },
      { href: '/news', label: 'News', icon: Newspaper },
      { href: '/groups', label: 'Gruppen', icon: Users2 },
      { href: '/events', label: 'Events', icon: CalendarDays },
      { href: '/checkiade', label: 'CHECKiade', icon: Trophy },
      { href: '/feedback', label: 'Feedback', icon: MessageSquare },
      { href: '/quality', label: 'Quality', icon: ClipboardCheck },
    ];

    if (me?.role === 'teamleiter') {
      items.push({ href: '/teamhub', label: 'Teamhub', icon: Briefcase });
    }

    if (me) {
      items.push({ href: '/profile', label: 'Profil', icon: UserCircle2 });
    }

    if (me && ['admin', 'moderator', 'teamleiter'].includes(me.role)) {
      items.push({ href: '/admin', label: 'Admin', icon: Shield });
    }

    return items;
  }, [me]);

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm">
      <div className="w-full max-w-[1920px] mx-auto px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Logo Links */}
          <Link href="/" className="shrink-0">
            <Image
              src="/header.svg"
              alt="NewsCHECKer"
              width={200}
              height={50}
              className="h-10 md:h-12 w-auto dark:opacity-90"
              priority
              sizes="(max-width: 768px) 160px, 200px"
            />
          </Link>

          {/* Tropfen-Navigation Mitte */}
          <nav className="flex items-center justify-center gap-2 overflow-x-auto scrollbar-hide" aria-label="Hauptnavigation">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className="group relative flex flex-col items-center shrink-0"
                >
                  {/* Tropfen */}
                                  <motion.div
                                    initial={false}
                                    animate={{
                                      height: isActive ? 48 : 32,
                                    }}
                                    transition={{
                                      type: 'spring',
                                      stiffness: 500,
                                      damping: 35,
                                    }}
                                    className="relative w-12 rounded-b-full overflow-hidden"
                                    style={{
                                      borderBottomLeftRadius: '10%',
                                      borderBottomRightRadius: '10%',
                                    }}
                                  >
                                    {/* Gradient Background */}
                                    <div
                                      className={`
                                        absolute inset-0
                                        ${
                                          isActive
                                            ? 'bg-gradient-to-b from-blue-300 to-blue-500 shadow-lg shadow-blue-500/40'
                                            : 'bg-gradient-to-b from-gray-300/60 to-gray-400/60 dark:from-gray-700/60 dark:to-gray-600/60 group-hover:from-gray-400/70 group-hover:to-gray-500/70'
                                        }
                                        transition-all duration-200
                                      `}
                                    />

                    {/* Icon */}
                    <div
                      className={`
                        absolute bottom-1 left-1/2 -translate-x-1/2
                        flex items-center justify-center
                        ${
                          isActive
                            ? 'text-white'
                            : 'text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white'
                        }
                        transition-colors
                      `}
                    >
                      <Icon 
                        className="w-4 h-4" 
                        strokeWidth={isActive ? 2.5 : 2} 
                      />
                    </div>
                  </motion.div>

                  {/* Label */}
                  <span
                    className={`
                      mt-1 px-2 py-0.5 text-[10px] font-semibold rounded-full whitespace-nowrap
                      ${
                        isActive
                          ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100'
                          : 'text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100'
                      }
                      transition-colors
                    `}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Logout Button Rechts */}
          <div className="shrink-0">
            {me && (
              <form action="/api/logout" method="post">
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white px-3 py-2 text-sm font-medium shadow-md shadow-red-500/20 transition-all"
                >
                  <Power className="w-4 h-4" />
                  <span className="hidden sm:inline">Abmelden</span>
                </motion.button>
              </form>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
