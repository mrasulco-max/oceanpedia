package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/auth"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// ======================================================================= verifikasi 2 langkah: aplikasi autentikator (TOTP)

// Batas tebakan kode autentikator / kode cadangan / kata sandi konfirmasi: 5 percobaan per 15 menit per akun.
// Dihitung per akun (bukan per IP atau per challenge) sehingga tidak bisa diakali dengan masuk ulang atau ganti IP.
const (
	totpMaxAttempts = 5
	totpWindow      = 15 * time.Minute
)

// totpSecret: rahasia TOTP aktif pengguna (sudah didekripsi), kosong bila tidak memakai autentikator.
func (s *Server) totpSecret(r *http.Request, uid string) string {
	sealed, _, err := s.Store.TOTP(r.Context(), uid)
	if err != nil || sealed == "" {
		return ""
	}
	plain, err := auth.OpenTOTP(s.Cfg.JWTSecret, sealed)
	if err != nil {
		s.Log.Warn("rahasia TOTP tidak bisa dibuka", "err", err)
		return ""
	}
	return plain
}

func totpLocked() *httpx.Problem {
	return &httpx.Problem{Type: "about:blank", Title: "Terlalu banyak percobaan", Status: http.StatusTooManyRequests,
		Detail: fmt.Sprintf("Terlalu banyak kode salah. Coba lagi dalam %d menit.", int(totpWindow.Minutes()))}
}

// totpAttempt mencatat satu percobaan dan menolak bila batas terlampaui. Mengembalikan sisa percobaan.
func (s *Server) totpAttempt(ctx context.Context, uid string) (int, error) {
	n, err := s.Store.TOTPAttempt(ctx, uid, s.Now().Unix(), int64(totpWindow/time.Second))
	if err != nil {
		return 0, err
	}
	if n > totpMaxAttempts {
		return 0, totpLocked()
	}
	return totpMaxAttempts - n, nil
}

// wrongCode: pesan kode salah beserta sisa percobaan.
func wrongCode(msg string, left int) error {
	if left > 0 {
		msg += fmt.Sprintf(" Sisa %d percobaan.", left)
	} else {
		msg += fmt.Sprintf(" Batas percobaan tercapai, coba lagi dalam %d menit.", int(totpWindow.Minutes()))
	}
	return httpx.Validation(map[string]string{"code": msg})
}

// checkSecondFactor memeriksa kode dari aplikasi autentikator ATAU kode cadangan sekali pakai.
// Aturan: maks. 5 percobaan / 15 menit per akun, kode TOTP yang sama tidak bisa dipakai dua kali,
// dan kode cadangan langsung hangus setelah dipakai. method = "totp" | "recovery".
func (s *Server) checkSecondFactor(ctx context.Context, uid, secret, code string) (method string, recoveryLeft int, err error) {
	left, err := s.totpAttempt(ctx, uid)
	if err != nil {
		return "", 0, err
	}
	if rc := auth.NormalizeRecovery(code); rc != "" {
		n, ok, err := s.Store.UseRecoveryCode(ctx, uid, auth.HashRecovery(s.Cfg.JWTSecret, uid, rc))
		if err != nil {
			return "", 0, err
		}
		if !ok {
			return "", 0, wrongCode("Kode cadangan salah atau sudah pernah dipakai.", left)
		}
		_ = s.Store.SetTOTP(ctx, uid, "totp_fail", "")
		return "recovery", n, nil
	}
	step, ok := auth.TOTPStep(secret, code, s.Now())
	if !ok {
		return "", 0, wrongCode("Kode autentikator salah atau kedaluwarsa.", left)
	}
	fresh, err := s.Store.UseTOTPStep(ctx, uid, step)
	if err != nil {
		return "", 0, err
	}
	if !fresh {
		return "", 0, wrongCode("Kode ini sudah dipakai. Tunggu kode berikutnya di aplikasi.", left)
	}
	_ = s.Store.SetTOTP(ctx, uid, "totp_fail", "")
	return "totp", 0, nil
}

// reauthTOTP: konfirmasi pemilik akun (kode autentikator, kode cadangan, atau kata sandi) sebelum
// mematikan autentikator / membuat kode cadangan baru. Ikut dibatasi 5 percobaan / 15 menit.
func (s *Server) reauthTOTP(r *http.Request, secret, code, password string) error {
	uid := uid(r)
	if strings.TrimSpace(code) != "" {
		_, _, err := s.checkSecondFactor(r.Context(), uid, secret, code)
		return err
	}
	if password == "" {
		return httpx.Validation(map[string]string{"code": "Masukkan kode dari aplikasi autentikator, kode cadangan, atau kata sandi."})
	}
	left, err := s.totpAttempt(r.Context(), uid)
	if err != nil {
		return err
	}
	u, err := s.Store.UserByID(r.Context(), uid)
	if err != nil {
		return err
	}
	if u.PasswordHash == "" || !auth.CheckPassword(u.PasswordHash, password) {
		return wrongCode("Kata sandi salah.", left)
	}
	_ = s.Store.SetTOTP(r.Context(), uid, "totp_fail", "")
	return nil
}

// newRecoveryCodes membuat 10 kode cadangan baru (menggantikan yang lama) dan hanya menyimpan hash-nya.
func (s *Server) newRecoveryCodes(ctx context.Context, uid string) ([]string, error) {
	codes, err := auth.NewRecoveryCodes(auth.RecoveryCount)
	if err != nil {
		return nil, err
	}
	hashes := make([]string, len(codes))
	for i, c := range codes {
		hashes[i] = auth.HashRecovery(s.Cfg.JWTSecret, uid, c)
	}
	if err := s.Store.SetTOTP(ctx, uid, "totp_recovery", strings.Join(hashes, ",")); err != nil {
		return nil, err
	}
	return codes, nil
}

// GET /v1/me/2fa — metode verifikasi 2 langkah yang aktif dan sisa kode cadangan.
func (s *Server) twoFAStatus(w http.ResponseWriter, r *http.Request) error {
	email, _ := s.Store.Reader2FA(r.Context(), uid(r))
	on := s.totpSecret(r, uid(r)) != ""
	left := 0
	if on {
		if l, err := s.Store.TOTPRecovery(r.Context(), uid(r)); err == nil {
			left = len(l)
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, 200, map[string]any{"email": email, "totp": on, "recovery_left": left})
	return nil
}

// POST /v1/me/2fa/totp/setup — buat rahasia baru (belum aktif sampai dikonfirmasi dengan kode).
func (s *Server) totpSetup(w http.ResponseWriter, r *http.Request) error {
	u, err := s.Store.UserByID(r.Context(), uid(r))
	if err != nil {
		return err
	}
	if s.totpSecret(r, u.ID) != "" {
		// Mengganti autentikator yang aktif harus lewat "matikan" (butuh konfirmasi) lebih dulu.
		return httpx.Conflict("Aplikasi autentikator sudah aktif. Matikan dulu untuk memasang ulang.")
	}
	secret, err := auth.NewTOTPSecret()
	if err != nil {
		return err
	}
	sealed, err := auth.SealTOTP(s.Cfg.JWTSecret, secret)
	if err != nil {
		return err
	}
	if err := s.Store.SetTOTP(r.Context(), u.ID, "totp_pending", sealed); err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, 200, map[string]any{"secret": secret, "uri": auth.TOTPURI(secret, u.Email, "OceanBird"), "issuer": "OceanBird", "account": u.Email})
	return nil
}

// POST /v1/me/2fa/totp/enable {code} — aktifkan setelah kode dari aplikasi cocok; balas 10 kode cadangan (sekali tampil).
func (s *Server) totpEnable(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Code string `json:"code"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	id := uid(r)
	_, pending, err := s.Store.TOTP(r.Context(), id)
	if err != nil {
		return err
	}
	if pending == "" {
		return httpx.Validation(map[string]string{"code": "Mulai penyiapan aplikasi autentikator terlebih dahulu."})
	}
	secret, err := auth.OpenTOTP(s.Cfg.JWTSecret, pending)
	if err != nil {
		return httpx.Validation(map[string]string{"code": "Penyiapan kedaluwarsa. Mulai ulang."})
	}
	step, ok := auth.TOTPStep(secret, in.Code, s.Now())
	if !ok {
		return httpx.Validation(map[string]string{"code": "Kode tidak cocok. Pastikan jam ponsel akurat lalu coba kode terbaru."})
	}
	// Mulai bersih: hapus sisa kode cadangan / penanda lama, lalu pasang rahasia baru.
	if err := s.Store.ClearTOTP(r.Context(), id); err != nil {
		return err
	}
	if err := s.Store.SetTOTP(r.Context(), id, "totp_secret", pending); err != nil {
		return err
	}
	// Kode yang dipakai untuk mengaktifkan tidak bisa dipakai lagi untuk masuk.
	if _, err := s.Store.UseTOTPStep(r.Context(), id, step); err != nil {
		return err
	}
	codes, err := s.newRecoveryCodes(r.Context(), id)
	if err != nil {
		return err
	}
	s.audit2(r, id, "auth.totp_enabled", nil)
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, 200, map[string]any{"totp": true, "recovery_codes": codes})
	return nil
}

// POST /v1/me/2fa/totp/recovery {code | password} — buat 10 kode cadangan baru; kode lama langsung tidak berlaku.
func (s *Server) totpRecovery(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Code     string `json:"code"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	secret := s.totpSecret(r, uid(r))
	if secret == "" {
		return httpx.Conflict("Aplikasi autentikator belum aktif.")
	}
	if err := s.reauthTOTP(r, secret, in.Code, in.Password); err != nil {
		return err
	}
	codes, err := s.newRecoveryCodes(r.Context(), uid(r))
	if err != nil {
		return err
	}
	s.audit2(r, uid(r), "auth.totp_recovery_regenerated", nil)
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, 200, map[string]any{"recovery_codes": codes})
	return nil
}

// POST /v1/me/2fa/totp/disable {code | password} — matikan autentikator (kode cadangan juga diterima).
func (s *Server) totpDisable(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Code     string `json:"code"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	secret := s.totpSecret(r, uid(r))
	if secret == "" {
		httpx.JSON(w, 200, map[string]any{"totp": false})
		return nil
	}
	if err := s.reauthTOTP(r, secret, in.Code, in.Password); err != nil {
		return err
	}
	if err := s.Store.ClearTOTP(r.Context(), uid(r)); err != nil {
		return err
	}
	s.audit2(r, uid(r), "auth.totp_disabled", nil)
	httpx.JSON(w, 200, map[string]any{"totp": false})
	return nil
}

// POST /v1/admin/users/{id}/2fa/reset — matikan autentikator pengguna yang kehilangan ponsel & kode cadangan.
// Hanya untuk peran berizin users.ban (admin/support), tidak untuk akun sendiri; pemilik akun diberi tahu lewat email.
func (s *Server) resetUserTOTP(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "users.ban"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if err := s.guardTarget(r, id); err != nil {
		return err
	}
	u, err := s.Store.UserByID(r.Context(), id)
	if err != nil {
		return err
	}
	if err := s.Store.ClearTOTP(r.Context(), id); err != nil {
		return err
	}
	// Keluarkan semua sesi: bila reset ini hasil penipuan, penyerang tidak ikut mewarisi sesi lama, dan pemilik
	// akun yang sah langsung tahu karena harus masuk ulang.
	_ = s.Store.RevokeUserTokens(r.Context(), id)
	s.audit(r, "users.2fa_reset", id, nil)
	if s.Mail != nil {
		s.notifyTOTPReset(r.Context(), u)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) notifyTOTPReset(ctx context.Context, u store.User) {
	name := u.FullName
	if name == "" {
		name = "Pengguna OceanBird"
	}
	text := "Halo " + name + ",\n\nTim OceanBird baru saja mematikan aplikasi autentikator (verifikasi 2 langkah) di akun kamu atas permintaan pemulihan akun. Semua sesi juga sudah dikeluarkan.\n\n" +
		"Jika kamu TIDAK meminta ini, segera ganti kata sandi lewat \"Lupa kata sandi\" dan hubungi kami di " + s.Cfg.SiteURL + "/bantuan.\n\n" +
		"Setelah masuk, aktifkan lagi aplikasi autentikator di Pengaturan › Verifikasi 2 langkah.\n\nOceanBird"
	html := "<p>Halo " + htmlEsc(name) + ",</p><p>Tim OceanBird baru saja <b>mematikan aplikasi autentikator</b> (verifikasi 2 langkah) di akun kamu atas permintaan pemulihan akun. Semua sesi juga sudah dikeluarkan.</p>" +
		`<p>Jika kamu <b>tidak</b> meminta ini, segera ganti kata sandi lewat "Lupa kata sandi" dan <a href="` + s.Cfg.SiteURL + `/bantuan">hubungi kami</a>.</p>` +
		"<p>Setelah masuk, aktifkan lagi aplikasi autentikator di Pengaturan › Verifikasi 2 langkah.</p><p>OceanBird</p>"
	if err := s.Mail.SendMessage(ctx, u.Email, "Verifikasi 2 langkah akun OceanBird kamu direset", text, html); err != nil {
		s.Log.Warn("email reset 2FA gagal", "err", err)
	}
}
