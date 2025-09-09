// app/api/_debug/db/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const hasEnv = !!process.env.DATABASE_URL;
  try {
    const [row] = await sql<{x:number}[]>`select 1 as x`;
    return NextResponse.json({ ok:true, hasEnv, ping: row?.x });
  } catch (e:any) {
    return NextResponse.json({ ok:false, hasEnv, error: e?.message }, { status: 500 });
  }
}
