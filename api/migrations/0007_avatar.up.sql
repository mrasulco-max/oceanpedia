-- Foto profil pengguna (disimpan di tabel media).
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_media_id uuid REFERENCES media (id) ON DELETE SET NULL;
