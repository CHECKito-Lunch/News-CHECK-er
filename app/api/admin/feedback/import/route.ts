export const runtime='nodejs';
export const dynamic='force-dynamic';

import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { json, requireUser } from '@/lib/auth-server';

type Row = {
  feedback_at:string; channel:string;
  rating_overall?:number|null; rating_friend?:number|null; rating_qual?:number|null; rating_offer?:number|null;
  comment_raw?:string|null; template_name?:string|null; reklamation?:boolean; resolved?:boolean; note?:string|null;
};

export async function POST(req: NextRequest){
  const me = await requireUser(req);
  if(!me || (me.role!=='admin'&&me.role!=='moderator')) return json({ok:false,error:'forbidden'},403);

  const { user_id, rows } = await req.json().catch(()=>({}));
  if(!user_id || !Array.isArray(rows) || rows.length===0) return json({ok:false,error:'bad payload'},400);

  // Chunked insert
  for (const chunk of Array.from({length: Math.ceil(rows.length/500)},(_,i)=>rows.slice(i*500,i*500+500))) {
    await sql`
      insert into public.employee_feedbacks
      (user_id,feedback_at,channel,rating_overall,rating_friend,rating_qual,rating_offer,
       comment_raw,template_name,reklamation,resolved,note)
      select * from jsonb_to_recordset(${JSON.stringify(
        chunk.map((r:Row)=>({
          user_id, feedback_at:r.feedback_at, channel:r.channel,
          rating_overall:r.rating_overall ?? null,
          rating_friend:r.rating_friend ?? null,
          rating_qual:r.rating_qual ?? null,
          rating_offer:r.rating_offer ?? null,
          comment_raw:r.comment_raw ?? null,
          template_name:r.template_name ?? null,
          reklamation: !!r.reklamation,
          resolved: !!r.resolved,
          note: (r.note ?? '').slice(0,4000)
        }))
      )}::jsonb)
      as t(
        user_id uuid, feedback_at date, channel text,
        rating_overall int, rating_friend int, rating_qual int, rating_offer int,
        comment_raw text, template_name text, reklamation boolean, resolved boolean, note text
      )
    `;
  }

  return json({ok:true, inserted: rows.length});
}
