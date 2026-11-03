DROP TABLE IF EXISTS event_reminders;
DROP INDEX IF EXISTS price_alerts_active_idx;
ALTER TABLE price_alerts DROP COLUMN IF EXISTS last_price;
DROP TABLE IF EXISTS article_notified;
DROP INDEX IF EXISTS notifications_unread_idx;
DROP INDEX IF EXISTS notifications_user_idx;
