-- Alur redaksi: pencatat pembuat artikel, catatan review, dan penyimpanan media (foto sampul).

ALTER TABLE articles ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS review_note text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS articles_status_idx ON articles (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS articles_created_by_idx ON articles (created_by);

-- Gambar disimpan di database agar tidak butuh layanan penyimpanan terpisah (maks. 4 MB per berkas).
CREATE TABLE IF NOT EXISTS media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mime        text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size        int NOT NULL CHECK (size > 0 AND size <= 4194304),
  bytes       bytea NOT NULL,
  uploaded_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
