-- Redaksi lanjutan: riwayat versi artikel, breaking berbatas waktu, live blog, Ocean Short, newsletter.

-- Riwayat versi: satu baris tiap simpan (judul/ringkasan/isi + metadata), dipulihkan dari panel admin.
CREATE TABLE IF NOT EXISTS article_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  version    int NOT NULL,
  title      text NOT NULL,
  excerpt    text NOT NULL DEFAULT '',
  body       text NOT NULL DEFAULT '',
  status     text NOT NULL,
  symbols    text[] NOT NULL DEFAULT '{}',
  note       text NOT NULL DEFAULT '',
  editor_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, version)
);

-- Breaking tayang maksimal 6 jam (bisa diperpanjang / diakhiri manual).
ALTER TABLE articles ADD COLUMN IF NOT EXISTS breaking_until timestamptz;

-- Live blog: satu liputan langsung aktif berisi pembaruan bertanda waktu.
CREATE TABLE IF NOT EXISTS live_blogs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 200),
  summary    text NOT NULL DEFAULT '',
  symbol     text,
  status     text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  closes_at  timestamptz,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz
);
CREATE TABLE IF NOT EXISTS live_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id    uuid NOT NULL REFERENCES live_blogs (id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  kind       text NOT NULL DEFAULT 'update' CHECK (kind IN ('update', 'breaking', 'quote')),
  symbol     text,
  pinned     boolean NOT NULL DEFAULT false,
  author_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_posts_blog_idx ON live_posts (blog_id, created_at DESC);

-- Ocean Short: video/ringkasan singkat.
CREATE TABLE IF NOT EXISTS shorts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 140),
  caption    text NOT NULL DEFAULT '',
  video_url  text,
  cover_url  text,
  symbol     text,
  category   text,
  status     text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  views      bigint NOT NULL DEFAULT 0,
  duration_s int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shorts_pub_idx ON shorts (created_at DESC) WHERE status = 'published';

-- Newsletter: pelanggan (tamu atau akun) dan edisi terkirim.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL UNIQUE CHECK (email = lower(email)),
  user_id      uuid REFERENCES users (id) ON DELETE SET NULL,
  lists        text[] NOT NULL DEFAULT '{daily}',
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced')),
  token        text NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
  source       text NOT NULL DEFAULT 'web',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS newsletter_issues (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list       text NOT NULL DEFAULT 'daily',
  subject    text NOT NULL CHECK (char_length(subject) BETWEEN 4 AND 200),
  intro      text NOT NULL DEFAULT '',
  article_ids uuid[] NOT NULL DEFAULT '{}',
  status     text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  recipients int NOT NULL DEFAULT 0,
  failed     int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz
);

ALTER TABLE article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_issues ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oceanpedia_api') THEN
    FOREACH t IN ARRAY ARRAY['article_versions', 'live_blogs', 'live_posts', 'shorts', 'newsletter_subscribers', 'newsletter_issues'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS api_all ON %I', t);
      EXECUTE format('CREATE POLICY api_all ON %I FOR ALL TO oceanpedia_api USING (true) WITH CHECK (true)', t);
    END LOOP;
  END IF;
END $$;
