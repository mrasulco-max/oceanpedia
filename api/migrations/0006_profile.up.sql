-- Profil pengguna: nama tampilan, preferensi (notifikasi, tampilan, wilayah), dan topik yang diikuti.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS user_topics (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tag_id)
);
