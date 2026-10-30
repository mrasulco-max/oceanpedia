-- Cache data pasar bersama untuk semua instance (menghemat kuota penyedia data).
CREATE TABLE IF NOT EXISTS market_cache (
  key        text PRIMARY KEY,
  body       jsonb,
  error      text NOT NULL DEFAULT '',
  fetched_at timestamptz NOT NULL DEFAULT now()
);
