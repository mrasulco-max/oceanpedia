-- Kode OTP huruf+angka yang dibuat server (hanya hash yang disimpan).
CREATE TABLE IF NOT EXISTS auth_codes (
  email       text PRIMARY KEY,
  code_hash   bytea,
  provider    text NOT NULL DEFAULT 'email',   -- email (kode sendiri) | verify (cadangan Bird Verify)
  expires_at  timestamptz NOT NULL,
  attempts    int NOT NULL DEFAULT 0,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  window_at   timestamptz NOT NULL DEFAULT now(),
  window_sent int NOT NULL DEFAULT 1
);
