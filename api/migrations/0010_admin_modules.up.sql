-- Modul panel admin: kategori & tag, moderasi komentar, pustaka media, pengguna, iklan, data pasar, 2FA staf.

-- ---------------------------------------------------------------- kategori & tag
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  ADD COLUMN IF NOT EXISTS in_menu boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS followable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#E5ECFF' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN IF NOT EXISTS seo_title text NOT NULL DEFAULT '' CHECK (length(seo_title) <= 70),
  ADD COLUMN IF NOT EXISTS seo_description text NOT NULL DEFAULT '' CHECK (length(seo_description) <= 160),
  ADD COLUMN IF NOT EXISTS editor_id uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users (id) ON DELETE SET NULL;

-- URL kategori lama yang dialihkan (301) setelah kategori dihapus/digabung.
CREATE TABLE IF NOT EXISTS category_redirects (
  from_slug   text PRIMARY KEY CHECK (from_slug ~ '^[a-z0-9-]+$'),
  to_category uuid NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tags ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------- komentar
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_status_check;
ALTER TABLE comments ADD CONSTRAINT comments_status_check CHECK (status IN ('visible', 'hidden', 'flagged', 'pending'));
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS flag_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS moderated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz;
CREATE INDEX IF NOT EXISTS comments_queue_idx ON comments (status, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_reports (
  comment_id uuid NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason     text NOT NULL DEFAULT '' CHECK (length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS moderation_words (
  word       text PRIMARY KEY CHECK (length(word) BETWEEN 2 AND 60 AND word = lower(word)),
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO moderation_words (word) VALUES ('profit dijamin'), ('sinyal vip'), ('pasti naik'), ('link di bio')
ON CONFLICT DO NOTHING;

-- Pengaturan aplikasi (kunci → JSON), mis. filter moderasi otomatis.
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_settings (key, value) VALUES
  ('moderation', '{"hold_links": true, "detect_pump": true, "hide_after_reports": true, "report_threshold": 3, "hold_new_accounts": true}')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- media
ALTER TABLE media
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '' CHECK (length(title) <= 120),
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'chart', 'illustration', 'video')),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT '' CHECK (length(source) <= 160),
  ADD COLUMN IF NOT EXISTS license text NOT NULL DEFAULT 'none' CHECK (license IN ('none', 'owned', 'licensed', 'editorial', 'cc')),
  ADD COLUMN IF NOT EXISTS license_until date,
  ADD COLUMN IF NOT EXISTS alt text NOT NULL DEFAULT '' CHECK (length(alt) <= 125),
  ADD COLUMN IF NOT EXISTS file_name text NOT NULL DEFAULT '' CHECK (length(file_name) <= 200),
  ADD COLUMN IF NOT EXISTS width int,
  ADD COLUMN IF NOT EXISTS height int;
CREATE INDEX IF NOT EXISTS media_created_idx ON media (created_at DESC);

-- ---------------------------------------------------------------- pengguna
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz,
  ADD COLUMN IF NOT EXISTS block_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS two_factor boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS user_warnings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  issued_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  reason     text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_warnings_user_idx ON user_warnings (user_id, created_at DESC);

-- ---------------------------------------------------------------- iklan
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (length(name) BETWEEN 3 AND 80),
  advertiser     text NOT NULL CHECK (length(advertiser) BETWEEN 2 AND 80),
  industry       text NOT NULL DEFAULT '' CHECK (length(industry) <= 40),
  slot_code      text NOT NULL REFERENCES ad_slots (code) ON UPDATE CASCADE,
  start_date     date NOT NULL,
  end_date       date NOT NULL CHECK (end_date >= start_date),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'paused', 'rejected', 'finished')),
  regulated      boolean NOT NULL DEFAULT false,    -- kripto/investasi: wajib izin regulator
  docs_company   boolean NOT NULL DEFAULT false,
  docs_license   boolean NOT NULL DEFAULT false,
  docs_creative  boolean NOT NULL DEFAULT false,
  docs_claims    boolean NOT NULL DEFAULT false,
  creative_url   text CHECK (creative_url IS NULL OR creative_url ~ '^(https://|/)'),
  target_url     text CHECK (target_url IS NULL OR target_url ~ '^https://'),
  budget_usd     numeric(12, 2) NOT NULL DEFAULT 0 CHECK (budget_usd >= 0),
  impressions    bigint NOT NULL DEFAULT 0,
  clicks         bigint NOT NULL DEFAULT 0,
  note           text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ad_campaigns_updated_at BEFORE UPDATE ON ad_campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS ad_campaigns_status_idx ON ad_campaigns (status, start_date DESC);

-- ---------------------------------------------------------------- data pasar
ALTER TABLE instruments
  ADD COLUMN IF NOT EXISTS in_ticker boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS saver_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category_slug text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------- RLS seperti tabel lain
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['category_redirects', 'comment_reports', 'moderation_words', 'app_settings', 'user_warnings', 'ad_campaigns'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oceanpedia_api') THEN
      EXECUTE format('DROP POLICY IF EXISTS api_all ON %I', t);
      EXECUTE format('CREATE POLICY api_all ON %I FOR ALL TO oceanpedia_api USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------- izin modul baru
INSERT INTO permissions (key, grp, label, position) VALUES
  ('taxonomy.manage', 'KONTEN',   'Kelola kategori & tag', 55),
  ('media.manage',    'KONTEN',   'Kelola pustaka media & lisensi', 57),
  ('comments.moderate', 'PENGGUNA', 'Moderasi komentar', 75)
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role, permission)
SELECT r, p FROM (VALUES
  ('superadmin', 'taxonomy.manage'), ('superadmin', 'media.manage'), ('superadmin', 'comments.moderate'),
  ('admin', 'taxonomy.manage'), ('admin', 'media.manage'), ('admin', 'comments.moderate'),
  ('editor', 'taxonomy.manage'), ('editor', 'media.manage'), ('editor', 'comments.moderate'),
  ('support', 'comments.moderate')
) v(r, p) WHERE EXISTS (SELECT 1 FROM roles WHERE key = v.r)
ON CONFLICT DO NOTHING;

-- Jejak perangkat & IP di log aktivitas.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip text, ADD COLUMN IF NOT EXISTS user_agent text;
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
