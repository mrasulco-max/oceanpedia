package api

import (
	"net/http"
	"strings"

	"github.com/mrasulco-max/oceanpedia/api/internal/auth"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
)

// ======================================================================= verifikasi 2 langkah: aplikasi autentikator (TOTP)

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

// GET /v1/me/2fa — metode verifikasi 2 langkah yang aktif.
func (s *Server) twoFAStatus(w http.ResponseWriter, r *http.Request) error {
	email, _ := s.Store.Reader2FA(r.Context(), uid(r))
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, 200, map[string]any{"email": email, "totp": s.totpSecret(r, uid(r)) != ""})
	return nil
}

// POST /v1/me/2fa/totp/setup — buat rahasia baru (belum aktif sampai dikonfirmasi dengan kode).
func (s *Server) totpSetup(w http.ResponseWriter, r *http.Request) error {
	u, err := s.Store.UserByID(r.Context(), uid(r))
	if err != nil {
		return err
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

// POST /v1/me/2fa/totp/enable {code} — aktifkan setelah kode dari aplikasi cocok.
func (s *Server) totpEnable(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Code string `json:"code"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	_, pending, err := s.Store.TOTP(r.Context(), uid(r))
	if err != nil {
		return err
	}
	if pending == "" {
		return httpx.Validation(map[string]string{"code": "Mulai penyiapan aplikasi autentikator terlebih dahulu."})
	}
	secret, err := auth.OpenTOTP(s.Cfg.JWTSecret, pending)
	if err != nil || !auth.VerifyTOTP(secret, in.Code, s.Now()) {
		return httpx.Validation(map[string]string{"code": "Kode tidak cocok. Pastikan jam ponsel akurat lalu coba kode terbaru."})
	}
	if err := s.Store.SetTOTP(r.Context(), uid(r), "totp_secret", pending); err != nil {
		return err
	}
	_ = s.Store.SetTOTP(r.Context(), uid(r), "totp_pending", "")
	s.audit2(r, uid(r), "auth.totp_enabled", nil)
	httpx.JSON(w, 200, map[string]any{"totp": true})
	return nil
}

// POST /v1/me/2fa/totp/disable {code | password} — matikan autentikator.
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
	ok := strings.TrimSpace(in.Code) != "" && auth.VerifyTOTP(secret, in.Code, s.Now())
	if !ok && in.Password != "" {
		if u, err := s.Store.UserByID(r.Context(), uid(r)); err == nil && u.PasswordHash != "" {
			ok = auth.CheckPassword(u.PasswordHash, in.Password)
		}
	}
	if !ok {
		return httpx.Validation(map[string]string{"code": "Masukkan kode dari aplikasi autentikator (atau kata sandi) untuk mematikan."})
	}
	if err := s.Store.SetTOTP(r.Context(), uid(r), "totp_secret", ""); err != nil {
		return err
	}
	s.audit2(r, uid(r), "auth.totp_disabled", nil)
	httpx.JSON(w, 200, map[string]any{"totp": false})
	return nil
}
