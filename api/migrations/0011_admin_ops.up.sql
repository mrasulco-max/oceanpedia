-- Operasional panel admin: kesehatan & kuota feed data pasar, aturan peringatan.

-- Latensi panggilan terakhir ke penyedia per kunci cache (mis. "q:BBCA:IDX").
ALTER TABLE market_cache ADD COLUMN IF NOT EXISTS latency_ms int;

-- Pemakaian penyedia data per hari (1 panggilan Twelve Data = 1 kredit).
CREATE TABLE IF NOT EXISTS market_usage (
  day        date NOT NULL DEFAULT current_date,
  provider   text NOT NULL,
  calls      int NOT NULL DEFAULT 0,
  errors     int NOT NULL DEFAULT 0,
  limited    int NOT NULL DEFAULT 0,
  latency_ms bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, provider)
);

INSERT INTO app_settings (key, value) VALUES
  ('market_alerts', '{"latency": true, "rate_limit": true, "quota": true, "ws_drop": false}')
ON CONFLICT DO NOTHING;

ALTER TABLE market_usage ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oceanpedia_api') THEN
    DROP POLICY IF EXISTS api_all ON market_usage;
    CREATE POLICY api_all ON market_usage FOR ALL TO oceanpedia_api USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ad_campaigns_slot_idx ON ad_campaigns (slot_code, start_date, end_date);
CREATE INDEX IF NOT EXISTS comment_reports_created_idx ON comment_reports (created_at DESC);
