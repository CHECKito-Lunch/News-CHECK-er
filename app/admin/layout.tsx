// app/admin/layout.tsx
import { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { verifyToken, AUTH_COOKIE, type Role } from '@/lib/auth';
import AdminHeader from '../components/AdminHeader';
import AdminTabs from './shared/AdminTabs';
import ScrollToTopButton from '../components/ScrollToTopButton';

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
    // Hintergrund: transparent lassen, damit RootLayout-Gradient sichtbar ist
    <div className="min-h-screen bg-transparent flex flex-col">
      <AdminHeader initialRole={role} />

      <div className="flex flex-1 gap-6">
        {/* Sidebar */}
        <AdminTabs />

        {/* Main */}
        <main className="flex-1 px-4 sm:px-8 py-6">
          <div className="w-full max-w-full 2xl:max-w-[1920px] mx-auto px-4 py-6">
            {/* Nutzt die neue .card Utility aus globals.css */}
            <div className="card p-6">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Global Sticky "UP" Button */}
      <ScrollToTopButton />
    </div>
  );
}
