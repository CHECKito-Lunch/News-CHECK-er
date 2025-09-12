import { withAuth } from '@/lib/with-auth';
import { sql } from '@/lib/db';
import { json } from '@/lib/auth-server';

type Row = {
  id: number;
  group_id: number;
  group_name: string;
  message: string | null;
  created_at: string;
  invited_by: string | null;        // UUID (als Text)
  invited_by_name: string | null;
  invited_by_email: string | null;
};

export const GET = withAuth(async (_req, _ctx, me) => {
  // me.sub = Supabase-UUID des eingeloggten Users
  const rows = await sql<Row[]>`
    select
      i.id,
      i.group_id,
      g.name as group_name,
      i.message,
      i.created_at,
      i.invited_by::text as invited_by,
      u.name  as invited_by_name,
      u.email as invited_by_email
    from group_invitations i
      join groups g on g.id = i.group_id
      left join app_users u on u.user_id::text = i.invited_by::text
    where i.invited_user_id::text = ${me.sub}
      and i.revoked_at  is null
      and i.accepted_at is null
      and i.declined_at is null
    order by i.created_at desc
  `;

  return json({ items: rows });
});
