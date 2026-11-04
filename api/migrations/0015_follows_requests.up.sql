-- Ikuti kategori & penulis, permintaan kerja sama iklan, verifikasi Student, dan permintaan data pribadi.
CREATE TABLE IF NOT EXISTS user_categories (
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category_id)
);
CREATE INDEX IF NOT EXISTS user_categories_cat_idx ON user_categories (category_id);
CREATE TABLE IF NOT EXISTS user_authors (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES authors (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, author_id)
);
CREATE INDEX IF NOT EXISTS user_authors_author_idx ON user_authors (author_id);

CREATE TABLE IF NOT EXISTS ad_inquiries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company     text NOT NULL CHECK (char_length(company) BETWEEN 2 AND 160),
  email       text NOT NULL CHECK (char_length(email) BETWEEN 5 AND 200),
  budget      text NOT NULL DEFAULT '',
  message     text NOT NULL DEFAULT '',
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'won', 'lost')),
  handled_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  handled_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_inquiries_recent_idx ON ad_inquiries (created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS student_verified_until timestamptz;
CREATE TABLE IF NOT EXISTS student_verifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  campus_email text NOT NULL CHECK (char_length(campus_email) BETWEEN 5 AND 200),
  student_id   text NOT NULL CHECK (char_length(student_id) BETWEEN 3 AND 40),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note         text NOT NULL DEFAULT '',
  reviewed_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_verifications_user_idx ON student_verifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('export', 'delete', 'correction', 'other')),
  detail      text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'rejected')),
  handled_by  uuid REFERENCES users (id) ON DELETE SET NULL,
  handled_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS privacy_requests_recent_idx ON privacy_requests (created_at DESC);

-- Penugasan editor untuk meninjau artikel.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE user_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_requests ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oceanpedia_api') THEN
    FOREACH t IN ARRAY ARRAY['user_categories', 'user_authors', 'ad_inquiries', 'student_verifications', 'privacy_requests'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS api_all ON %I', t);
      EXECUTE format('CREATE POLICY api_all ON %I FOR ALL TO oceanpedia_api USING (true) WITH CHECK (true)', t);
    END LOOP;
  END IF;
END $$;
