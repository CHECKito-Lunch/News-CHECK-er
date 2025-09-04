// app/admin/users/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import UsersClient from './UsersClient';
export default function Page() { return <UsersClient />; }
