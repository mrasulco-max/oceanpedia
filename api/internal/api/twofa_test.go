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
