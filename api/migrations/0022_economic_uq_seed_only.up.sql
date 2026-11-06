-- Baris TradingView diidentifikasi lewat external_id; indeks (country, title, scheduled_at)
-- hanya untuk baris seed/manual agar dua event TV berjudul sama di jam yang sama tidak menggagalkan sync.
DROP INDEX IF EXISTS economic_events_uq;
CREATE UNIQUE INDEX IF NOT EXISTS economic_events_uq ON economic_events (country, title, scheduled_at) WHERE external_id IS NULL;
