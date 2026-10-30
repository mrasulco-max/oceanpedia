package api

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"net/mail"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/mrasulco-max/oceanpedia/api/internal/auth"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
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

func (s *Server) register(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		FullName string `json:"full_name"`
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
	if err := auth.ValidatePassword(in.Password); err != nil {
		errs["password"] = err.Error()
	}
	if len(errs) > 0 {
		return httpx.Validation(errs)
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return err
	}
	u, err := s.Store.CreateUser(r.Context(), in.Email, in.FullName, hash)
	if errors.Is(err, store.ErrDuplicate) {
		return httpx.Conflict("Email sudah terdaftar.")
	}
	if err != nil {
		return err
	}
	return s.issue(w, r, u, http.StatusCreated)
}

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
	return s.issue(w, r, u, http.StatusOK)
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
