// app/admin/kpis/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import KpisClient from './KpisClient';
export default function Page() { return <KpisClient />; }