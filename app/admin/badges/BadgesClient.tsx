// app/admin/badges/BadgesClient.tsx
'use client';

import AdminTabs from '../_shared/AdminTabs';
import TaxonomyEditor from '../_components/TaxonomyEditor';

export default function BadgesClient() {
  return (
    <div className="container max-w-5xl mx-auto py-6 space-y-5">
      <h1 className="text-2xl font-bold">Badges</h1>
      <AdminTabs />
      <div className="card p-4 rounded-2xl border dark:border-gray-800">
        <TaxonomyEditor title="Badges" endpoint="/api/admin/badges" columns={['name','color','kind']} />
      </div>
    </div>
  );
}
