-- Notifikasi otomatis "Rilis data berdampak tinggi" (sekali per event) untuk pengguna yang mengaktifkannya.
ALTER TABLE economic_events ADD COLUMN IF NOT EXISTS high_notified_at timestamptz;
