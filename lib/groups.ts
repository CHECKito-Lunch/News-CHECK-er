// lib/groups.ts
import 'server-only';
import { sql } from './db';

/**
 * Membership-Tabelle für *User*-Gruppen (nicht Vendor!).
 * Wenn dein Name abweicht, in .env.local setzen:
 *   MEMBERS_TABLE=group_memberships
 */
const MEMBERS_TABLE =
  (process.env.MEMBERS_TABLE?.trim() || 'group_members') as string;

/* -----------------------------------------------
   q: Query-Helper
   - Template-Tag:   q`select ... where id = ${id}`
   - Text + Params:  q('select ... where id = $1', [id])
------------------------------------------------ */
export async function q<T = any>(
  strings: TemplateStringsArray | string,
  ...values: any[]
): Promise<{ rows: T[] }> {
  // Template-String-Variante
  if (Array.isArray(strings) && 'raw' in strings) {
    const rows = await (sql as any)(strings as TemplateStringsArray, ...values);
    return { rows: rows as T[] };
  }
  // Text + Params-Variante
  const text = strings as string;
  const params = (values?.[0] ?? []) as any[];
  const rows = await (sql as any).unsafe(text, params);
  return { rows: rows as T[] };
}

/* -----------------------------------------------
   pool.query – kleiner Shim für alten Code
------------------------------------------------ */
export const pool = {
  async query<T = any>(text: string, params: any[] = []): Promise<{ rows: T[] }> {
    const rows = await (sql as any).unsafe(text, params);
    return { rows: rows as T[] };
  },
};

/* -----------------------------------------------
   isMember: prüft Mitgliedschaft in *User*-Gruppen
   Erwartete Spalten: group_id (int), user_id (text/uuid)
   Optional: status ('member','admin','owner')
------------------------------------------------ */
export async function isMember(userId: string, groupId: number): Promise<boolean> {
  // Mit status-Spalte (best effort)
  try {
    const rows = await (sql as any)`
      select exists(
        select 1
        from ${sql.unsafe(MEMBERS_TABLE)} gm
        where gm.group_id = ${groupId}
          and gm.user_id  = ${userId}
          and (gm.status is null or gm.status in ('member','admin','owner'))
      ) as ok
    `;
    return !!rows?.[0]?.ok;
  } catch {
    // Fallback: ohne status-Spalte
    const rows = await (sql as any)`
      select exists(
        select 1
        from ${sql.unsafe(MEMBERS_TABLE)} gm
        where gm.group_id = ${groupId}
          and gm.user_id  = ${userId}
      ) as ok
    `;
    return !!rows?.[0]?.ok;
  }
}

/* -----------------------------------------------
   isActiveGroup: existiert & nicht archiviert
   Versucht "groups" und fallback "user_groups"
------------------------------------------------ */
export async function isActiveGroup(groupId: number): Promise<boolean> {
  // Variante 1: Tabelle "groups"
  try {
    const rows = await (sql as any)`
      select exists(
        select 1
        from "groups" g
        where g.id = ${groupId}
          and (g.deleted_at is null)
          and (g.archived_at is null)
          and (coalesce(g.is_active, true) = true)
      ) as ok
    `;
    return !!rows?.[0]?.ok;
  } catch {}
  // Variante 2: Tabelle "user_groups"
  try {
    const rows = await (sql as any)`
      select exists(
        select 1
        from user_groups g
        where g.id = ${groupId}
          and (g.archived_at is null)
      ) as ok
    `;
    return !!rows?.[0]?.ok;
  } catch {}
  // Minimalfallback
  try {
    const rows = await (sql as any)`
      select exists(select 1 from "groups" where id = ${groupId}) as ok
    `;
    return !!rows?.[0]?.ok;
  } catch {
    return false;
  }
}
