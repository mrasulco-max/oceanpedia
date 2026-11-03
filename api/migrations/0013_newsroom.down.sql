DROP TABLE IF EXISTS newsletter_issues;
DROP TABLE IF EXISTS newsletter_subscribers;
DROP TABLE IF EXISTS shorts;
DROP TABLE IF EXISTS live_posts;
DROP TABLE IF EXISTS live_blogs;
ALTER TABLE articles DROP COLUMN IF EXISTS breaking_until;
DROP TABLE IF EXISTS article_versions;
