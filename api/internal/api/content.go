package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/auth"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

func limitParam(r *http.Request, def, max int) int {
	n, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || n < 1 {
		return def
	}
	return min(n, max)
}

func cacheFor(w http.ResponseWriter, d time.Duration) {
	w.Header().Set("Cache-Control", "public, max-age="+strconv.Itoa(int(d.Seconds()))+", stale-while-revalidate=60")
	// CDN Vercel tidak menyimpan respons API: cache dipegang Next.js (data cache bertag "api")
	// yang dibersihkan saat redaksi menerbitkan, sehingga berita baru langsung tampil.
	w.Header().Set("Vercel-CDN-Cache-Control", "no-store")
}

func (s *Server) categories(w http.ResponseWriter, r *http.Request) error {
	cs, err := s.Store.Categories(r.Context())
	if err != nil {
		return err
	}
	cacheFor(w, 5*time.Minute)
	httpx.JSON(w, 200, Page[store.Category]{Data: cs})
	return nil
}

func (s *Server) listArticles(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	f := store.ArticleFilter{Category: q.Get("category"), Tag: q.Get("tag"), Author: q.Get("author"), Query: strings.TrimSpace(q.Get("q")), Limit: limitParam(r, 20, 50)}
	if len(f.Query) > 120 {
		return httpx.BadRequest("Kata kunci terlalu panjang (maks. 120 karakter).")
	}
	if c := q.Get("cursor"); c != "" {
		t, err := time.Parse(time.RFC3339Nano, c)
		if err != nil {
			return httpx.BadRequest("cursor tidak valid")
		}
		f.Before = &t
	}
	list, err := s.Store.Articles(r.Context(), f)
	if err != nil {
		return err
	}
	var next *string
	if len(list) == f.Limit {
		c := list[len(list)-1].PublishedAt.Format(time.RFC3339Nano)
		next = &c
	}
	cacheFor(w, 30*time.Second)
	httpx.JSON(w, 200, Page[store.ArticleCard]{Data: list, NextCursor: next})
	return nil
}

// home merangkum data beranda dalam satu panggilan (mengurangi round-trip klien).
func (s *Server) home(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	latest, err := s.Store.Articles(ctx, store.ArticleFilter{Limit: 12})
	if err != nil {
		return err
	}
	most, err := s.Store.MostRead(ctx, 5)
	if err != nil {
		return err
	}
	cats, err := s.Store.Categories(ctx)
	if err != nil {
		return err
	}
	type section struct {
		Category store.Category      `json:"category"`
		Articles []store.ArticleCard `json:"articles"`
	}
	sections := []section{}
	for _, c := range cats {
		if c.ArticleCount == 0 {
			continue
		}
		a, err := s.Store.Articles(ctx, store.ArticleFilter{Category: c.Slug, Limit: 4})
		if err != nil {
			return err
		}
		sections = append(sections, section{Category: c, Articles: a})
	}
	var top *store.ArticleCard
	if len(latest) > 0 {
		top = &latest[0]
		for i := range latest {
			if latest[i].IsBreaking {
				top = &latest[i]
				break
			}
		}
	}
	cacheFor(w, 30*time.Second)
	httpx.JSON(w, 200, map[string]any{"top_story": top, "latest": latest, "most_read": most, "sections": sections})
	return nil
}

func hasPlan(r *http.Request) bool {
	c, ok := auth.FromContext(r.Context())
	return ok && c.Plan != ""
}

func (s *Server) getArticle(w http.ResponseWriter, r *http.Request) error {
	a, err := s.Store.ArticleBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		return err
	}
	plus := hasPlan(r)
	if !plus {
		a.AISummary = nil // Analisis AI khusus pelanggan Plus
		if a.IsPremium {
			a.Locked = true
			if i := strings.Index(a.Body, "\n\n"); i > 0 {
				a.Body = a.Body[:i]
			}
		}
	}
	if plus {
		w.Header().Set("Cache-Control", "private, no-store")
	} else {
		cacheFor(w, 60*time.Second)
	}
	httpx.JSON(w, 200, a)
	return nil
}

func (s *Server) addView(w http.ResponseWriter, r *http.Request) error {
	if err := s.Store.IncrementView(r.Context(), r.PathValue("slug")); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) related(w http.ResponseWriter, r *http.Request) error {
	l, err := s.Store.RelatedArticles(r.Context(), r.PathValue("slug"), limitParam(r, 6, 20))
	if err != nil {
		return err
	}
	cacheFor(w, 60*time.Second)
	httpx.JSON(w, 200, Page[store.ArticleCard]{Data: l})
	return nil
}

func (s *Server) reactions(w http.ResponseWriter, r *http.Request) error {
	l, err := s.Store.Reactions(r.Context(), r.PathValue("slug"))
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, Page[store.ReactionCount]{Data: l})
	return nil
}

func (s *Server) comments(w http.ResponseWriter, r *http.Request) error {
	l, err := s.Store.Comments(r.Context(), r.PathValue("slug"), limitParam(r, 20, 100))
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, Page[store.Comment]{Data: l})
	return nil
}

func (s *Server) author(w http.ResponseWriter, r *http.Request) error {
	a, err := s.Store.AuthorBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		return err
	}
	l, err := s.Store.Articles(r.Context(), store.ArticleFilter{Author: a.Slug, Limit: 20})
	if err != nil {
		return err
	}
	cacheFor(w, 5*time.Minute)
	httpx.JSON(w, 200, map[string]any{"author": a, "articles": l})
	return nil
}

var jakarta = func() *time.Location {
	l, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		return time.FixedZone("WIB", 7*3600)
	}
	return l
}()

func (s *Server) events(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	from := s.Now().In(jakarta)
	from = time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, jakarta)
	if d := q.Get("from"); d != "" {
		t, err := time.ParseInLocation("2006-01-02", d, jakarta)
		if err != nil {
			return httpx.BadRequest("from harus berformat YYYY-MM-DD")
		}
		from = t
	}
	days, _ := strconv.Atoi(q.Get("days"))
	if days < 1 || days > 31 {
		days = 1
	}
	impact := q.Get("impact")
	if impact != "" && impact != "low" && impact != "medium" && impact != "high" {
		return httpx.BadRequest("impact harus low, medium, atau high")
	}
	l, err := s.Store.Events(r.Context(), from, from.AddDate(0, 0, days), impact)
	if err != nil {
		return err
	}
	cacheFor(w, 60*time.Second)
	httpx.JSON(w, 200, Page[store.EconomicEvent]{Data: l})
	return nil
}

func (s *Server) plans(w http.ResponseWriter, r *http.Request) error {
	l, err := s.Store.Plans(r.Context())
	if err != nil {
		return err
	}
	cacheFor(w, 10*time.Minute)
	httpx.JSON(w, 200, map[string]any{"data": l, "tax_rate": s.Cfg.TaxRate, "prices_exclude_tax": true})
	return nil
}

func (s *Server) ads(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	surface, page := q.Get("surface"), q.Get("page")
	if surface != "web" && surface != "app" {
		return httpx.BadRequest("surface harus web atau app")
	}
	if hasPlan(r) { // pelanggan Plus tanpa iklan
		httpx.JSON(w, 200, Page[store.AdSlot]{Data: []store.AdSlot{}})
		return nil
	}
	l, err := s.Store.AdSlots(r.Context(), surface, page)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, Page[store.AdSlot]{Data: l})
	return nil
}
