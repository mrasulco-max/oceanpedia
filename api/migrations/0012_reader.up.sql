-- Fitur pembaca: notifikasi dalam aplikasi, notifikasi artikel (sekali per artikel), evaluasi price alert.
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS article_notified (
  article_id uuid PRIMARY KEY REFERENCES articles (id) ON DELETE CASCADE,
  recipients int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS last_price numeric(20, 8);
CREATE INDEX IF NOT EXISTS price_alerts_active_idx ON price_alerts (symbol) WHERE active;

-- Pengingat kalender ekonomi ("Ingatkan saya"): notifikasi ±15 menit sebelum rilis.
CREATE TABLE IF NOT EXISTS event_reminders (
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES economic_events (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  PRIMARY KEY (user_id, event_id)
);
CREATE INDEX IF NOT EXISTS event_reminders_due_idx ON event_reminders (event_id) WHERE notified_at IS NULL;

ALTER TABLE event_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_notified ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oceanpedia_api') THEN
    DROP POLICY IF EXISTS api_all ON event_reminders;
    CREATE POLICY api_all ON event_reminders FOR ALL TO oceanpedia_api USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS api_all ON article_notified;
    CREATE POLICY api_all ON article_notified FOR ALL TO oceanpedia_api USING (true) WITH CHECK (true);
  END IF;
END $$;
