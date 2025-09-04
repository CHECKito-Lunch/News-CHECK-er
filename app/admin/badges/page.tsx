// app/admin/badges/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import BadgesClient from './BadgesClient';
export default function Page() { return <BadgesClient />; }
