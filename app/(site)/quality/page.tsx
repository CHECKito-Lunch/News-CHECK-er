// app/(site)/quality/page.tsx
'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import QAWidget from '../teamhub/QAWidget'; 

function PageInner() {
  const sp = useSearchParams();
  const ownerId = sp.get('ownerId') ?? '';
  const from = sp.get('from') ?? undefined;
  const to = sp.get('to') ?? undefined;

  return (
    <div className="mx-auto w-full max-w-[1920px] px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold">Quality Dashboard</h1>
      <QAWidget ownerId={ownerId} from={from} to={to} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="px-4 py-6 text-sm text-gray-500">Lade…</div>}>
      <PageInner />
    </Suspense>
  );
}
