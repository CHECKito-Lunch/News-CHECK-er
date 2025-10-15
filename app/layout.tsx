import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import type { Viewport } from 'next';
import 'react-calendar/dist/Calendar.css';
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"

// hier kannst du globale <meta>-Infos setzen:
export const metadata: Metadata = {
  title: 'News-CHECK',
  appleWebApp: {
    title: 'News-CHECK',
    capable: true,
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EDF3FF' },
    { media: '(prefers-color-scheme: dark)',  color: '#0E1B38' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      {/* Hintergrund mit sanftem Verlauf für Hellmodus */}
      <body className="min-h-screen text-gray-900 dark:text-gray-100 bg-[linear-gradient(180deg,#EDF3FF_0%,#FFFFFF_85%)] dark:bg-[var(--app-bg)]">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
