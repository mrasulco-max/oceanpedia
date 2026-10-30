DROP TABLE IF EXISTS media;
DROP INDEX IF EXISTS articles_created_by_idx;
DROP INDEX IF EXISTS articles_status_idx;
ALTER TABLE articles DROP COLUMN IF EXISTS review_note;
ALTER TABLE articles DROP COLUMN IF EXISTS created_by;
