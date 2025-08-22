import type { ReactNode } from 'react';
import '../globals.css';
import SiteHeader from './components/SiteHeader';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}