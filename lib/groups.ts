// lib/groups.ts
import { sql } from '@/lib/db';

export const query = sql;

/**
 * Prüft, ob eine Gruppe aktiv ist
 */
export async function isActiveGroup(groupId: number): Promise<boolean> {
  const rows = await sql`
    select 1 from public.groups
    where id = ${groupId} and is_active = true
    limit 1
  `;
  return rows.length > 0;
}

/**
 * Prüft, ob ein User Mitglied einer Gruppe ist
 * @param userId - Supabase Auth UUID als String
 * @param groupId - Gruppen-ID (numerisch)
 */
export async function isMember(userId: string, groupId: number): Promise<boolean> {
  const rows = await sql`
    select 1 from public.group_members
    where user_id = ${userId}::uuid and group_id = ${groupId}
    limit 1
  `;
  return rows.length > 0;
}

/**
 * Prüft, ob eine Gruppe privat ist
 */
export async function isPrivateGroup(groupId: number): Promise<boolean> {
  const rows = await sql`
    select is_private from public.groups
    where id = ${groupId}
    limit 1
  `;
  return rows[0]?.is_private ?? false;
}
