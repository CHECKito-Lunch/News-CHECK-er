// lib/groups.ts
import 'server-only';
import { sql } from '@/lib/db';

/** Gruppe existiert & (is_active true oder null) */
export async function isActiveGroup(groupId: number): Promise<boolean> {
  const rows = await sql/*sql*/`
    select 1
    from groups g
    where g.id = ${groupId}
      and coalesce(g.is_active, true) = true
    limit 1
  `;
  return rows.length > 0;
}

/** User ist Mitglied der Gruppe */
export async function isMember(userId: string, groupId: number): Promise<boolean> {
  const rows = await sql/*sql*/`
    select 1
    from group_members gm
    where gm.group_id = ${groupId}
      and gm.user_id  = ${userId}
    limit 1
  `;
  return rows.length > 0;
}

/** Hilfs-Query-Wrapper für Lesbarkeit (optional) */
export async function query<T = any>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]> {
  // delegiert an unser sql aus lib/db.ts – KEIN .unsafe!
  const rows = await (sql as any)(strings, ...values);
  return rows as T[];
}
