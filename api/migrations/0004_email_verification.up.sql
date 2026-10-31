-- Verifikasi email (OTP) untuk akun baru. Akun yang sudah ada dianggap terverifikasi
-- sehingga tetap bisa masuk tanpa OTP.
UPDATE users SET email_verified_at = coalesce(email_verified_at, created_at) WHERE email_verified_at IS NULL;
CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone_e164) WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;
