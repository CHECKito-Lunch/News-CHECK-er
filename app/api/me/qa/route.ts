import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getUserFromRequest } from '@/lib/getUserFromRequest';

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to   = searchParams.get('to');

  const userResult = await getUserFromRequest(req);
  const userId = userResult && 'id' in userResult ? userResult.id : undefined;
  const authError = userResult && 'error' in userResult ? userResult.error : undefined;
  if (authError || !userId) return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });

  const sb = supabaseServer();
  let q = (await sb)  .from('qa_incidents')
  .select('id, ts, incident_type, category, severity, description, booking_number_hash')
  .eq('user_id', userId)
  .order('ts', { ascending:false });
  if (from) q = q.gte('ts', from);
  if (to)   q = q.lte('ts', to);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true, items: data||[] });
}