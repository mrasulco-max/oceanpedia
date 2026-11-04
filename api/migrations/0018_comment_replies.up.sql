-- Balasan komentar (satu tingkat) untuk artikel & Ocean Short.
ALTER TABLE short_comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES short_comments (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS short_comments_parent_idx ON short_comments (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments (parent_id) WHERE parent_id IS NOT NULL;
