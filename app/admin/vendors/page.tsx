// app/admin/vendors/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import VendorsClient from './VendorsClient';
export default function Page() { return <VendorsClient />; }
