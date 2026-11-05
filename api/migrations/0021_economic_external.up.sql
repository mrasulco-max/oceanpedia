-- Sumber kalender ekonomi eksternal (TradingView Data API): id stabil + jejak sync.
ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- NULL diizinkan berkali-kali (baris seed); nilai non-null harus unik.
CREATE UNIQUE INDEX IF NOT EXISTS economic_events_external_id_uq ON economic_events (external_id);
UPDATE economic_events SET source = 'seed' WHERE source IS NULL AND external_id IS NULL;
