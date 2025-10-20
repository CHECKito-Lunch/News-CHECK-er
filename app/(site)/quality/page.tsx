// app/(site)/quality/page.tsx
'use client';

import { useSearchParams } from 'next/navigation';
import QAWidget from '../teamhub/QAWidget'; 

export default function Page() {
  const sp = useSearchParams();

  const ownerId = sp.get('ownerId') ?? '';         // z.B. ?ownerId=123
  const from = sp.get('from') ?? undefined;        // z.B. ?from=2025-09-01
  const to = sp.get('to') ?? undefined;            // z.B. ?to=2025-09-30

  return (
    <div className="mx-auto w-full max-w-[1920px] px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold">Quality Dashboard</h1>
      <QAWidget ownerId={ownerId} from={from} to={to} />
    </div>
  );
}
