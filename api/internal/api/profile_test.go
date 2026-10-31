package api

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

func (f *fake) Profile(_ context.Context, id string) (store.Profile, error) {
	u, _ := f.UserByID(context.Background(), id)
	return store.Profile{User: u, Preferences: json.RawMessage(`{}`), Topics: []store.Tag{}}, nil
}
func (f *fake) UpdateProfile(_ context.Context, id string, in store.ProfileUpdate) error {
	for k, u := range f.users {
		if u.ID == id && in.FullName != nil {
			u.FullName = *in.FullName
			f.users[k] = u
		}
	}
	return nil
}
func (f *fake) Sessions(_ context.Context, id string) ([]store.Session, error) {
	var out []store.Session
	for h, uid := range f.tokens {
		if uid == id {
			out = append(out, store.Session{ID: "s-" + h[:4], Hash: []byte(h), CreatedAt: time.Now()})
		}
	}
	return out, nil
}

func TestValidPrefs(t *testing.T) {
	ok := []string{`{"breaking":true,"theme":"dark","quiet_hours":"22-06"}`, `{}`, ``}
	for _, s := range ok {
		if _, err := validPrefs(json.RawMessage(s)); err != nil {
			t.Errorf("%s: %v", s, err)
		}
	}
	bad := []string{`{"hack":true}`, `{"breaking":"ya"}`, `{"theme":"neon"}`, `[1]`}
	for _, s := range bad {
		if _, err := validPrefs(json.RawMessage(s)); err == nil {
			t.Errorf("%s harus ditolak", s)
		}
	}
}

func TestProfileUpdateAndPassword(t *testing.T) {
	s, h := newTest(t)
	f := s.Store.(*fake)
	do(h, "POST", "/v1/auth/register", `{"email":"p@example.com","password":"Sandi-lama1","full_name":"Pengguna"}`)
	ver := do(h, "POST", "/v1/auth/verify", `{"email":"p@example.com","code":"123456"}`)
	var tr TokenResponse
	_ = json.Unmarshal(ver.Body.Bytes(), &tr)
	bearer := "Bearer " + tr.AccessToken
	if w := do(h, "PATCH", "/v1/me", `{"full_name":"A","phone":"123"}`, "Authorization", bearer); w.Code != 422 || !strings.Contains(w.Body.String(), "phone") {
		t.Fatalf("validasi profil: %d %s", w.Code, w.Body)
	}
	if w := do(h, "PATCH", "/v1/me", `{"full_name":"Pengguna Baru","preferences":{"breaking":false}}`, "Authorization", bearer); w.Code != 200 || f.users["p@example.com"].FullName != "Pengguna Baru" {
		t.Fatalf("update profil: %d %s", w.Code, w.Body)
	}
	if w := do(h, "GET", "/v1/me/sessions", "", "Authorization", bearer, "X-Session-Hash", sessionHash("x")); w.Code != 200 {
		t.Fatalf("sesi: %d", w.Code)
	}
	if w := do(h, "POST", "/v1/me/password", `{"current_password":"salah","new_password":"Sandi-baru2"}`, "Authorization", bearer); w.Code != 422 {
		t.Fatalf("sandi lama salah: %d", w.Code)
	}
	w := do(h, "POST", "/v1/me/password", `{"current_password":"Sandi-lama1","new_password":"Sandi-baru2"}`, "Authorization", bearer)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "refresh_token") {
		t.Fatalf("ganti sandi: %d %s", w.Code, w.Body)
	}
	if r := do(h, "POST", "/v1/auth/refresh", `{"refresh_token":"`+tr.RefreshToken+`"}`); r.Code != 401 {
		t.Fatalf("sesi lama harus dicabut: %d", r.Code)
	}
	if l := do(h, "POST", "/v1/auth/login", `{"email":"p@example.com","password":"Sandi-baru2"}`); l.Code != 200 {
		t.Fatalf("masuk dengan sandi baru: %d", l.Code)
	}
}
