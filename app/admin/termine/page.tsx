// app/admin/termine/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import TermineClient from './TermineClient';
export default function Page() { return <TermineClient />; }
