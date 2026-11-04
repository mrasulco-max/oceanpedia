package api

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/mrasulco-max/oceanpedia/api/internal/auth"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

type fake2FA struct{ *fake }

func (f *fake2FA) Audit(context.Context, string, string, string, string, any) error { return nil }

func TestStaffTwoFactor(t *testing.T) {
	s, _ := newTest(t)
	f := s.Store.(*fake)
	hash, _ := auth.HashPassword("Sandi-rahasia1")
	f.users["ed@example.com"] = store.User{ID: "ed-1", Email: "ed@example.com", FullName: "Editor", Role: "editor", PasswordHash: hash, EmailVerified: true, TwoFactor: true}
	f.users["rd@example.com"] = store.User{ID: "rd-1", Email: "rd@example.com", FullName: "Pembaca", Role: "reader", PasswordHash: hash, EmailVerified: true, TwoFactor: true}
	s.Store = &fake2FA{f}
	h := s.Handler()

	// Pembaca: langsung masuk.
	if w := do(h, "POST", "/v1/auth/login", `{"email":"rd@example.com","password":"Sandi-rahasia1"}`); w.Code != 200 {
		t.Fatalf("pembaca: %d %s", w.Code, w.Body)
	}
	// Staf: 403 + challenge; kode dikirim.
	w := do(h, "POST", "/v1/auth/login", `{"email":"ed@example.com","password":"Sandi-rahasia1"}`)
	if w.Code != 403 || !strings.Contains(w.Body.String(), "two-factor-required") {
		t.Fatalf("staf: %d %s", w.Code, w.Body)
	}
	var p struct{ Errors map[string]string }
	_ = json.Unmarshal(w.Body.Bytes(), &p)
	ch := p.Errors["challenge"]
	// Kode email saja tanpa challenge ditolak.
	if w := do(h, "POST", "/v1/auth/verify", `{"email":"ed@example.com","code":"123456"}`); w.Code != 403 {
		t.Fatalf("tanpa challenge: %d", w.Code)
	}
	// Challenge + kode benar → masuk, dengan perangkat tepercaya.
	w = do(h, "POST", "/v1/auth/verify", `{"email":"ed@example.com","code":"123456","remember":true,"challenge":"`+ch+`"}`)
	if w.Code != 200 {
		t.Fatalf("verifikasi: %d %s", w.Code, w.Body)
	}
	var tok TokenResponse
	_ = json.Unmarshal(w.Body.Bytes(), &tok)
	if tok.DeviceToken == "" {
		t.Fatal("device token kosong")
	}
	// Perangkat tepercaya: masuk tanpa kode.
	if w := do(h, "POST", "/v1/auth/login", `{"email":"ed@example.com","password":"Sandi-rahasia1","device":"`+tok.DeviceToken+`"}`); w.Code != 200 {
		t.Fatalf("perangkat tepercaya: %d %s", w.Code, w.Body)
	}
	// Token milik pengguna lain / tujuan lain tidak berlaku.
	if s.checkToken(tok.DeviceToken, "td", "rd-1") || s.checkToken(ch, "td", "ed-1") {
		t.Fatal("token lintas tujuan diterima")
	}
}

// Reader2FA: pembaca di uji tidak mengaktifkan verifikasi 2 langkah.
func (f *fake) Reader2FA(context.Context, string) (bool, error) { return false, nil }

// Autentikator: disimpan di peta uji (terenkripsi seperti di produksi).
var fakeTOTP = map[string]map[string]string{}

func (f *fake) TOTP(_ context.Context, uid string) (string, string, error) {
	m := fakeTOTP[uid]
	return m["totp_secret"], m["totp_pending"], nil
}

func (f *fake) SetTOTP(_ context.Context, uid, key, value string) error {
	if fakeTOTP[uid] == nil {
		fakeTOTP[uid] = map[string]string{}
	}
	if value == "" {
		delete(fakeTOTP[uid], key)
	} else {
		fakeTOTP[uid][key] = value
	}
	return nil
}

func TestReaderTOTP(t *testing.T) {
	s, _ := newTest(t)
	f := s.Store.(*fake)
	hash, _ := auth.HashPassword("Sandi-rahasia1")
	f.users["totp@example.com"] = store.User{ID: "tp-1", Email: "totp@example.com", FullName: "Pembaca TOTP", Role: "reader", PasswordHash: hash, EmailVerified: true, TwoFactor: true}
	s.Store = &fake2FA{f}
	h := s.Handler()
	login := func() *TokenResponse {
		w := do(h, "POST", "/v1/auth/login", `{"email":"totp@example.com","password":"Sandi-rahasia1"}`)
		if w.Code != 200 {
			return nil
		}
		var tok TokenResponse
		_ = json.Unmarshal(w.Body.Bytes(), &tok)
		return &tok
	}
	tok := login()
	if tok == nil {
		t.Fatal("login awal gagal")
	}
	bearer := "Bearer " + tok.AccessToken
	w := do(h, "POST", "/v1/me/2fa/totp/setup", `{}`, "Authorization", bearer)
	if w.Code != 200 {
		t.Fatalf("setup: %d %s", w.Code, w.Body)
	}
	var st struct{ Secret, URI string }
	_ = json.Unmarshal(w.Body.Bytes(), &st)
	if !strings.HasPrefix(st.URI, "otpauth://totp/") || st.Secret == "" {
		t.Fatalf("uri: %+v", st)
	}
	if w := do(h, "POST", "/v1/me/2fa/totp/enable", `{"code":"000000"}`, "Authorization", bearer); w.Code != 422 {
		t.Fatalf("kode salah harus 422: %d", w.Code)
	}
	code, _ := auth.TOTPCode(st.Secret, s.Now())
	if w := do(h, "POST", "/v1/me/2fa/totp/enable", `{"code":"`+code+`"}`, "Authorization", bearer); w.Code != 200 {
		t.Fatalf("aktifkan: %d %s", w.Code, w.Body)
	}
	if strings.Contains(fakeTOTP["tp-1"]["totp_secret"], st.Secret) {
		t.Fatal("rahasia harus tersimpan terenkripsi")
	}
	// Masuk sekarang meminta kode autentikator (tanpa email).
	w = do(h, "POST", "/v1/auth/login", `{"email":"totp@example.com","password":"Sandi-rahasia1"}`)
	if w.Code != 403 || !strings.Contains(w.Body.String(), `"method":"totp"`) {
		t.Fatalf("login TOTP: %d %s", w.Code, w.Body)
	}
	var p struct{ Errors map[string]string }
	_ = json.Unmarshal(w.Body.Bytes(), &p)
	if w := do(h, "POST", "/v1/auth/verify", `{"email":"totp@example.com","code":"111111","challenge":"`+p.Errors["challenge"]+`"}`); w.Code != 422 {
		t.Fatalf("kode TOTP salah: %d", w.Code)
	}
	code, _ = auth.TOTPCode(st.Secret, s.Now())
	if w := do(h, "POST", "/v1/auth/verify", `{"email":"totp@example.com","code":"`+code+`","challenge":"`+p.Errors["challenge"]+`"}`); w.Code != 200 {
		t.Fatalf("verifikasi TOTP: %d %s", w.Code, w.Body)
	}
	// Matikan dengan kata sandi.
	if w := do(h, "POST", "/v1/me/2fa/totp/disable", `{"password":"Sandi-rahasia1"}`, "Authorization", bearer); w.Code != 200 {
		t.Fatalf("matikan: %d %s", w.Code, w.Body)
	}
	if login() == nil {
		t.Fatal("setelah dimatikan, masuk tanpa kode")
	}
}
