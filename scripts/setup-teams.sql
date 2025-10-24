-- Setup Teams Feature
-- Dieses Script erstellt die notwendigen Tabellen für das Teams-Feature

-- 1. Teams Tabelle
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Team Memberships Tabelle
CREATE TABLE IF NOT EXISTS team_memberships (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  is_teamleiter BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- 3. Team Page Config Tabelle
CREATE TABLE IF NOT EXISTS team_page_config (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE UNIQUE,
  layout JSONB DEFAULT '{}',
  theme JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Team Widgets Tabelle
CREATE TABLE IF NOT EXISTS team_widgets (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
  widget_type VARCHAR(50) NOT NULL,
  config JSONB DEFAULT '{}',
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. Indexes für Performance
CREATE INDEX IF NOT EXISTS idx_team_memberships_team_id ON team_memberships(team_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_user_id ON team_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_team_widgets_team_id ON team_widgets(team_id);
CREATE INDEX IF NOT EXISTS idx_team_widgets_position ON team_widgets(team_id, position);

-- 6. Test-Team erstellen (nur wenn noch keine Teams existieren)
INSERT INTO teams (name, description)
SELECT 'Mein Team', 'Das ist ein Test-Team'
WHERE NOT EXISTS (SELECT 1 FROM teams LIMIT 1);

COMMENT ON TABLE teams IS 'Teams für Team-Management Feature';
COMMENT ON TABLE team_memberships IS 'Team-Mitgliedschaften mit Teamleiter-Flag';
COMMENT ON TABLE team_widgets IS 'Konfigurierbare Widgets für Team-Seiten';
