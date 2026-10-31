// Package api berisi handler HTTP REST v1.
package api

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/ai"
	"github.com/mrasulco-max/oceanpedia/api/internal/config"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/market"
	"github.com/mrasulco-max/oceanpedia/api/internal/otp"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// Server mengikat dependensi handler.
type Server struct {
	Store  store.Store
	Market market.Provider
	AI     *ai.Service
	OTP    otp.Sender
	Cfg    config.Config
	Log    *slog.Logger
	Now    func() time.Time
}

// Handler mengembalikan router lengkap dengan middleware.
func (s *Server) Handler() http.Handler {
	if s.Now == nil {
		s.Now = time.Now
	}
	m := http.NewServeMux()
	h := func(pattern string, fn func(http.ResponseWriter, *http.Request) error) {
		m.Handle(pattern, s.optionalAuth(wrap(fn)))
	}
	auth := func(pattern string, fn func(http.ResponseWriter, *http.Request) error) {
		m.Handle(pattern, s.optionalAuth(requireAuth(wrap(fn))))
	}
	staff := func(pattern string, fn func(http.ResponseWriter, *http.Request) error) {
		m.Handle(pattern, s.optionalAuth(requireStaff(wrap(fn))))
	}

	m.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { httpx.JSON(w, 200, map[string]string{"status": "ok"}) })
	h("GET /readyz", s.ready)

	// konten publik
	h("GET /v1/home", s.home)
	h("GET /v1/categories", s.categories)
	h("GET /v1/articles", s.listArticles)
	h("GET /v1/articles/{slug}", s.getArticle)
	h("POST /v1/articles/{slug}/views", s.addView)
	h("GET /v1/articles/{slug}/related", s.related)
	h("GET /v1/articles/{slug}/ai", s.articleAI)
	h("GET /v1/articles/{slug}/reactions", s.reactions)
	h("GET /v1/articles/{slug}/comments", s.comments)
	h("GET /v1/authors/{slug}", s.author)
	h("GET /v1/events", s.events)
	h("GET /v1/plans", s.plans)
	h("GET /v1/ads", s.ads)

	// pasar
	h("GET /v1/market/instruments", s.instruments)
	h("GET /v1/market/quotes", s.quotes)
	h("GET /v1/market/instruments/{symbol}", s.instrument)
	h("GET /v1/market/instruments/{symbol}/candles", s.candles)
	h("GET /v1/market/instruments/{symbol}/ai", s.marketAI)

	// autentikasi
	h("POST /v1/auth/register", s.register)
	h("POST /v1/auth/login", s.login)
	h("POST /v1/auth/refresh", s.refresh)
	h("POST /v1/auth/logout", s.logout)
	h("POST /v1/auth/verify", s.verifyOTP)
	h("POST /v1/auth/otp", s.requestOTP)
	h("POST /v1/auth/password/reset", s.resetPassword)
	h("GET /v1/search", s.search)

	// milik pengguna
	auth("POST /v1/ai/ask", s.askAI)
	auth("GET /v1/me", s.me)
	auth("PATCH /v1/me", s.updateMe)
	auth("GET /v1/me/profile", s.profile)
	auth("POST /v1/me/password", s.changePassword)
	auth("POST /v1/me/avatar", s.uploadAvatar)
	auth("DELETE /v1/me/avatar", s.deleteAvatar)
	auth("GET /v1/me/sessions", s.sessions)
	auth("DELETE /v1/me/sessions/{id}", s.revokeSession)
	auth("PUT /v1/me/topics/{slug}", s.followTopic)
	auth("DELETE /v1/me/topics/{slug}", s.unfollowTopic)
	auth("GET /v1/me/watchlist", s.watchlist)
	auth("POST /v1/me/watchlist", s.addWatch)
	auth("DELETE /v1/me/watchlist/{symbol}", s.removeWatch)
	auth("GET /v1/me/alerts", s.alerts)
	auth("POST /v1/me/alerts", s.createAlert)
	auth("DELETE /v1/me/alerts/{id}", s.deleteAlert)
	auth("GET /v1/me/bookmarks", s.bookmarks)
	auth("PUT /v1/me/bookmarks/{slug}", s.bookmarkOn)
	auth("DELETE /v1/me/bookmarks/{slug}", s.bookmarkOff)
	auth("PUT /v1/articles/{slug}/reaction", s.react)
	auth("POST /v1/articles/{slug}/comments", s.addComment)
	auth("POST /v1/checkout", s.checkout)

	// panel redaksi (penulis, editor, admin)
	staff("GET /v1/admin/articles", s.adminArticles)
	staff("POST /v1/admin/articles", s.createArticle)
	staff("GET /v1/admin/articles/{id}", s.adminArticle)
	staff("PUT /v1/admin/articles/{id}", s.updateArticle)
	staff("POST /v1/admin/articles/{id}/status", s.articleStatus)
	staff("DELETE /v1/admin/articles/{id}", s.deleteArticle)
	staff("POST /v1/admin/media", s.uploadMedia)
	h("GET /v1/media/{id}", s.media)

	m.Handle("/", wrap(func(w http.ResponseWriter, r *http.Request) error { return httpx.NotFound("Endpoint tidak dikenal.") }))

	return httpx.Chain(m,
		httpx.RequestLog(s.Log),
		httpx.Recover,
		httpx.SecureHeaders(s.Cfg.Production()),
		httpx.CORS(s.Cfg.CORSOrigins),
		httpx.RateLimit(s.Cfg.RateLimitRPS, int(s.Cfg.RateLimitRPS*2)+1),
	)
}

// wrap mengubah handler yang mengembalikan error menjadi http.Handler.
func wrap(fn func(http.ResponseWriter, *http.Request) error) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			httpx.Error(w, r, err)
		}
	})
}

// Page adalah amplop respons daftar.
type Page[T any] struct {
	Data       []T     `json:"data"`
	NextCursor *string `json:"next_cursor"`
}

func (s *Server) ready(w http.ResponseWriter, r *http.Request) error {
	if err := s.Store.Ping(r.Context()); err != nil {
		httpx.JSON(w, 503, map[string]string{"status": "unavailable"})
		return nil
	}
	httpx.JSON(w, 200, map[string]string{"status": "ready"})
	return nil
}
