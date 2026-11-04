package store

import "context"

// Rahasia TOTP (terenkripsi) disimpan di preferences: totp_secret (aktif) dan totp_pending (saat penyiapan).
// Kunci-kunci ini tidak bisa diubah lewat PATCH /v1/me (preferensi divalidasi daftar putih).
const qTOTPGet = `SELECT COALESCE(preferences->>'totp_secret', ''), COALESCE(preferences->>'totp_pending', '') FROM users WHERE id = $1::uuid AND deleted_at IS NULL`
const qTOTPSet = `UPDATE users SET preferences = CASE WHEN $3::text = '' THEN COALESCE(preferences, '{}'::jsonb) - $2::text
  ELSE COALESCE(preferences, '{}'::jsonb) || jsonb_build_object($2::text, $3::text) END, updated_at = now() WHERE id = $1::uuid`

// TOTP mengembalikan rahasia aktif & yang sedang disiapkan (terenkripsi; kosong bila tidak ada).
func (p *PG) TOTP(ctx context.Context, uid string) (active, pending string, err error) {
	err = p.DB.QueryRowContext(ctx, qTOTPGet, uid).Scan(&active, &pending)
	return active, pending, notFound(err)
}

// SetTOTP menyimpan (atau menghapus bila value kosong) kunci "totp_secret" / "totp_pending".
func (p *PG) SetTOTP(ctx context.Context, uid, key, value string) error {
	if key != "totp_secret" && key != "totp_pending" {
		return nil
	}
	_, err := p.DB.ExecContext(ctx, qTOTPSet, uid, key, value)
	return err
}

func totpQueries() map[string]string {
	return map[string]string{"totp_get": qTOTPGet, "totp_set": qTOTPSet}
}
