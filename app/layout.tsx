import './globals.css';
import type { Metadata } from 'next';
import SiteHeader from './components/SiteHeader';

export const metadata: Metadata = {
  title: 'NewsCHECKer',
  description: 'News & Admin',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      {/* pt-16 = Platz für den sticky Header */}
      <body className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 pt-16">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}