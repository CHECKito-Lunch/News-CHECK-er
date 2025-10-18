/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

export const dynamic = 'force-dynamic';

type Item = {
  id: number|string;
  ts?: string | null;
  incident_type?: string | null;
  category?: string | null;
  severity?: string | null;
  description?: string | null;
  booking_number_hash?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

    const body = await req.json().catch(()=>null);
    const items: Item[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return NextResponse.json({ ok:false, error:'no_items' }, { status:400 });

    // Minimaler "KI-Ersatz": Gruppierung nach incident_type,
    // inkl. Example-IDs und ein paar einfache "reasons" aus category/severity.
    const byType = new Map<string, { count:number; example_ids:Array<string|number>; reasons:Set<string> }>();
    for (const it of items) {
      const k = (it.incident_type || 'sonstiges').trim() || 'sonstiges';
      const entry = byType.get(k) || { count:0, example_ids:[], reasons:new Set<string>() };
      entry.count += 1;
      if (entry.example_ids.length < 5) entry.example_ids.push(it.id);
      if (it.category) entry.reasons.add(it.category);
      if (it.severity) entry.reasons.add(String(it.severity));
      byType.set(k, entry);
    }

    const categories = [...byType.entries()]
      .sort((a,b)=> b[1].count - a[1].count)
      .map(([key, val]) => ({
        key,
        label: key, // Frontend mappt auf DE-Label
        count: val.count,
        reasons: [...val.reasons].filter(Boolean).slice(0,8),
        example_ids: val.example_ids,
        confidence: 'medium' as const,
      }));

    return NextResponse.json({ ok:true, categories });
  } catch (e:any) {
    console.error('[teamhub/qa/ai-categories POST]', e);
    return NextResponse.json({ ok:false, error:'internal' }, { status:500 });
  }
}
