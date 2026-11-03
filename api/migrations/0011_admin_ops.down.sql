DROP INDEX IF EXISTS comment_reports_created_idx;
DROP INDEX IF EXISTS ad_campaigns_slot_idx;
DELETE FROM app_settings WHERE key = 'market_alerts';
DROP TABLE IF EXISTS market_usage;
ALTER TABLE market_cache DROP COLUMN IF EXISTS latency_ms;
