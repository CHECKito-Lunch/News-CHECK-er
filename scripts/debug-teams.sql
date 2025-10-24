-- Debug & Fix Teams Feature
-- Führe diese Queries aus, um das Problem zu finden und zu beheben

-- 1. Zeige alle Teams
SELECT id, name, created_at FROM teams ORDER BY id;

-- 2. Zeige alle Team-Mitgliedschaften
SELECT
  tm.team_id,
  t.name as team_name,
  tm.user_id,
  au.email,
  tm.is_teamleiter,
  tm.active
FROM team_memberships tm
JOIN teams t ON t.id = tm.team_id
LEFT JOIN auth.users au ON au.id = tm.user_id
ORDER BY tm.team_id, tm.is_teamleiter DESC;

-- 3. Zeige alle Widgets
SELECT
  w.id,
  w.team_id,
  t.name as team_name,
  w.widget_type,
  w.position,
  w.is_active,
  w.created_at
FROM team_widgets w
JOIN teams t ON t.id = w.team_id
ORDER BY w.team_id, w.position;

-- 4. Finde deine User-ID (ersetze 'deine@email.com' mit deiner echten Email)
SELECT id, email FROM auth.users WHERE email LIKE '%@%' LIMIT 10;

-- ==========================================
-- FIX: Wenn du noch kein Team hast
-- ==========================================

-- SCHRITT 1: Team erstellen (falls noch nicht vorhanden)
INSERT INTO teams (name, created_by)
VALUES ('Mein Team', (SELECT id FROM auth.users LIMIT 1))
ON CONFLICT DO NOTHING
RETURNING id, name;

-- SCHRITT 2: Dich als Teamleiter hinzufügen
-- WICHTIG: Ersetze 'DEINE_USER_ID' mit deiner tatsächlichen User ID aus auth.users!
INSERT INTO team_memberships (team_id, user_id, is_teamleiter, active)
VALUES (
  (SELECT id FROM teams ORDER BY id LIMIT 1),  -- Erstes Team
  'DEINE_USER_ID',  -- <-- HIER DEINE USER ID EINFÜGEN!
  true,  -- Du bist Teamleiter
  true   -- Aktiv
)
ON CONFLICT (team_id, user_id)
DO UPDATE SET is_teamleiter = true, active = true
RETURNING *;

-- SCHRITT 3: Team-Konfiguration erstellen (falls nicht vorhanden)
INSERT INTO team_page_config (team_id, layout, theme)
VALUES (
  (SELECT id FROM teams ORDER BY id LIMIT 1),
  '{"sections": []}'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (team_id) DO NOTHING;

-- ==========================================
-- ALTERNATIVE: Alle User aus einer bestimmten Email-Domain als Team hinzufügen
-- ==========================================

-- Beispiel: Alle User mit @example.com als Team-Mitglieder
-- INSERT INTO team_memberships (team_id, user_id, is_teamleiter, active)
-- SELECT
--   1 as team_id,  -- Team ID
--   id as user_id,
--   email = 'admin@example.com' as is_teamleiter,  -- Nur Admin ist Teamleiter
--   true as active
-- FROM auth.users
-- WHERE email LIKE '%@example.com'
-- ON CONFLICT (team_id, user_id) DO NOTHING;
