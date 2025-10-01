import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import type { Viewport } from 'next';
import 'react-calendar/dist/Calendar.css';
import { Analytics } from "@vercel/analytics/next"

// hier kannst du globale <meta>-Infos setzen:
export const metadata: Metadata = {
  title: 'News-CHECK',
  appleWebApp: {
    title: 'News-CHECK',
    capable: true, // bewirkt: <meta name="apple-mobile-web-app-capable" content="yes" />
    statusBarStyle: 'default', // Optionen: 'default' | 'black' | 'black-translucent'
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#111827' },
  ],
};


export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}