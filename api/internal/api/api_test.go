package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/auth"
	"github.com/mrasulco-max/oceanpedia/api/internal/config"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/market"
	"github.com/mrasulco-max/oceanpedia/api/internal/otp"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// fake mengimplementasikan sebagian Store untuk uji handler.
type fake struct {
	store.Store
	users  map[string]store.User
	tokens map[string]string
}

func (f *fake) Ping(context.Context) error { return nil }
func (f *fake) Categories(context.Context) ([]store.Category, error) {
	return []store.Category{{Slug: "saham", Name: "Saham", ArticleCount: 1}}, nil
}
func (f *fake) ArticleBySlug(_ context.Context, slug string) (store.Article, error) {
	if slug != "premium" {
		return store.Article{}, httpx.ErrNotFound
	}
	sum := "ringkasan"
	return store.Article{ArticleCard: store.ArticleCard{Slug: slug, IsPremium: true}, Body: "paragraf satu\n\nparagraf dua", AISummary: &sum}, nil
}
func (f *fake) CreateUser(_ context.Context, email, name, hash, phone string) (store.User, error) {
	if _, ok := f.users[email]; ok {
		return store.User{}, store.ErrDuplicate
	}
	u := store.User{ID: "u-" + email, Email: email, FullName: name, Role: "reader", PasswordHash: hash}
	if phone != "" {
		u.Phone = &phone
	}
	f.users[email] = u
	return u, nil
}
func (f *fake) UpdatePendingUser(_ context.Context, id, name, hash, _ string) (store.User, error) {
	for k, u := range f.users {
		if u.ID == id {
			u.FullName, u.PasswordHash = name, hash
			f.users[k] = u
			return u, nil
		}
	}
	return store.User{}, httpx.ErrNotFound
}
func (f *fake) MarkEmailVerified(_ context.Context, id string) error {
	for k, u := range f.users {
		if u.ID == id {
			u.EmailVerified = true
			f.users[k] = u
		}
	}
	return nil
}
func (f *fake) SetPassword(_ context.Context, id, hash string) error {
	for k, u := range f.users {
		if u.ID == id {
			u.PasswordHash = hash
			f.users[k] = u
		}
	}
	return nil
}
func (f *fake) RevokeUserTokens(_ context.Context, id string) error {
	for k, v := range f.tokens {
		if v == id {
			delete(f.tokens, k)
		}
	}
	return nil
}

// fakeOTP: kode yang benar "123456"; mencatat email yang dikirimi kode.
type fakeOTP struct{ sent []string }

func (o *fakeOTP) Send(_ context.Context, email string) error {
	o.sent = append(o.sent, email)
	return nil
}
func (o *fakeOTP) Check(_ context.Context, _, code string) (otp.Result, error) {
	if code == "123456" {
		return otp.Result{OK: true}, nil
	}
	n := 2
	return otp.Result{Reason: "incorrect_code", Remaining: &n}, nil
}
func (f *fake) UserByEmail(_ context.Context, email string) (store.User, error) {
	u, ok := f.users[email]
	if !ok {
		return u, httpx.ErrNotFound
	}
	return u, nil
}
func (f *fake) UserByID(_ context.Context, id string) (store.User, error) {
	for _, u := range f.users {
		if u.ID == id {
			return u, nil
		}
	}
	return store.User{}, httpx.ErrNotFound
}
func (f *fake) SaveRefreshToken(_ context.Context, uid string, h []byte, _, _ string, _ time.Time) error {
	f.tokens[string(h)] = uid
	return nil
}
func (f *fake) ConsumeRefreshToken(_ context.Context, h []byte) (string, error) {
	id, ok := f.tokens[string(h)]
	if !ok {
		return "", httpx.ErrNotFound
	}
	delete(f.tokens, string(h))
	return id, nil
}

func newTest(t *testing.T) (*Server, http.Handler) {
	t.Helper()
	s := &Server{
		Store:  &fake{users: map[string]store.User{}, tokens: map[string]string{}},
		Market: market.Sample{},
		OTP:    &fakeOTP{},
		Cfg:    config.Config{Env: "development", JWTSecret: []byte(strings.Repeat("s", 32)), AccessTokenTTL: time.Minute, RefreshTokenTTL: time.Hour, RateLimitRPS: 1000, TaxRate: 0.11},
		Log:    slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	return s, s.Handler()
}

func do(h http.Handler, method, path, body string, hdr ...string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	for i := 0; i+1 < len(hdr); i += 2 {
		r.Header.Set(hdr[i], hdr[i+1])
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestHealthAndHeaders(t *testing.T) {
	_, h := newTest(t)
	w := do(h, "GET", "/healthz", "")
	if w.Code != 200 || w.Header().Get("X-Content-Type-Options") != "nosniff" || w.Header().Get("X-Request-ID") == "" {
		t.Fatalf("%d %v", w.Code, w.Header())
	}
}

func TestNotFoundIsProblemJSON(t *testing.T) {
	_, h := newTest(t)
	w := do(h, "GET", "/v1/articles/tidak-ada", "")
	if w.Code != 404 || w.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("%d %s", w.Code, w.Header().Get("Content-Type"))
	}
	var p httpx.Problem
	_ = json.Unmarshal(w.Body.Bytes(), &p)
	if p.Status != 404 || p.Instance != "/v1/articles/tidak-ada" {
		t.Fatalf("%+v", p)
	}
}

func TestPremiumArticleLockedForFreeUser(t *testing.T) {
	s, h := newTest(t)
	var a store.Article
	_ = json.Unmarshal(do(h, "GET", "/v1/articles/premium", "").Body.Bytes(), &a)
	if !a.Locked || a.Body != "paragraf satu" || a.AISummary != nil {
		t.Fatalf("anonim seharusnya terkunci: %+v", a)
	}
	tok, _ := auth.Sign(s.Cfg.JWTSecret, auth.Claims{Sub: "u1", Role: "reader", Plan: "essential"}, time.Minute, time.Now())
	a = store.Article{}
	_ = json.Unmarshal(do(h, "GET", "/v1/articles/premium", "", "Authorization", "Bearer "+tok).Body.Bytes(), &a)
	if a.Locked || !strings.Contains(a.Body, "paragraf dua") || a.AISummary == nil {
		t.Fatalf("pelanggan seharusnya terbuka: %+v", a)
	}
}

func TestRegisterLoginRefresh(t *testing.T) {
	s, h := newTest(t)
	bad := do(h, "POST", "/v1/auth/register", `{"email":"bukan-email","password":"123","full_name":"A","phone":"12"}`)
	if bad.Code != 422 || !bytes.Contains(bad.Body.Bytes(), []byte(`"password"`)) || !bytes.Contains(bad.Body.Bytes(), []byte(`"phone"`)) {
		t.Fatalf("validasi: %d %s", bad.Code, bad.Body)
	}
	if weak := do(h, "POST", "/v1/auth/register", `{"email":"a@b.co","password":"sandirahasia","full_name":"Nadia"}`); weak.Code != 422 {
		t.Fatalf("sandi tanpa angka/huruf besar harus ditolak: %d", weak.Code)
	}
	reg := do(h, "POST", "/v1/auth/register", `{"email":"Nadia@Example.com","password":"Sandi-rahasia1","full_name":"Nadia Putri","phone":"0812 3456 7890"}`)
	if reg.Code != 202 || !strings.Contains(reg.Body.String(), `"verification_required"`) || strings.Contains(reg.Body.String(), "access_token") {
		t.Fatalf("register harus meminta OTP tanpa token: %d %s", reg.Code, reg.Body)
	}
	if u := s.Store.(*fake).users["nadia@example.com"]; u.Phone == nil || *u.Phone != "+6281234567890" || u.EmailVerified {
		t.Fatalf("data akun: %+v", u)
	}
	if o := s.OTP.(*fakeOTP); len(o.sent) != 1 || o.sent[0] != "nadia@example.com" {
		t.Fatalf("OTP tidak terkirim: %+v", o.sent)
	}
	// Belum konfirmasi OTP → login ditolak (403) dan kode dikirim lagi.
	pending := do(h, "POST", "/v1/auth/login", `{"email":"nadia@example.com","password":"Sandi-rahasia1"}`)
	if pending.Code != 403 || !strings.Contains(pending.Body.String(), "verification-required") {
		t.Fatalf("login akun belum terverifikasi: %d %s", pending.Code, pending.Body)
	}
	// Daftar ulang sebelum konfirmasi: diperbolehkan (kirim kode baru), bukan duplikat.
	if again := do(h, "POST", "/v1/auth/register", `{"email":"nadia@example.com","password":"Sandi-rahasia1","full_name":"Nadia P"}`); again.Code != 202 {
		t.Fatalf("daftar ulang: %d", again.Code)
	}
	if wrongCode := do(h, "POST", "/v1/auth/verify", `{"email":"nadia@example.com","code":"000000"}`); wrongCode.Code != 422 || !strings.Contains(wrongCode.Body.String(), "Sisa 2") {
		t.Fatalf("kode salah: %d %s", wrongCode.Code, wrongCode.Body)
	}
	ver := do(h, "POST", "/v1/auth/verify", `{"email":"nadia@example.com","code":"123456"}`)
	if ver.Code != 200 || !strings.Contains(ver.Body.String(), "access_token") {
		t.Fatalf("verifikasi: %d %s", ver.Code, ver.Body)
	}
	if dup := do(h, "POST", "/v1/auth/register", `{"email":"nadia@example.com","password":"Sandi-rahasia1","full_name":"Nadia"}`); dup.Code != 409 {
		t.Fatalf("duplikat setelah terverifikasi: %d", dup.Code)
	}
	if wrong := do(h, "POST", "/v1/auth/login", `{"email":"nadia@example.com","password":"salah-sandi"}`); wrong.Code != 401 {
		t.Fatalf("login salah: %d", wrong.Code)
	}
	// Akun terverifikasi: masuk langsung tanpa OTP.
	sentBefore := len(s.OTP.(*fakeOTP).sent)
	login := do(h, "POST", "/v1/auth/login", `{"email":"nadia@example.com","password":"Sandi-rahasia1"}`)
	var tr TokenResponse
	_ = json.Unmarshal(login.Body.Bytes(), &tr)
	if login.Code != 200 || tr.AccessToken == "" || tr.TokenType != "Bearer" || tr.User.PasswordHash != "" || !tr.User.EmailVerified {
		t.Fatalf("login: %d %s", login.Code, login.Body)
	}
	if len(s.OTP.(*fakeOTP).sent) != sentBefore {
		t.Fatal("akun terverifikasi tidak boleh dikirimi OTP saat masuk")
	}
	if strings.Contains(login.Body.String(), "pbkdf2") {
		t.Fatal("hash kata sandi bocor di respons")
	}
	me := do(h, "GET", "/v1/me", "", "Authorization", "Bearer "+tr.AccessToken)
	if me.Code != 200 {
		t.Fatalf("me: %d %s", me.Code, me.Body)
	}
	r1 := do(h, "POST", "/v1/auth/refresh", `{"refresh_token":"`+tr.RefreshToken+`"}`)
	r2 := do(h, "POST", "/v1/auth/refresh", `{"refresh_token":"`+tr.RefreshToken+`"}`)
	if r1.Code != 200 || r2.Code != 401 {
		t.Fatalf("rotasi refresh token: %d %d", r1.Code, r2.Code)
	}
	// Lupa kata sandi: kirim kode (email tak terdaftar tetap 202), lalu atur sandi baru.
	if w := do(h, "POST", "/v1/auth/otp", `{"email":"tidak-ada@example.com"}`); w.Code != 202 {
		t.Fatalf("otp email tak terdaftar: %d", w.Code)
	}
	if w := do(h, "POST", "/v1/auth/otp", `{"email":"nadia@example.com"}`); w.Code != 202 {
		t.Fatalf("otp: %d", w.Code)
	}
	if w := do(h, "POST", "/v1/auth/password/reset", `{"email":"nadia@example.com","code":"123456","password":"lemah"}`); w.Code != 422 {
		t.Fatalf("sandi lemah: %d", w.Code)
	}
	if w := do(h, "POST", "/v1/auth/password/reset", `{"email":"nadia@example.com","code":"123456","password":"Baru-sekali9"}`); w.Code != 200 {
		t.Fatalf("reset: %d %s", w.Code, w.Body)
	}
	if w := do(h, "POST", "/v1/auth/login", `{"email":"nadia@example.com","password":"Baru-sekali9"}`); w.Code != 200 {
		t.Fatalf("login sandi baru: %d", w.Code)
	}
}

func TestNormalizePhoneMask(t *testing.T) {
	for in, want := range map[string]string{"0812 3456 7890": "+6281234567890", "812-3456-7890": "+6281234567890", "+62 812 3456 789": "+628123456789", "": ""} {
		if got, ok := normalizePhone(in); !ok || got != want {
			t.Errorf("%q → %q %v", in, got, ok)
		}
	}
	if _, ok := normalizePhone("021 555"); ok {
		t.Error("nomor bukan HP harus ditolak")
	}
	if maskEmail("nadia.putri@email.com") != "na*********@email.com" {
		t.Error(maskEmail("nadia.putri@email.com"))
	}
}

func TestAuthRequired(t *testing.T) {
	_, h := newTest(t)
	if w := do(h, "GET", "/v1/me/watchlist", ""); w.Code != 401 {
		t.Fatalf("%d", w.Code)
	}
	if w := do(h, "GET", "/v1/me", "", "Authorization", "Bearer abc.def.ghi"); w.Code != 401 {
		t.Fatalf("token palsu: %d", w.Code)
	}
}

func TestQuoteInvoice(t *testing.T) {
	p := store.Plan{Code: "essential", PriceAmount: 59000, Currency: "IDR", MinSeats: 1}
	inv, err := Quote(p, 1, "PLUSBARU", 0.11)
	if err != nil || inv.Subtotal != 59000 || inv.Discount != 49100 || inv.TaxAmount != 1089 || inv.Total != 10989 {
		t.Fatalf("%v %+v", err, inv)
	}
	inv, _ = Quote(p, 1, "", 0.11)
	if inv.Total != 65490 {
		t.Fatalf("tanpa promo: %+v", inv)
	}
	corp := store.Plan{Code: "corporate", PriceAmount: 49000, Currency: "IDR", MinSeats: 5}
	inv, _ = Quote(corp, 2, "", 0.11)
	if inv.Subtotal != 245000 {
		t.Fatalf("minimal 5 kursi: %+v", inv)
	}
	if _, err := Quote(corp, 5, "PLUSBARU", 0.11); err == nil {
		t.Fatal("promo seharusnya tidak berlaku untuk corporate")
	}
}

func TestCORS(t *testing.T) {
	s, _ := newTest(t)
	s.Cfg.CORSOrigins = []string{"https://oceanpedia.id"}
	h := s.Handler()
	w := do(h, "OPTIONS", "/v1/categories", "", "Origin", "https://oceanpedia.id")
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "https://oceanpedia.id" {
		t.Fatalf("%d %v", w.Code, w.Header())
	}
	if w := do(h, "GET", "/v1/categories", "", "Origin", "https://jahat.example"); w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("origin asing tidak boleh diizinkan")
	}
}

func TestQuotesUnknownSymbolParam(t *testing.T) {
	_, h := newTest(t)
	if w := do(h, "GET", "/v1/market/quotes", ""); w.Code != 400 {
		t.Fatalf("%d", w.Code)
	}
}
