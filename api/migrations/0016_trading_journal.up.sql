-- Jurnal Trading: catatan posisi pribadi pengguna (semua jenis akun).
CREATE TABLE IF NOT EXISTS trading_journal (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  symbol      text NOT NULL CHECK (char_length(symbol) BETWEEN 1 AND 20),
  market      text NOT NULL DEFAULT 'lainnya' CHECK (market IN ('saham', 'crypto', 'forex', 'komoditas', 'indeks', 'lainnya')),
  side        text NOT NULL CHECK (side IN ('long', 'short')),
  currency    text NOT NULL DEFAULT 'IDR' CHECK (char_length(currency) BETWEEN 3 AND 5),
  entry_price numeric(24, 8) NOT NULL CHECK (entry_price > 0),
  exit_price  numeric(24, 8) CHECK (exit_price > 0),
  quantity    numeric(28, 8) NOT NULL CHECK (quantity > 0),
  fees        numeric(24, 8) NOT NULL DEFAULT 0 CHECK (fees >= 0),
  stop_loss   numeric(24, 8) CHECK (stop_loss > 0),
  take_profit numeric(24, 8) CHECK (take_profit > 0),
  opened_at   timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz,
  strategy    text NOT NULL DEFAULT '' CHECK (char_length(strategy) <= 80),
  emotion     text NOT NULL DEFAULT '' CHECK (char_length(emotion) <= 40),
  notes       text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 4000),
  tags        text[] NOT NULL DEFAULT '{}',
  rating      smallint CHECK (rating BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((exit_price IS NULL) = (closed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS trading_journal_user_idx ON trading_journal (user_id, opened_at DESC);

ALTER TABLE trading_journal ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oceanpedia_api') THEN
    DROP POLICY IF EXISTS api_all ON trading_journal;
    CREATE POLICY api_all ON trading_journal FOR ALL TO oceanpedia_api USING (true) WITH CHECK (true);
  END IF;
END $$;
