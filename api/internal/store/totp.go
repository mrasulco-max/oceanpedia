package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
)

// Rahasia TOTP (terenkripsi) disimpan di preferences: totp_secret (aktif) dan totp_pending (saat penyiapan).
// Pendukung keamanan, juga di preferences:
//   - totp_recovery  : hash kode cadangan sekali pakai, dipisah koma (kode aslinya tidak pernah disimpan)
//   - totp_last_step : langkah (counter 30 detik) kode TOTP terakhir yang diterima — mencegah kode dipakai ulang
//   - totp_fail      : {"t": awal jendela (unix), "n": jumlah percobaan} — batas tebakan kode
//
// Kunci-kunci ini tidak bisa diubah lewat PATCH /v1/me (preferensi divalidasi daftar putih).
const qTOTPGet = `SELECT COALESCE(preferences->>'totp_secret', ''), COALESCE(preferences->>'totp_pending', '') FROM users WHERE id = $1::uuid AND deleted_at IS NULL`
const qTOTPSet = `UPDATE users SET preferences = CASE WHEN $3::text = '' THEN COALESCE(preferences, '{}'::jsonb) - $2::text
  ELSE COALESCE(preferences, '{}'::jsonb) || jsonb_build_object($2::text, $3::text) END, updated_at = now() WHERE id = $1::uuid`

// Hapus semua status autentikator sekaligus (dimatikan pengguna / direset admin).
const qTOTPClear = `UPDATE users SET preferences = COALESCE(preferences, '{}'::jsonb) - 'totp_secret' - 'totp_pending' - 'totp_recovery' - 'totp_last_step' - 'totp_fail',
  updated_at = now() WHERE id = $1::uuid AND deleted_at IS NULL`

// Terima langkah hanya bila lebih baru dari yang terakhir dipakai (atomik: dua request paralel dengan kode sama → hanya satu lolos).
const qTOTPUseStep = `UPDATE users SET preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('totp_last_step', $2::bigint)
  WHERE id = $1::uuid AND deleted_at IS NULL AND COALESCE((preferences->>'totp_last_step')::bigint, -1) < $2::bigint RETURNING true`

// Catat satu percobaan dalam jendela waktu dan kembalikan jumlahnya (jendela kedaluwarsa → mulai dari 1).
const qTOTPAttempt = `UPDATE users SET preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('totp_fail',
    CASE WHEN COALESCE((preferences->'totp_fail'->>'t')::bigint, 0) > $2::bigint - $3::bigint
      THEN jsonb_build_object('t', (preferences->'totp_fail'->>'t')::bigint, 'n', COALESCE((preferences->'totp_fail'->>'n')::int, 0) + 1)
      ELSE jsonb_build_object('t', $2::bigint, 'n', 1) END)
  WHERE id = $1::uuid AND deleted_at IS NULL RETURNING (preferences->'totp_fail'->>'n')::int`

const qTOTPRecovery = `SELECT COALESCE(preferences->>'totp_recovery', '') FROM users WHERE id = $1::uuid AND deleted_at IS NULL`

// Pakai satu kode cadangan: hapus hash-nya dari daftar hanya bila masih ada (atomik, tidak bisa dipakai dua kali).
const qTOTPUseRecovery = `UPDATE users SET preferences = preferences || jsonb_build_object('totp_recovery',
    array_to_string(array_remove(string_to_array(preferences->>'totp_recovery', ','), $2::text), ','))
  WHERE id = $1::uuid AND deleted_at IS NULL AND $2::text = ANY(string_to_array(COALESCE(preferences->>'totp_recovery', ''), ','))
  RETURNING array_length(array_remove(string_to_array(preferences->>'totp_recovery', ','), ''), 1)`

// TOTP mengembalikan rahasia aktif & yang sedang disiapkan (terenkripsi; kosong bila tidak ada).
func (p *PG) TOTP(ctx context.Context, uid string) (active, pending string, err error) {
	err = p.DB.QueryRowContext(ctx, qTOTPGet, uid).Scan(&active, &pending)
	return active, pending, notFound(err)
}

// SetTOTP menyimpan (atau menghapus bila value kosong) kunci autentikator di preferences.
func (p *PG) SetTOTP(ctx context.Context, uid, key, value string) error {
	switch key {
	case "totp_secret", "totp_pending", "totp_recovery", "totp_fail":
	default:
		return nil
	}
	_, err := p.DB.ExecContext(ctx, qTOTPSet, uid, key, value)
	return err
}

// ClearTOTP mematikan autentikator dan menghapus kode cadangan, penanda langkah, serta penghitung percobaan.
func (p *PG) ClearTOTP(ctx context.Context, uid string) error {
	_, err := p.DB.ExecContext(ctx, qTOTPClear, uid)
	return err
}

// UseTOTPStep menandai langkah kode TOTP sebagai terpakai. false = kode itu (atau yang lebih baru) sudah pernah dipakai.
func (p *PG) UseTOTPStep(ctx context.Context, uid string, step int64) (bool, error) {
	var ok bool
	err := p.DB.QueryRowContext(ctx, qTOTPUseStep, uid, step).Scan(&ok)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return ok, err
}

// TOTPAttempt mencatat satu percobaan kode pada waktu now (unix) dan mengembalikan jumlah percobaan
// dalam jendela windowSec detik terakhir (termasuk yang ini).
func (p *PG) TOTPAttempt(ctx context.Context, uid string, now, windowSec int64) (int, error) {
	var n int
	err := p.DB.QueryRowContext(ctx, qTOTPAttempt, uid, now, windowSec).Scan(&n)
	return n, notFound(err)
}

// TOTPRecovery mengembalikan hash kode cadangan yang belum dipakai.
func (p *PG) TOTPRecovery(ctx context.Context, uid string) ([]string, error) {
	var s string
	if err := p.DB.QueryRowContext(ctx, qTOTPRecovery, uid).Scan(&s); err != nil {
		return nil, notFound(err)
	}
	return splitHashes(s), nil
}

// UseRecoveryCode memakai satu kode cadangan (berdasarkan hash-nya). ok=false bila tidak ada / sudah dipakai.
func (p *PG) UseRecoveryCode(ctx context.Context, uid, hash string) (left int, ok bool, err error) {
	var n sql.NullInt64
	err = p.DB.QueryRowContext(ctx, qTOTPUseRecovery, uid, hash).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return int(n.Int64), true, nil
}

func splitHashes(s string) []string {
	out := []string{}
	for _, h := range strings.Split(s, ",") {
		if h != "" {
			out = append(out, h)
		}
	}
	return out
}

func totpQueries() map[string]string {
	return map[string]string{
		"totp_get": qTOTPGet, "totp_set": qTOTPSet, "totp_clear": qTOTPClear, "totp_use_step": qTOTPUseStep,
		"totp_attempt": qTOTPAttempt, "totp_recovery": qTOTPRecovery, "totp_use_recovery": qTOTPUseRecovery,
	}
}
