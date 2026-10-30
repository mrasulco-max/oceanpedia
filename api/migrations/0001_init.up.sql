-- OceanPedia · skema awal
-- Konvensi: snake_case, PK uuid (gen_random_uuid), waktu timestamptz (UTC),
-- uang bigint dalam satuan terkecil + kode mata uang ISO 4217, negara ISO 3166-1 alpha-2.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- akun
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  password_hash     text,
  full_name         text NOT NULL,
  phone_e164        text,
  role              text NOT NULL DEFAULT 'reader' CHECK (role IN ('reader', 'author', 'editor', 'admin')),
  locale            text NOT NULL DEFAULT 'id-ID',
  time_zone         text NOT NULL DEFAULT 'Asia/Jakarta',
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  CONSTRAINT users_phone_e164 CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE deleted_at IS NULL;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,
  user_agent  text,
  ip          inet,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------- konten
CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon        text NOT NULL DEFAULT 'doc',
  parent_id   uuid REFERENCES categories (id) ON DELETE SET NULL,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE authors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid UNIQUE REFERENCES users (id) ON DELETE SET NULL,
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name        text NOT NULL,
  title       text NOT NULL DEFAULT '',
  bio         text NOT NULL DEFAULT '',
  avatar_url  text,
  verified    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER authors_updated_at BEFORE UPDATE ON authors FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE articles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 8 AND 200),
  excerpt         text NOT NULL DEFAULT '',
  body            text NOT NULL DEFAULT '',
  cover_url       text,
  cover_alt       text NOT NULL DEFAULT '',
  category_id     uuid NOT NULL REFERENCES categories (id),
  author_id       uuid NOT NULL REFERENCES authors (id),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'scheduled', 'published', 'archived')),
  is_premium      boolean NOT NULL DEFAULT false,
  is_breaking     boolean NOT NULL DEFAULT false,
  reading_minutes smallint NOT NULL DEFAULT 3 CHECK (reading_minutes > 0),
  view_count      bigint NOT NULL DEFAULT 0,
  ai_summary      text,
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  search          tsvector GENERATED ALWAYS AS (
                    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                    setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B') ||
                    setweight(to_tsvector('simple', coalesce(body, '')), 'C')) STORED,
  CONSTRAINT articles_published_has_date CHECK (status <> 'published' OR published_at IS NOT NULL)
);
CREATE INDEX articles_published_idx ON articles (published_at DESC) WHERE status = 'published';
CREATE INDEX articles_category_idx ON articles (category_id, published_at DESC) WHERE status = 'published';
CREATE INDEX articles_search_idx ON articles USING gin (search);
CREATE TRIGGER articles_updated_at BEFORE UPDATE ON articles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tags (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug  text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name  text NOT NULL
);
CREATE TABLE article_tags (
  article_id uuid NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

-- ---------------------------------------------------------------- pasar
CREATE TABLE instruments (
  symbol            text PRIMARY KEY CHECK (symbol ~ '^[A-Z0-9./:-]+$'),
  name              text NOT NULL,
  exchange          text NOT NULL,
  asset_class       text NOT NULL CHECK (asset_class IN ('equity', 'index', 'crypto', 'commodity', 'forex')),
  currency          char(3) NOT NULL,
  provider_symbol   text NOT NULL,           -- simbol di Twelve Data
  sector            text,
  active            boolean NOT NULL DEFAULT true
);
CREATE TABLE article_instruments (
  article_id uuid NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  symbol     text NOT NULL REFERENCES instruments (symbol),
  PRIMARY KEY (article_id, symbol)
);

CREATE TABLE economic_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country         char(2) NOT NULL,
  title           text NOT NULL,
  impact          text NOT NULL CHECK (impact IN ('low', 'medium', 'high')),
  scheduled_at    timestamptz NOT NULL,
  actual          text,
  forecast        text,
  previous        text,
  related_symbols text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX economic_events_time_idx ON economic_events (scheduled_at);
CREATE UNIQUE INDEX economic_events_uq ON economic_events (country, title, scheduled_at);

-- ---------------------------------------------------------------- interaksi pembaca
CREATE TABLE bookmarks (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, article_id)
);
CREATE TABLE reactions (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('bullish', 'bearish', 'informative', 'favorite')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, article_id)
);
CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  parent_id  uuid REFERENCES comments (id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status     text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'flagged')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_article_idx ON comments (article_id, created_at DESC) WHERE status = 'visible';

CREATE TABLE watchlists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT 'Watchlist',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE watchlist_items (
  watchlist_id uuid NOT NULL REFERENCES watchlists (id) ON DELETE CASCADE,
  symbol       text NOT NULL REFERENCES instruments (symbol),
  sort_order   int NOT NULL DEFAULT 0,
  added_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_id, symbol)
);

CREATE TABLE price_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  symbol       text NOT NULL REFERENCES instruments (symbol),
  condition    text NOT NULL CHECK (condition IN ('price_above', 'price_below', 'change_pct', 'volume_spike', 'rsi', 'news')),
  threshold    numeric(20, 8),
  frequency    text NOT NULL DEFAULT 'once' CHECK (frequency IN ('once', 'every_time', 'daily')),
  channels     text[] NOT NULL DEFAULT '{push}',
  note         text NOT NULL DEFAULT '',
  active       boolean NOT NULL DEFAULT true,
  expires_at   timestamptz,
  triggered_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_alerts_channels CHECK (channels <@ ARRAY['push', 'email', 'whatsapp', 'in_app']::text[])
);
CREATE INDEX price_alerts_active_idx ON price_alerts (symbol) WHERE active;

-- ---------------------------------------------------------------- langganan & pembayaran
CREATE TABLE subscription_plans (
  code          text PRIMARY KEY CHECK (code ~ '^[a-z_]+$'),
  name          text NOT NULL,
  price_amount  bigint NOT NULL CHECK (price_amount >= 0),   -- belum termasuk pajak
  currency      char(3) NOT NULL DEFAULT 'IDR',
  billing_period text NOT NULL CHECK (billing_period IN ('month', 'year')),
  min_seats     int NOT NULL DEFAULT 1,
  features      jsonb NOT NULL DEFAULT '[]',
  active        boolean NOT NULL DEFAULT true
);
CREATE TABLE subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan_code            text NOT NULL REFERENCES subscription_plans (code),
  status               text NOT NULL CHECK (status IN ('pending', 'active', 'past_due', 'canceled', 'expired')),
  seats                int NOT NULL DEFAULT 1,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subscriptions_one_active ON subscriptions (user_id) WHERE status IN ('active', 'past_due');
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE SEQUENCE invoice_number_seq;
CREATE TABLE invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number          text NOT NULL UNIQUE,
  user_id         uuid NOT NULL REFERENCES users (id),
  subscription_id uuid REFERENCES subscriptions (id),
  subtotal        bigint NOT NULL,
  discount        bigint NOT NULL DEFAULT 0,
  tax_rate        numeric(6, 4) NOT NULL,
  tax_amount      bigint NOT NULL,
  total           bigint NOT NULL,
  currency        char(3) NOT NULL DEFAULT 'IDR',
  promo_code      text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'paid', 'void')),
  issued_at       timestamptz NOT NULL DEFAULT now(),
  paid_at         timestamptz,
  CONSTRAINT invoices_total CHECK (total = subtotal - discount + tax_amount)
);
CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES invoices (id),
  provider      text NOT NULL,                -- mis. midtrans, xendit
  method        text NOT NULL,                -- qris, va_bca, va_mandiri, va_bri, gopay, ovo, dana, card
  provider_ref  text,
  amount        bigint NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'expired', 'refunded')),
  expires_at    timestamptz,
  paid_at       timestamptz,
  raw           jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  channel    text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'push', 'in_app')),
  template   text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  status     text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  read_at    timestamptz,
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- ---------------------------------------------------------------- iklan & audit
CREATE TABLE ad_slots (
  code       text PRIMARY KEY,
  surface    text NOT NULL CHECK (surface IN ('web', 'app')),
  placement  text NOT NULL,
  width      int NOT NULL,
  height     int NOT NULL,
  pages      text[] NOT NULL,                -- halaman yang boleh menampilkan slot
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  actor_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  data       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
