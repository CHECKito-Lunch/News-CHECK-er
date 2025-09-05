// app/admin/vendors/VendorsClient.tsx
'use client';

import AdminTabs from '../_shared/AdminTabs';
import TaxonomyEditor from '../_components/TaxonomyEditor';

export default function VendorsClient() {
  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-5">
      <h1 className="text-2xl font-bold">Veranstalter</h1>
      <AdminTabs />
      <div className="card p-4 rounded-2xl border dark:border-gray-800">
        <TaxonomyEditor title="Veranstalter" endpoint="/api/admin/vendors" columns={['name']} allowGroups />
      </div>
    </div>
  );
}
