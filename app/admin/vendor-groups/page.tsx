// app/admin/vendor-groups/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import VendorGroupsClient from './VendorGroupsClient';
export default function Page() { return <VendorGroupsClient />; }
