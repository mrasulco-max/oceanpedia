package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/ai"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/market"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

func aiUnavailable(err error) error {
	if errors.Is(err, ai.ErrDisabled) {
		return &httpx.Problem{Type: "about:blank", Title: "Analisis AI belum aktif", Status: 503}
	}
	return &httpx.Problem{Type: "about:blank", Title: "Analisis AI sedang sibuk", Status: 503, Detail: "Coba lagi sebentar lagi."}
}

// GET /v1/articles/{slug}/ai — Analisis AI sebuah berita (dibuat sekali per versi isi, lalu disimpan).
func (s *Server) articleAI(w http.ResponseWriter, r *http.Request) error {
	a, err := s.Store.ArticleBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	res, err := s.AI.Article(ctx, a, a.Symbols)
	if err != nil {
		s.Log.Warn("analisis AI artikel gagal", "slug", a.Slug, "err", err)
		return aiUnavailable(err)
	}
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Header().Set("Vercel-CDN-Cache-Control", "no-store")
	httpx.JSON(w, 200, res)
	return nil
}

func (s *Server) marketAIFor(ctx context.Context, in store.Instrument) (*ai.Analysis, error) {
	var q *market.Quote
	if v, err := s.Market.Quote(ctx, in.ProviderSymbol); err == nil {
		q = &v
	}
	cs, _ := s.Market.Candles(ctx, in.ProviderSymbol, "1day", 260)
	news, _ := s.Store.Articles(ctx, store.ArticleFilter{Query: in.Symbol, Limit: 6})
	return s.AI.Market(ctx, in, q, cs, news)
}

// GET /v1/market/instruments/{symbol}/ai — Analisis AI kondisi terkini instrumen (diperbarui tiap ±10 menit).
func (s *Server) marketAI(w http.ResponseWriter, r *http.Request) error {
	in, err := s.Store.InstrumentBySymbol(r.Context(), strings.ToUpper(r.PathValue("symbol")))
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	res, err := s.marketAIFor(ctx, in)
	if err != nil {
		s.Log.Warn("analisis AI pasar gagal", "symbol", in.Symbol, "err", err)
		return aiUnavailable(err)
	}
	w.Header().Set("Cache-Control", "public, max-age=60")
	w.Header().Set("Vercel-CDN-Cache-Control", "no-store")
	httpx.JSON(w, 200, res)
	return nil
}

// POST /v1/ai/ask — "Tanya AI" tentang sebuah berita atau instrumen (perlu masuk; dibatasi per jam).
func (s *Server) askAI(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Slug     string `json:"slug"`
		Symbol   string `json:"symbol"`
		Question string `json:"question"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Question = strings.TrimSpace(in.Question)
	if in.Question == "" || len([]rune(in.Question)) > 300 {
		return httpx.BadRequest("Tulis pertanyaan (maks. 300 karakter).")
	}
	c := claims(r)
	if !s.allowAsk(r.Context(), c.Sub) {
		return &httpx.Problem{Type: "about:blank", Title: "Batas pertanyaan tercapai", Status: 429, Detail: "Maksimal 30 pertanyaan per jam. Coba lagi nanti."}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	var ctxText string
	switch {
	case in.Slug != "":
		a, err := s.Store.ArticleBySlug(ctx, in.Slug)
		if err != nil {
			return err
		}
		ctxText = fmt.Sprintf("Berita: %s\nTerbit: %s\n%s", a.Title, a.PublishedAt.Format("2 Jan 2006"), a.Body)
	case in.Symbol != "":
		inst, err := s.Store.InstrumentBySymbol(ctx, strings.ToUpper(in.Symbol))
		if err != nil {
			return err
		}
		an, err := s.marketAIFor(ctx, inst)
		if err != nil {
			return aiUnavailable(err)
		}
		b, _ := json.Marshal(an)
		ctxText = fmt.Sprintf("Analisis terkini %s (%s):\n%s", inst.Symbol, inst.Name, b)
	default:
		return httpx.BadRequest("Sertakan slug berita atau simbol.")
	}
	ans, model, err := s.AI.Ask(ctx, ctxText, in.Question)
	if err != nil {
		s.Log.Warn("tanya AI gagal", "err", err)
		return aiUnavailable(err)
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, 200, map[string]string{"answer": ans, "model": model})
	return nil
}

// allowAsk: maks. 30 pertanyaan per pengguna per jam (penghitung di cache bersama).
func (s *Server) allowAsk(ctx context.Context, user string) bool {
	if s.AI == nil || s.AI.KV == nil {
		return true
	}
	key := "ai:rl:" + user + ":" + s.Now().UTC().Format("2006010215")
	n := 0
	if body, _, _, found, err := s.AI.KV.MarketCacheGet(ctx, key); err == nil && found {
		_ = json.Unmarshal(body, &n)
	}
	if n >= 30 {
		return false
	}
	b, _ := json.Marshal(n + 1)
	_ = s.AI.KV.MarketCachePut(ctx, key, b, "")
	return true
}
