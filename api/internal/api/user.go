package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"net/mail"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mrasulco-max/oceanpedia/api/internal/auth"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/otp"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// optionalAuth membaca Bearer token bila ada; token tidak valid → 401.
func (s *Server) optionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		if h == "" {
			next.ServeHTTP(w, r)
			return
		}
		tok, ok := strings.CutPrefix(h, "Bearer ")
		if !ok {
			httpx.Error(w, r, httpx.Unauthorized("Header Authorization harus Bearer."))
			return
		}
		c, err := auth.Verify(s.Cfg.JWTSecret, tok, s.Now())
		if err != nil {
			httpx.Error(w, r, httpx.Unauthorized("Sesi tidak valid atau kedaluwarsa."))
			return
		}
		next.ServeHTTP(w, r.WithContext(auth.WithClaims(r.Context(), c)))
	})
}

func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := auth.FromContext(r.Context()); !ok {
			httpx.Error(w, r, httpx.Unauthorized("Silakan masuk terlebih dahulu."))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func uid(r *http.Request) string { c, _ := auth.FromContext(r.Context()); return c.Sub }

// TokenResponse mengikuti gaya OAuth 2.0 (RFC 6749 §5.1).
type TokenResponse struct {
	AccessToken  string     `json:"access_token"`
	TokenType    string     `json:"token_type"`
	ExpiresIn    int        `json:"expires_in"`
	RefreshToken string     `json:"refresh_token"`
	User         store.User `json:"user"`
}

func hashToken(t string) []byte { h := sha256.Sum256([]byte(t)); return h[:] }

func (s *Server) issue(w http.ResponseWriter, r *http.Request, u store.User, status int) error {
	plan := ""
	if u.Plan != nil {
		plan = *u.Plan
	}
	at, err := auth.Sign(s.Cfg.JWTSecret, auth.Claims{Sub: u.ID, Role: u.Role, Plan: plan}, s.Cfg.AccessTokenTTL, s.Now())
	if err != nil {
		return err
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return err
	}
	rt := base64.RawURLEncoding.EncodeToString(raw)
	if err := s.Store.SaveRefreshToken(r.Context(), u.ID, hashToken(rt), r.UserAgent(), httpx.ClientIP(r), s.Now().Add(s.Cfg.RefreshTokenTTL)); err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, status, TokenResponse{AccessToken: at, TokenType: "Bearer", ExpiresIn: int(s.Cfg.AccessTokenTTL.Seconds()), RefreshToken: rt, User: u})
	return nil
}

// normalizePhone mengubah nomor Indonesia ("0812…", "812…", "+62 812-…") ke E.164 (+62812…).
func normalizePhone(v string) (string, bool) {
	d := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, v)
	if d == "" {
		return "", true
	}
	switch {
	case strings.HasPrefix(d, "62"):
		d = d[2:]
	case strings.HasPrefix(d, "0"):
		d = d[1:]
	}
	if len(d) < 8 || len(d) > 13 || d[0] != '8' {
		return "", false
	}
	return "+62" + d, true
}

func maskEmail(e string) string {
	name, dom, ok := strings.Cut(e, "@")
	if !ok || name == "" {
		return e
	}
	r := []rune(name)
	keep := min(2, len(r))
	return string(r[:keep]) + strings.Repeat("*", max(1, len(r)-keep)) + "@" + dom
}

// sendOTP mengirim kode verifikasi; kuota kirim ulang Bird yang habis bukan kegagalan (kode lama masih berlaku).
func (s *Server) sendOTP(ctx context.Context, email string) error {
	if s.OTP == nil {
		return otp.ErrUnavailable
	}
	err := s.OTP.Send(ctx, email)
	if err != nil && !errors.Is(err, otp.ErrTooMany) {
		s.Log.Warn("kirim OTP gagal", "err", err)
		return err
	}
	return nil
}

// VerificationPending: respons setelah daftar / masuk dengan akun yang belum dikonfirmasi.
type VerificationPending struct {
	Status      string `json:"status"` // verification_required
	Email       string `json:"email"`
	MaskedEmail string `json:"masked_email"`
	OTPSent     bool   `json:"otp_sent"`
	ResendAfter int    `json:"resend_after"`
}

const verificationType = "https://oceanpedia.id/problems/verification-required"

// POST /v1/auth/register — buat akun lalu kirim OTP ke email. Akun baru belum bisa masuk sebelum konfirmasi OTP.
func (s *Server) register(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		FullName string `json:"full_name"`
		Phone    string `json:"phone"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Email, in.FullName = strings.TrimSpace(strings.ToLower(in.Email)), strings.TrimSpace(in.FullName)
	errs := map[string]string{}
	if a, err := mail.ParseAddress(in.Email); err != nil || a.Address != in.Email || len(in.Email) > 254 {
		errs["email"] = "Format email tidak valid."
	}
	if n := utf8.RuneCountInString(in.FullName); n < 2 || n > 100 {
		errs["full_name"] = "Nama 2–100 karakter."
	}
	if err := auth.ValidateNewPassword(in.Password); err != nil {
		errs["password"] = err.Error()
	}
	phone, ok := normalizePhone(in.Phone)
	if !ok {
		errs["phone"] = "Nomor HP tidak valid (contoh: 812 3456 7890)."
	}
	if len(errs) > 0 {
		return httpx.Validation(errs)
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return err
	}
	u, err := s.Store.UserByEmail(r.Context(), in.Email)
	switch {
	case err == nil && u.EmailVerified:
		return httpx.Conflict("Email sudah terdaftar. Silakan masuk.")
	case err == nil:
		// Pernah daftar tapi belum konfirmasi OTP: perbarui data & kirim kode baru.
		if _, err := s.Store.UpdatePendingUser(r.Context(), u.ID, in.FullName, hash, phone); err != nil {
			return err
		}
	case errors.Is(err, httpx.ErrNotFound):
		if _, err := s.Store.CreateUser(r.Context(), in.Email, in.FullName, hash, phone); err != nil {
			if errors.Is(err, store.ErrDuplicate) {
				return httpx.Conflict("Email sudah terdaftar. Silakan masuk.")
			}
			return err
		}
	default:
		return err
	}
	sent := s.sendOTP(r.Context(), in.Email) == nil
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, http.StatusAccepted, VerificationPending{Status: "verification_required", Email: in.Email, MaskedEmail: maskEmail(in.Email), OTPSent: sent, ResendAfter: 45})
	return nil
}

// POST /v1/auth/login — akun terverifikasi langsung masuk tanpa OTP; akun baru yang belum konfirmasi diminta OTP.
func (s *Server) login(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	u, err := s.Store.UserByEmail(r.Context(), strings.TrimSpace(in.Email))
	if err != nil && !errors.Is(err, httpx.ErrNotFound) {
		return err
	}
	// pesan sama untuk email/sandi salah agar tidak membocorkan keberadaan akun
	if err != nil || u.PasswordHash == "" || !auth.CheckPassword(u.PasswordHash, in.Password) {
		return httpx.Unauthorized("Email atau kata sandi salah.")
	}
	if !u.EmailVerified {
		_ = s.sendOTP(r.Context(), u.Email)
		return &httpx.Problem{Type: verificationType, Title: "Verifikasi diperlukan", Status: http.StatusForbidden,
			Detail: "Akun belum dikonfirmasi. Kami mengirim kode verifikasi ke " + maskEmail(u.Email) + ".", Errors: map[string]string{"email": u.Email}}
	}
	return s.issue(w, r, u, http.StatusOK)
}

var codeRe = regexp.MustCompile(`^[A-Za-z0-9]{4,8}$`)

func (s *Server) checkCode(ctx context.Context, email, code string) (store.User, error) {
	code = strings.TrimSpace(code)
	if !codeRe.MatchString(code) {
		return store.User{}, httpx.Validation(map[string]string{"code": "Masukkan 6 karakter kode dari email."})
	}
	u, err := s.Store.UserByEmail(ctx, strings.TrimSpace(email))
	if errors.Is(err, httpx.ErrNotFound) {
		return u, httpx.Validation(map[string]string{"code": "Kode salah atau sudah kedaluwarsa."})
	}
	if err != nil {
		return u, err
	}
	if s.OTP == nil {
		return u, &httpx.Problem{Type: "about:blank", Title: "Verifikasi belum aktif", Status: 503}
	}
	res, err := s.OTP.Check(ctx, u.Email, code)
	if errors.Is(err, otp.ErrTooMany) {
		return u, httpx.TooMany()
	}
	if err != nil {
		s.Log.Warn("cek OTP gagal", "err", err)
		return u, &httpx.Problem{Type: "about:blank", Title: "Layanan verifikasi sibuk", Status: 503, Detail: "Coba lagi sebentar lagi."}
	}
	if !res.OK {
		return u, httpx.Validation(map[string]string{"code": res.Message()})
	}
	return u, nil
}

// POST /v1/auth/verify {email, code} — konfirmasi OTP (akun baru, atau masuk dengan kode), lalu masuk.
func (s *Server) verifyOTP(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	u, err := s.checkCode(r.Context(), in.Email, in.Code)
	if err != nil {
		return err
	}
	if !u.EmailVerified {
		if err := s.Store.MarkEmailVerified(r.Context(), u.ID); err != nil {
			return err
		}
		u.EmailVerified = true
	}
	return s.issue(w, r, u, http.StatusOK)
}

// POST /v1/auth/otp {email} — kirim (ulang) kode: konfirmasi akun, masuk dengan kode, atau lupa kata sandi.
// Selalu 202 agar tidak membocorkan email mana yang terdaftar.
func (s *Server) requestOTP(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email string `json:"email"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	email := strings.TrimSpace(strings.ToLower(in.Email))
	if a, err := mail.ParseAddress(email); err != nil || a.Address != email {
		return httpx.Validation(map[string]string{"email": "Format email tidak valid."})
	}
	if u, err := s.Store.UserByEmail(r.Context(), email); err == nil {
		if s.OTP == nil {
			return &httpx.Problem{Type: "about:blank", Title: "Verifikasi belum aktif", Status: 503}
		}
		if err := s.OTP.Send(r.Context(), u.Email); errors.Is(err, otp.ErrTooMany) {
			return &httpx.Problem{Type: "about:blank", Title: "Tunggu sebentar", Status: 429, Detail: "Kode baru bisa dikirim lagi sebentar lagi. Periksa juga folder spam."}
		} else if err != nil {
			s.Log.Warn("kirim OTP gagal", "err", err)
			return &httpx.Problem{Type: "about:blank", Title: "Gagal mengirim kode", Status: 503, Detail: "Coba lagi sebentar lagi."}
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, http.StatusAccepted, map[string]any{"status": "sent", "masked_email": maskEmail(email), "resend_after": 45})
	return nil
}

// POST /v1/auth/password/reset {email, code, password} — atur kata sandi baru dengan kode dari email.
func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email    string `json:"email"`
		Code     string `json:"code"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := auth.ValidateNewPassword(in.Password); err != nil {
		return httpx.Validation(map[string]string{"password": err.Error()})
	}
	u, err := s.checkCode(r.Context(), in.Email, in.Code)
	if err != nil {
		return err
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return err
	}
	if err := s.Store.SetPassword(r.Context(), u.ID, hash); err != nil {
		return err
	}
	_ = s.Store.MarkEmailVerified(r.Context(), u.ID)
	_ = s.Store.RevokeUserTokens(r.Context(), u.ID) // keluarkan dari perangkat lain
	u.EmailVerified = true
	return s.issue(w, r, u, http.StatusOK)
}

// GET /v1/search?q=… — aset, berita, penulis, dan topik.
func (s *Server) search(w http.ResponseWriter, r *http.Request) error {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" || utf8.RuneCountInString(q) > 80 {
		return httpx.BadRequest("Kata kunci 1–80 karakter.")
	}
	start := s.Now()
	res, err := s.Store.Search(r.Context(), q, limitParam(r, 6, 20))
	if err != nil {
		return err
	}
	cacheFor(w, 30*time.Second)
	httpx.JSON(w, 200, map[string]any{"query": q, "took_ms": s.Now().Sub(start).Milliseconds(), "total": len(res.Instruments) + len(res.Articles) + len(res.Authors) + len(res.Tags), "result": res})
	return nil
}

func (s *Server) refresh(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	id, err := s.Store.ConsumeRefreshToken(r.Context(), hashToken(in.RefreshToken))
	if err != nil {
		return httpx.Unauthorized("Refresh token tidak valid.")
	}
	u, err := s.Store.UserByID(r.Context(), id)
	if err != nil {
		return httpx.Unauthorized("Akun tidak ditemukan.")
	}
	return s.issue(w, r, u, http.StatusOK)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := s.Store.RevokeRefreshToken(r.Context(), hashToken(in.RefreshToken)); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) error {
	u, err := s.Store.UserByID(r.Context(), uid(r))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, u)
	return nil
}

func (s *Server) watchlist(w http.ResponseWriter, r *http.Request) error {
	l, err := s.Store.Watchlist(r.Context(), uid(r))
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, Page[store.WatchItem]{Data: l})
	return nil
}

func (s *Server) addWatch(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Symbol string `json:"symbol"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Symbol = strings.ToUpper(strings.TrimSpace(in.Symbol))
	if _, err := s.Store.InstrumentBySymbol(r.Context(), in.Symbol); err != nil {
		if errors.Is(err, httpx.ErrNotFound) {
			return httpx.Validation(map[string]string{"symbol": "Simbol tidak dikenal."})
		}
		return err
	}
	if err := s.Store.AddToWatchlist(r.Context(), uid(r), in.Symbol); err != nil {
		return err
	}
	return s.watchlist(w, r)
}

func (s *Server) removeWatch(w http.ResponseWriter, r *http.Request) error {
	if err := s.Store.RemoveFromWatchlist(r.Context(), uid(r), strings.ToUpper(r.PathValue("symbol"))); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) alerts(w http.ResponseWriter, r *http.Request) error {
	l, err := s.Store.Alerts(r.Context(), uid(r))
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, Page[store.Alert]{Data: l})
	return nil
}

var (
	conditions  = []string{"price_above", "price_below", "change_pct", "volume_spike", "rsi", "news"}
	frequencies = []string{"once", "every_time", "daily"}
	channels    = []string{"push", "email", "whatsapp", "in_app"}
)

func (s *Server) createAlert(w http.ResponseWriter, r *http.Request) error {
	var a store.Alert
	if err := httpx.Decode(r, &a); err != nil {
		return err
	}
	a.Symbol = strings.ToUpper(a.Symbol)
	if a.Frequency == "" {
		a.Frequency = "once"
	}
	if len(a.Channels) == 0 {
		a.Channels = []string{"push"}
	}
	errs := map[string]string{}
	if !slices.Contains(conditions, a.Condition) {
		errs["condition"] = "Kondisi tidak dikenal."
	}
	if !slices.Contains(frequencies, a.Frequency) {
		errs["frequency"] = "Frekuensi tidak dikenal."
	}
	for _, c := range a.Channels {
		if !slices.Contains(channels, c) {
			errs["channels"] = "Kanal tidak dikenal: " + c
		}
	}
	if (a.Condition == "price_above" || a.Condition == "price_below" || a.Condition == "change_pct") && a.Threshold == nil {
		errs["threshold"] = "Nilai ambang wajib untuk kondisi ini."
	}
	// fitur Plus
	if !hasPlan(r) && (a.Condition == "volume_spike" || a.Condition == "rsi" || slices.Contains(a.Channels, "whatsapp")) {
		return httpx.Forbidden("Kondisi atau kanal ini khusus pelanggan Ocean Pedia Plus.")
	}
	if _, err := s.Store.InstrumentBySymbol(r.Context(), a.Symbol); err != nil {
		errs["symbol"] = "Simbol tidak dikenal."
	}
	if len(errs) > 0 {
		return httpx.Validation(errs)
	}
	out, err := s.Store.CreateAlert(r.Context(), uid(r), a)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, out)
	return nil
}

func (s *Server) deleteAlert(w http.ResponseWriter, r *http.Request) error {
	if err := s.Store.DeleteAlert(r.Context(), uid(r), r.PathValue("id")); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) bookmarks(w http.ResponseWriter, r *http.Request) error {
	l, err := s.Store.Bookmarks(r.Context(), uid(r))
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, Page[store.ArticleCard]{Data: l})
	return nil
}

func (s *Server) bookmarkOn(w http.ResponseWriter, r *http.Request) error {
	if err := s.Store.SetBookmark(r.Context(), uid(r), r.PathValue("slug"), true); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) bookmarkOff(w http.ResponseWriter, r *http.Request) error {
	if err := s.Store.SetBookmark(r.Context(), uid(r), r.PathValue("slug"), false); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

var reactionKinds = []string{"bullish", "bearish", "informative", "favorite"}

func (s *Server) react(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Kind string `json:"kind"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if !slices.Contains(reactionKinds, in.Kind) {
		return httpx.Validation(map[string]string{"kind": "Gunakan bullish, bearish, informative, atau favorite."})
	}
	if err := s.Store.React(r.Context(), uid(r), r.PathValue("slug"), in.Kind); err != nil {
		return err
	}
	return s.reactions(w, r)
}

func (s *Server) addComment(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Body string `json:"body"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Body = strings.TrimSpace(in.Body)
	if n := utf8.RuneCountInString(in.Body); n < 1 || n > 2000 {
		return httpx.Validation(map[string]string{"body": "Komentar 1–2000 karakter."})
	}
	c, err := s.Store.AddComment(r.Context(), uid(r), r.PathValue("slug"), in.Body)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, c)
	return nil
}
