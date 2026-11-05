package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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

// Status pendukung autentikator di peta uji, meniru kueri atomik di store/totp.go.
func (f *fake) ClearTOTP(_ context.Context, uid string) error {
	delete(fakeTOTP, uid)
	delete(fakeTOTPStep, uid)
	return nil
}

var fakeTOTPStep = map[string]int64{}

func (f *fake) UseTOTPStep(_ context.Context, uid string, step int64) (bool, error) {
	if last, ok := fakeTOTPStep[uid]; ok && last >= step {
		return false, nil
	}
	fakeTOTPStep[uid] = step
	return true, nil
}

func (f *fake) TOTPAttempt(_ context.Context, uid string, now, window int64) (int, error) {
	m := fakeTOTP[uid]
	if m == nil {
		m = map[string]string{}
		fakeTOTP[uid] = m
	}
	var t0, n int64
	if v := m["totp_fail"]; v != "" {
		_, _ = fmt.Sscanf(v, "%d:%d", &t0, &n)
	}
	if t0 > now-window {
		n++
	} else {
		t0, n = now, 1
	}
	m["totp_fail"] = fmt.Sprintf("%d:%d", t0, n)
	return int(n), nil
}

func (f *fake) TOTPRecovery(_ context.Context, uid string) ([]string, error) {
	out := []string{}
	for _, h := range strings.Split(fakeTOTP[uid]["totp_recovery"], ",") {
		if h != "" {
			out = append(out, h)
		}
	}
	return out, nil
}

func (f *fake) UseRecoveryCode(ctx context.Context, uid, hash string) (int, bool, error) {
	l, _ := f.TOTPRecovery(ctx, uid)
	for i, h := range l {
		if h == hash {
			l = append(l[:i], l[i+1:]...)
			fakeTOTP[uid]["totp_recovery"] = strings.Join(l, ",")
			return len(l), true, nil
		}
	}
	return 0, false, nil
}

// totpFixture: pembaca dengan autentikator aktif dan jam uji yang bisa dimajukan.
type totpFixture struct {
	t        *testing.T
	s        *Server
	h        http.Handler
	now      time.Time
	secret   string
	recovery []string
	bearer   string
	email    string
}

func newTOTPFixture(t *testing.T, id, email string) *totpFixture {
	t.Helper()
	s, _ := newTest(t)
	fx := &totpFixture{t: t, s: s, now: time.Date(2026, 11, 5, 9, 0, 0, 0, time.UTC), email: email}
	s.Now = func() time.Time { return fx.now }
	f := s.Store.(*fake)
	hash, _ := auth.HashPassword("Sandi-rahasia1")
	f.users[email] = store.User{ID: id, Email: email, FullName: "Pembaca TOTP", Role: "reader", PasswordHash: hash, EmailVerified: true, TwoFactor: true}
	delete(fakeTOTP, id)
	delete(fakeTOTPStep, id)
	s.Store = &fake2FA{f}
	fx.h = s.Handler()
	tok := fx.login()
	if tok == nil {
		t.Fatal("login awal gagal")
	}
	fx.bearer = "Bearer " + tok.AccessToken
	w := fx.do("POST", "/v1/me/2fa/totp/setup", `{}`)
	if w.Code != 200 {
		t.Fatalf("setup: %d %s", w.Code, w.Body)
	}
	var st struct{ Secret, URI string }
	_ = json.Unmarshal(w.Body.Bytes(), &st)
	if !strings.HasPrefix(st.URI, "otpauth://totp/") || st.Secret == "" {
		t.Fatalf("uri: %+v", st)
	}
	fx.secret = st.Secret
	if w := fx.do("POST", "/v1/me/2fa/totp/enable", `{"code":"000000"}`); w.Code != 422 {
		t.Fatalf("kode salah harus 422: %d", w.Code)
	}
	w = fx.do("POST", "/v1/me/2fa/totp/enable", `{"code":"`+fx.code()+`"}`)
	if w.Code != 200 {
		t.Fatalf("aktifkan: %d %s", w.Code, w.Body)
	}
	var en struct {
		RecoveryCodes []string `json:"recovery_codes"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &en)
	if len(en.RecoveryCodes) != auth.RecoveryCount {
		t.Fatalf("kode cadangan: %v", en.RecoveryCodes)
	}
	fx.recovery = en.RecoveryCodes
	for _, c := range en.RecoveryCodes {
		if strings.Contains(fakeTOTP[id]["totp_recovery"], auth.NormalizeRecovery(c)) {
			t.Fatal("kode cadangan harus tersimpan sebagai hash")
		}
	}
	if strings.Contains(fakeTOTP[id]["totp_secret"], st.Secret) {
		t.Fatal("rahasia harus tersimpan terenkripsi")
	}
	return fx
}

func (fx *totpFixture) do(method, path, body string) *httptest.ResponseRecorder {
	return do(fx.h, method, path, body, "Authorization", fx.bearer)
}

func (fx *totpFixture) code() string {
	c, _ := auth.TOTPCode(fx.secret, fx.now)
	return c
}

// tick memajukan jam ke langkah TOTP berikutnya (kode baru di aplikasi).
func (fx *totpFixture) tick() { fx.now = fx.now.Add(30 * time.Second) }

func (fx *totpFixture) login() *TokenResponse {
	w := do(fx.h, "POST", "/v1/auth/login", `{"email":"`+fx.email+`","password":"Sandi-rahasia1"}`)
	if w.Code != 200 {
		return nil
	}
	var tok TokenResponse
	_ = json.Unmarshal(w.Body.Bytes(), &tok)
	return &tok
}

// challenge: langkah pertama (kata sandi) → 403 meminta kode autentikator.
func (fx *totpFixture) challenge() string {
	fx.t.Helper()
	w := do(fx.h, "POST", "/v1/auth/login", `{"email":"`+fx.email+`","password":"Sandi-rahasia1"}`)
	if w.Code != 403 || !strings.Contains(w.Body.String(), `"method":"totp"`) {
		fx.t.Fatalf("login TOTP: %d %s", w.Code, w.Body)
	}
	var p struct{ Errors map[string]string }
	_ = json.Unmarshal(w.Body.Bytes(), &p)
	return p.Errors["challenge"]
}

func (fx *totpFixture) verify(ch, code string) *httptest.ResponseRecorder {
	return do(fx.h, "POST", "/v1/auth/verify", `{"email":"`+fx.email+`","code":"`+code+`","challenge":"`+ch+`"}`)
}

func TestReaderTOTP(t *testing.T) {
	fx := newTOTPFixture(t, "tp-1", "totp@example.com")
	fx.tick()
	ch := fx.challenge()
	if w := fx.verify(ch, "111111"); w.Code != 422 {
		t.Fatalf("kode TOTP salah: %d", w.Code)
	}
	if w := fx.verify(ch, fx.code()); w.Code != 200 {
		t.Fatalf("verifikasi TOTP: %d %s", w.Code, w.Body)
	}
	if w := fx.do("GET", "/v1/me/2fa", ""); !strings.Contains(w.Body.String(), `"recovery_left":10`) {
		t.Fatalf("status 2FA: %s", w.Body)
	}
	// Matikan dengan kata sandi.
	if w := fx.do("POST", "/v1/me/2fa/totp/disable", `{"password":"Sandi-rahasia1"}`); w.Code != 200 {
		t.Fatalf("matikan: %d %s", w.Code, w.Body)
	}
	if len(fakeTOTP["tp-1"]) != 0 {
		t.Fatalf("status autentikator harus terhapus semua: %v", fakeTOTP["tp-1"])
	}
	if fx.login() == nil {
		t.Fatal("setelah dimatikan, masuk tanpa kode")
	}
}

// Kode TOTP yang sudah diterima tidak bisa dipakai lagi (termasuk kode yang dipakai untuk mengaktifkan).
func TestTOTPReplay(t *testing.T) {
	fx := newTOTPFixture(t, "tp-replay", "replay@example.com")
	ch := fx.challenge()
	if w := fx.verify(ch, fx.code()); w.Code != 422 || !strings.Contains(w.Body.String(), "sudah dipakai") {
		t.Fatalf("kode aktivasi dipakai ulang: %d %s", w.Code, w.Body)
	}
	fx.tick()
	code := fx.code()
	if w := fx.verify(ch, code); w.Code != 200 {
		t.Fatalf("kode baru: %d %s", w.Code, w.Body)
	}
	if w := fx.verify(fx.challenge(), code); w.Code != 422 {
		t.Fatalf("kode yang sama dipakai dua kali: %d %s", w.Code, w.Body)
	}
	// Kode dari langkah sebelumnya (masih dalam toleransi jam) juga ditolak setelah kode lebih baru dipakai.
	prev, _ := auth.TOTPCode(fx.secret, fx.now.Add(-30*time.Second))
	if w := fx.verify(fx.challenge(), prev); w.Code != 422 {
		t.Fatalf("kode lama diterima: %d", w.Code)
	}
}

// Maks. 5 percobaan per 15 menit per akun — berlaku walau masuk ulang untuk challenge baru, dan
// kode yang benar pun ditolak selama terkunci.
func TestTOTPAttemptLimit(t *testing.T) {
	fx := newTOTPFixture(t, "tp-limit", "limit@example.com")
	fx.tick()
	for i := 1; i <= 5; i++ {
		w := fx.verify(fx.challenge(), "111111")
		if w.Code != 422 {
			t.Fatalf("percobaan %d: %d %s", i, w.Code, w.Body)
		}
		if i == 4 && !strings.Contains(w.Body.String(), "Sisa 1 percobaan") {
			t.Fatalf("sisa percobaan: %s", w.Body)
		}
	}
	if w := fx.verify(fx.challenge(), fx.code()); w.Code != 429 {
		t.Fatalf("harus terkunci: %d %s", w.Code, w.Body)
	}
	if w := fx.verify(fx.challenge(), fx.recovery[0]); w.Code != 429 {
		t.Fatalf("kode cadangan juga terkunci: %d", w.Code)
	}
	// Kata sandi untuk mematikan autentikator ikut dibatasi (sesi curian tidak bisa menebak sandi).
	if w := fx.do("POST", "/v1/me/2fa/totp/disable", `{"password":"Sandi-rahasia1"}`); w.Code != 429 {
		t.Fatalf("matikan saat terkunci: %d", w.Code)
	}
	fx.now = fx.now.Add(16 * time.Minute)
	if w := fx.verify(fx.challenge(), fx.code()); w.Code != 200 {
		t.Fatalf("setelah jendela berakhir: %d %s", w.Code, w.Body)
	}
	// Berhasil masuk → penghitung direset.
	if fakeTOTP["tp-limit"]["totp_fail"] != "" {
		t.Fatalf("penghitung tidak direset: %q", fakeTOTP["tp-limit"]["totp_fail"])
	}
}

// Kode cadangan: masuk tanpa ponsel, sekali pakai, tidak peka huruf besar/kecil & tanda hubung,
// dan membuat kode baru membatalkan semua kode lama.
func TestTOTPRecoveryCodes(t *testing.T) {
	fx := newTOTPFixture(t, "tp-rc", "rc@example.com")
	rc := fx.recovery[0]
	typed := strings.ToLower(strings.ReplaceAll(rc, "-", " "))
	w := fx.verify(fx.challenge(), typed)
	if w.Code != 200 {
		t.Fatalf("masuk dengan kode cadangan: %d %s", w.Code, w.Body)
	}
	if w.Header().Get("X-Recovery-Codes-Left") != "9" {
		t.Fatalf("sisa kode: %q", w.Header().Get("X-Recovery-Codes-Left"))
	}
	if w := fx.verify(fx.challenge(), rc); w.Code != 422 || !strings.Contains(w.Body.String(), "sudah pernah dipakai") {
		t.Fatalf("kode cadangan dipakai dua kali: %d %s", w.Code, w.Body)
	}
	// Buat ulang: wajib konfirmasi, lalu kode lama tidak berlaku.
	if w := fx.do("POST", "/v1/me/2fa/totp/recovery", `{}`); w.Code != 422 {
		t.Fatalf("buat ulang tanpa konfirmasi: %d", w.Code)
	}
	if w := fx.do("POST", "/v1/me/2fa/totp/recovery", `{"password":"salah-sandi1"}`); w.Code != 422 {
		t.Fatalf("buat ulang dengan sandi salah: %d", w.Code)
	}
	w = fx.do("POST", "/v1/me/2fa/totp/recovery", `{"password":"Sandi-rahasia1"}`)
	if w.Code != 200 {
		t.Fatalf("buat ulang: %d %s", w.Code, w.Body)
	}
	var out struct {
		RecoveryCodes []string `json:"recovery_codes"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if len(out.RecoveryCodes) != auth.RecoveryCount || out.RecoveryCodes[0] == fx.recovery[0] {
		t.Fatalf("kode baru: %v", out.RecoveryCodes)
	}
	if w := fx.verify(fx.challenge(), fx.recovery[1]); w.Code != 422 {
		t.Fatalf("kode lama masih berlaku: %d", w.Code)
	}
	if w := fx.verify(fx.challenge(), out.RecoveryCodes[3]); w.Code != 200 {
		t.Fatalf("kode baru: %d %s", w.Code, w.Body)
	}
	// Memasang ulang autentikator yang masih aktif harus lewat "matikan" dulu.
	if w := fx.do("POST", "/v1/me/2fa/totp/setup", `{}`); w.Code != 409 {
		t.Fatalf("setup ulang saat aktif: %d", w.Code)
	}
}

// Admin/support bisa mereset autentikator pengguna yang kehilangan ponsel & kode cadangan.
func TestAdminResetTOTP(t *testing.T) {
	fx := newTOTPFixture(t, "7d1c2f0a-5b3e-4c8d-9a61-2e4f8b0c1d23", "adm@example.com")
	staff := func(role string) string {
		tok, _ := auth.Sign(fx.s.Cfg.JWTSecret, auth.Claims{Sub: "u-" + role, Role: role}, time.Minute, fx.now)
		return "Bearer " + tok
	}
	path := "/v1/admin/users/7d1c2f0a-5b3e-4c8d-9a61-2e4f8b0c1d23/2fa/reset"
	if w := do(fx.h, "POST", path, `{}`, "Authorization", staff("editor")); w.Code != 403 {
		t.Fatalf("editor tanpa users.ban: %d", w.Code)
	}
	if w := do(fx.h, "POST", path, `{}`, "Authorization", fx.bearer); w.Code != 403 {
		t.Fatalf("pembaca: %d", w.Code)
	}
	if w := do(fx.h, "POST", path, `{}`, "Authorization", staff("support")); w.Code != 204 {
		t.Fatalf("support: %d %s", w.Code, w.Body)
	}
	if len(fakeTOTP["7d1c2f0a-5b3e-4c8d-9a61-2e4f8b0c1d23"]) != 0 {
		t.Fatalf("autentikator & kode cadangan harus terhapus: %v", fakeTOTP["7d1c2f0a-5b3e-4c8d-9a61-2e4f8b0c1d23"])
	}
	if fx.login() == nil {
		t.Fatal("setelah reset, masuk cukup dengan kata sandi")
	}
}

func (f *fake) PendingReplies(context.Context, string, []string) ([]store.PendingReply, error) {
	return nil, nil
}
