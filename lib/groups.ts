// lib/groups.ts
import 'server-only';
import { sql as _sql } from '@/lib/db';

/**
 * q: Tagged-Template Query (thin wrapper um dein db.sql)
 * Erlaubt q`select * from ... where id = ${id}`
 */
export const q: any = _sql;

/**
 * pool: kleiner Shim für "pool.query(text, params)"
 * (einige Stellen nutzen noch dieses Interface)
 */
export const pool = {
  async query(text: string, params?: any[]) {
    const rows = await (_sql as any).unsafe(text, params);
    return { rows };
  },
};

/**
 * Prüft, ob eine Gruppe existiert/aktiv ist.
 * Passe die WHERE-Bedingung ggf. an dein Schema an (is_active/archived_at/etc).
 */
export async function isActiveGroup(groupId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1
       FROM groups
      WHERE id = $1
        AND (is_active = TRUE OR archived_at IS NULL OR archived_at IS NULL IS NOT FALSE)
      LIMIT 1`,
    [groupId]
  );
  return !!rows[0];
}

/**
 * Prüft, ob userId in groupId Mitglied ist.
 * Erwartet Tabelle "group_members(user_id, group_id)" – ggf. Spaltennamen anpassen.
 */
export async function isMember(userId: string, groupId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1
       FROM group_members
      WHERE group_id = $1
        AND (user_id = $2 OR user_id::text = $2)
      LIMIT 1`,
    [groupId, userId]
  );
  return !!rows[0];
}
