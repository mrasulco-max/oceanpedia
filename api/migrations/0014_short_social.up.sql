-- Ocean Short: suka, simpan, komentar, dan hitungan bagikan.
ALTER TABLE shorts ADD COLUMN IF NOT EXISTS shares bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS short_likes (
  short_id   uuid NOT NULL REFERENCES shorts (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (short_id, user_id)
);
CREATE TABLE IF NOT EXISTS short_saves (
  short_id   uuid NOT NULL REFERENCES shorts (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (short_id, user_id)
);
CREATE INDEX IF NOT EXISTS short_saves_user_idx ON short_saves (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS short_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id     uuid NOT NULL REFERENCES shorts (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body         text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  status       text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'pending', 'flagged')),
  flag_reason  text,
  moderated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  moderated_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS short_comments_short_idx ON short_comments (short_id, created_at DESC) WHERE status = 'visible';
CREATE INDEX IF NOT EXISTS short_comments_recent_idx ON short_comments (created_at DESC);

ALTER TABLE short_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE short_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE short_comments ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oceanpedia_api') THEN
    FOREACH t IN ARRAY ARRAY['short_likes', 'short_saves', 'short_comments'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS api_all ON %I', t);
      EXECUTE format('CREATE POLICY api_all ON %I FOR ALL TO oceanpedia_api USING (true) WITH CHECK (true)', t);
    END LOOP;
  END IF;
END $$;
