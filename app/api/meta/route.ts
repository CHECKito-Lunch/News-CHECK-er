// app/api/meta/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { T } from '@/lib/tables';

export async function GET() {
  try {
    const s = await supabaseServer();

    const [vRes, cRes, bRes] = await Promise.allSettled([
      s.from(T.vendors).select('id, name').order('name', { ascending: true }),
      s.from(T.categories).select('id, name, color').order('name', { ascending: true }),
      s.from(T.badges).select('id, name, color, kind').order('name', { ascending: true }),
    ]);

    const vendors =
      vRes.status === 'fulfilled' && !vRes.value.error ? (vRes.value.data ?? []) : [];
    const categories =
      cRes.status === 'fulfilled' && !cRes.value.error ? (cRes.value.data ?? []) : [];
    const badges =
      bRes.status === 'fulfilled' && !bRes.value.error ? (bRes.value.data ?? []) : [];

    const errors: string[] = [];
    if (vRes.status === 'fulfilled' && vRes.value.error) errors.push(vRes.value.error.message);
    if (cRes.status === 'fulfilled' && cRes.value.error) errors.push(cRes.value.error.message);
    if (bRes.status === 'fulfilled' && bRes.value.error) errors.push(bRes.value.error.message);
    if (vRes.status === 'rejected') errors.push(String(vRes.reason));
    if (cRes.status === 'rejected') errors.push(String(cRes.reason));
    if (bRes.status === 'rejected') errors.push(String(bRes.reason));

    return NextResponse.json(
      {
        ok: true,
        vendors,
        categories,
        badges,
        ...(errors.length ? { warning: errors.join(' | ') } : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, vendors: [], categories: [], badges: [], error: e?.message ?? 'server_error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
