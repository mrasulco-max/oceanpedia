DROP TABLE IF EXISTS audit_log, ad_slots, notifications, payments, invoices, subscriptions, subscription_plans,
  price_alerts, watchlist_items, watchlists, comments, reactions, bookmarks, economic_events,
  article_instruments, instruments, article_tags, tags, articles, authors, categories, refresh_tokens, users CASCADE;
DROP SEQUENCE IF EXISTS invoice_number_seq;
DROP FUNCTION IF EXISTS set_updated_at();
