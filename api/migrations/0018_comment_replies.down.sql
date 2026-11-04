DROP INDEX IF EXISTS comments_parent_idx;
DROP INDEX IF EXISTS short_comments_parent_idx;
ALTER TABLE short_comments DROP COLUMN IF EXISTS parent_id;
