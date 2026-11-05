DROP INDEX IF EXISTS economic_events_external_id_uq;
ALTER TABLE economic_events DROP COLUMN IF EXISTS updated_at;
ALTER TABLE economic_events DROP COLUMN IF EXISTS source;
ALTER TABLE economic_events DROP COLUMN IF EXISTS external_id;
