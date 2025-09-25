// app/admin/categories/CategoriesClient.tsx
'use client';

import TaxonomyEditor from '../components/TaxonomyEditor';

export default function CategoriesClient() {
  return (
    <div className="container max-w-15xl mx-auto py-6 space-y-5">
      <h1 className="text-2xl font-bold">Kategorien</h1>
      <div className="card p-4 rounded-2xl border dark:border-gray-800">
        <TaxonomyEditor
          title="Kategorien"
          endpoint="/api/admin/categories"
          columns={['name','color']}
          showCategoryFlags
        />
      </div>
    </div>
  );
}
