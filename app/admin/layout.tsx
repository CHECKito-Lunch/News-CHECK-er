// app/admin/layout.tsx
import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { verifyToken, AUTH_COOKIE, type Role } from '@/lib/auth';
import AdminHeader from '../components/AdminHeader';
import AdminTabs from './shared/AdminTabs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();

  let role = jar.get('user_role')?.value as Role | undefined;
  if (!role) {
    const jwt = jar.get(AUTH_COOKIE)?.value;
    const session = await verifyToken(jwt);
    role = session?.role;
  }

  return (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
  <AdminHeader initialRole={role} />

  <div className="flex flex-1 gap-6">   {/* <— GAP sorgt für Luft rechts neben der Linie */}
    {/* Sidebar: KEINE Border im Layout, Breite kommt aus AdminTabs */}
    <AdminTabs />

    {/* Main */}
    <main className="flex-1 px-4 sm:px-8 py-6">
      <div className="mx-auto max-w-[1400px]">
        <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
          {children}
        </div>
      </div>
    </main>
  </div>
</div>
  );
}
