// app/admin/categories/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import CategoriesClient from './CategoriesClient';
export default function Page() { return <CategoriesClient />; }
