package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// Verifikasi 2 langkah staf: kata sandi benar → kode dikirim ke email staf → kode + "challenge"
// (bukti kata sandi sudah benar, berlaku 10 menit) → sesi. Perangkat bisa ditandai tepercaya 30 hari.

const twoFactorType = "https://oceanpedia.id/problems/two-factor-required"

// signToken membuat token bertanda tangan HMAC: tujuan.uid.kedaluwarsa.tanda.
func (s *Server) signToken(purpose, uid string, ttl time.Duration) string {
	exp := strconv.FormatInt(s.Now().Add(ttl).Unix(), 10)
	body := purpose + "." + uid + "." + exp
	m := hmac.New(sha256.New, s.Cfg.JWTSecret)
	m.Write([]byte(body))
	return body + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

func (s *Server) checkToken(tok, purpose, uid string) bool {
	parts := strings.Split(tok, ".")
	if len(parts) != 4 || parts[0] != purpose || parts[1] != uid {
		return false
	}
	exp, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || s.Now().Unix() > exp {
		return false
	}
	m := hmac.New(sha256.New, s.Cfg.JWTSecret)
	m.Write([]byte(strings.Join(parts[:3], ".")))
	want := base64.RawURLEncoding.EncodeToString(m.Sum(nil))
	return hmac.Equal([]byte(want), []byte(parts[3]))
}

// needsTwoFactor: staf (peran berizin panel) dengan two_factor aktif, kecuali perangkat tepercaya.
func (s *Server) needsTwoFactor(r *http.Request, u store.User, device string) (bool, error) {
	if !u.TwoFactor {
		return false, nil
	}
	a, err := s.Store.UserAccess(r.Context(), u.ID)
	if err != nil {
		return false, err
	}
	if a.Blocked {
		return false, nil
	}
	if !a.IsStaff {
		// Pembaca: hanya bila diaktifkan sendiri di Pengaturan › Verifikasi 2 langkah.
		on, err := s.Store.Reader2FA(r.Context(), u.ID)
		if err != nil || !on {
			return false, err
		}
	}
	return !(device != "" && s.checkToken(device, "td", u.ID)), nil
}

// startTwoFactor mengirim kode ke email staf dan mengembalikan 403 berisi challenge.
func (s *Server) startTwoFactor(r *http.Request, u store.User) error {
	if err := s.sendOTP(r.Context(), u.Email); err != nil {
		return &httpx.Problem{Type: "about:blank", Title: "Gagal mengirim kode", Status: 503, Detail: "Kode verifikasi 2 langkah belum bisa dikirim. Coba lagi sebentar lagi."}
	}
	s.audit2(r, u.ID, "auth.2fa_challenge", nil)
	return &httpx.Problem{
		Type:   twoFactorType,
		Title:  "Verifikasi 2 langkah",
		Status: http.StatusForbidden,
		Detail: "Kode verifikasi dikirim ke " + maskEmail(u.Email) + ".",
		Errors: map[string]string{"email": u.Email, "challenge": s.signToken("2fa", u.ID, 10*time.Minute), "masked_email": maskEmail(u.Email)},
	}
}

// audit2 mencatat log aktivitas untuk pengguna yang belum punya sesi.
func (s *Server) audit2(r *http.Request, uid, action string, data map[string]any) {
	if data == nil {
		data = map[string]any{}
	}
	data["_ip"] = httpx.ClientIP(r)
	ua := r.UserAgent()
	if len(ua) > 300 {
		ua = ua[:300]
	}
	data["_ua"] = ua
	if err := s.Store.Audit(r.Context(), uid, action, "auth", uid, data); err != nil {
		s.Log.Warn("audit gagal", "action", action, "err", err)
	}
}

type deviceKey struct{}

func withDevice(r *http.Request, tok string) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), deviceKey{}, tok))
}

func deviceFrom(r *http.Request) string {
	v, _ := r.Context().Value(deviceKey{}).(string)
	return v
}
