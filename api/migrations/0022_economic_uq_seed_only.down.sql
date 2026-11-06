DROP INDEX IF EXISTS economic_events_uq;
DELETE FROM economic_events a USING economic_events b
WHERE a.ctid > b.ctid AND a.country = b.country AND a.title = b.title AND a.scheduled_at = b.scheduled_at;
CREATE UNIQUE INDEX IF NOT EXISTS economic_events_uq ON economic_events (country, title, scheduled_at);
