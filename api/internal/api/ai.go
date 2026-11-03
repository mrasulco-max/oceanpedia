package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
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
	if err := needPlus(r); err != nil {
		return err
	}
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
	w.Header().Set("Cache-Control", "private, max-age=300")
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
	if len(news) == 0 { // mis. "BTCUSD" jarang ditulis di berita → cari nama aset ("Bitcoin", "Emas")
		if w := strings.Fields(in.Name); len(w) > 0 && len(w[0]) > 3 {
			news, _ = s.Store.Articles(ctx, store.ArticleFilter{Query: w[0], Limit: 6})
		}
	}
	return s.AI.Market(ctx, in, q, cs, news)
}

// GET /v1/market/instruments/{symbol}/ai — Analisis AI kondisi terkini instrumen (diperbarui tiap ±10 menit).
func (s *Server) marketAI(w http.ResponseWriter, r *http.Request) error {
	if err := needPlus(r); err != nil {
		return err
	}
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
	w.Header().Set("Cache-Control", "private, max-age=60")
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
	if err := needPlus(r); err != nil {
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

// needPlus: Analisis AI khusus pelanggan Ocean Pedia Plus (staf redaksi boleh untuk pemeriksaan).
func needPlus(r *http.Request) error {
	if hasPlan(r) {
		return nil
	}
	if c := claims(r); c.Role != "" && c.Role != "reader" {
		return nil
	}
	if uid(r) == "" {
		return httpx.Unauthorized("Masuk dengan akun Ocean Pedia Plus untuk membuka Analisis AI.")
	}
	return httpx.Forbidden("Analisis AI khusus pelanggan Ocean Pedia Plus.")
}

// ======================================================================= Asisten AI (percakapan) & analisis chart

type chatMsg struct {
	Role    string `json:"role"` // user | assistant
	Content string `json:"content"`
}

// marketContext menyusun konteks: berita terbaru, harga semua instrumen, dan detail instrumen yang disebut.
// aliasSym: sebutan umum dalam pertanyaan → simbol instrumen.
var aliasSym = map[string][]string{
	"XAUUSD": {"EMAS", "GOLD"},
	"USDIDR": {"RUPIAH", "KURS", "DOLAR AS"},
	"IHSG":   {"JCI", "INDEKS SAHAM"},
	"BTCUSD": {"BTC"},
	"ETHUSD": {"ETH"},
}

// mentions: pertanyaan (huruf besar) menyebut instrumen lewat simbol, nama depan, atau alias.
func mentions(q string, in store.Instrument) bool {
	has := func(w string) bool {
		if len(w) < 3 {
			return false
		}
		for i := strings.Index(q, w); i >= 0; {
			end := i + len(w)
			okL := i == 0 || !isAlnum(q[i-1])
			okR := end >= len(q) || !isAlnum(q[end])
			if okL && okR {
				return true
			}
			j := strings.Index(q[i+1:], w)
			if j < 0 {
				break
			}
			i += 1 + j
		}
		return false
	}
	if has(in.Symbol) || has(strings.TrimSuffix(strings.TrimSuffix(in.Symbol, "USD"), "IDR")) {
		return true
	}
	if name := strings.ToUpper(strings.TrimSpace(strings.Split(in.Name, "/")[0])); has(name) {
		return true
	}
	for _, a := range aliasSym[in.Symbol] {
		if has(a) {
			return true
		}
	}
	return false
}

func isAlnum(b byte) bool {
	return b >= 'A' && b <= 'Z' || b >= 'a' && b <= 'z' || b >= '0' && b <= '9'
}

func (s *Server) marketContext(ctx context.Context, question string) string {
	var sb strings.Builder
	ins, _ := s.Store.Instruments(ctx, nil)
	q := strings.ToUpper(question)
	focus := []store.Instrument{}
	sb.WriteString("HARGA TERKINI (cache data pasar, dapat tertunda):\n")
	type row struct {
		in store.Instrument
		q  *market.Quote
	}
	rows := make([]row, len(ins))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 6)
	for i, in := range ins {
		rows[i].in = in
		wg.Add(1)
		go func(i int, in store.Instrument) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			qctx, cancel := context.WithTimeout(ctx, 6*time.Second)
			defer cancel()
			if v, err := s.Market.Quote(qctx, in.ProviderSymbol); err == nil {
				rows[i].q = &v
			}
		}(i, in)
		if len(focus) < 3 && mentions(q, in) {
			focus = append(focus, in)
		}
	}
	wg.Wait()
	for _, r := range rows {
		if r.q == nil {
			fmt.Fprintf(&sb, "- %s (%s): harga tidak tersedia\n", r.in.Symbol, r.in.Name)
			continue
		}
		fmt.Fprintf(&sb, "- %s (%s, %s): %s %s, %+.2f%% hari ini\n", r.in.Symbol, r.in.Name, r.in.AssetClass, fmtNum(r.q.Price), r.in.Currency, r.q.ChangePercent)
	}
	for _, in := range focus {
		cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
		cs, err := s.Market.Candles(cctx, in.ProviderSymbol, "1day", 260)
		cancel()
		if err == nil {
			if line := ai.TechLine(ai.Technicals(cs)); line != "" {
				fmt.Fprintf(&sb, "\nTEKNIKAL HARIAN %s: %s\n", in.Symbol, line)
			}
		}
	}
	sb.WriteString("\nBERITA TERBARU OCEANBIRD:\n")
	latest, _ := s.Store.Articles(ctx, store.ArticleFilter{Limit: 25})
	seen := map[string]bool{}
	for _, a := range latest {
		seen[a.Slug] = true
		fmt.Fprintf(&sb, "- [%s · %s] %s — %s\n", a.Category.Name, a.PublishedAt.In(jakarta).Format("2 Jan 15:04"), a.Title, plainCut(a.Excerpt, 220))
	}
	// Berita yang cocok dengan kata kunci pertanyaan / instrumen yang disebut.
	terms := []string{}
	for _, in := range focus {
		terms = append(terms, in.Symbol)
	}
	if kw := strings.TrimSpace(question); len([]rune(kw)) >= 3 && len(focus) == 0 {
		terms = append(terms, kw)
	}
	for _, t := range terms {
		filter := store.ArticleFilter{Query: plainCut(t, 80), Limit: 6}
		if len(focus) > 0 {
			filter = store.ArticleFilter{Symbols: []string{t}, Limit: 6}
		}
		hits, err := s.Store.Articles(ctx, filter)
		if err != nil {
			continue
		}
		for _, a := range hits {
			if seen[a.Slug] {
				continue
			}
			seen[a.Slug] = true
			fmt.Fprintf(&sb, "- [%s · %s] %s — %s\n", a.Category.Name, a.PublishedAt.In(jakarta).Format("2 Jan 15:04"), a.Title, plainCut(a.Excerpt, 220))
		}
	}
	return sb.String()
}

func plainCut(s string, n int) string {
	r := []rune(strings.Join(strings.Fields(s), " "))
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return string(r)
}

// POST /v1/ai/chat {messages:[{role, content}]} — Asisten AI percakapan tentang semua berita & pasar (Plus).
func (s *Server) aiChat(w http.ResponseWriter, r *http.Request) error {
	if err := needPlus(r); err != nil {
		return err
	}
	var in struct {
		Messages []chatMsg `json:"messages"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if len(in.Messages) == 0 || in.Messages[len(in.Messages)-1].Role != "user" {
		return httpx.BadRequest("Pesan terakhir harus dari pengguna.")
	}
	if len(in.Messages) > 20 {
		in.Messages = in.Messages[len(in.Messages)-20:]
	}
	turns := make([]ai.Turn, 0, len(in.Messages))
	for _, m := range in.Messages {
		t := strings.TrimSpace(m.Content)
		if t == "" {
			continue
		}
		if len([]rune(t)) > 2000 {
			t = string([]rune(t)[:2000])
		}
		role := "user"
		if m.Role == "assistant" {
			role = "model"
		}
		turns = append(turns, ai.Turn{Role: role, Text: t})
	}
	last := strings.TrimSpace(in.Messages[len(in.Messages)-1].Content)
	if last == "" || len([]rune(last)) > 2000 {
		return httpx.BadRequest("Tulis pertanyaan (maks. 2000 karakter).")
	}
	if !s.allowAsk(r.Context(), uid(r)) {
		return &httpx.Problem{Type: "about:blank", Title: "Batas pertanyaan tercapai", Status: 429, Detail: "Maksimal 30 pertanyaan per jam. Coba lagi nanti."}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 50*time.Second)
	defer cancel()
	if !s.AI.Enabled() {
		return aiUnavailable(ai.ErrDisabled)
	}
	ctxText := s.marketContext(ctx, last)
	ans, model, err := s.AI.Chat(ctx, ctxText, turns)
	if err != nil {
		s.Log.Warn("asisten AI gagal", "err", err)
		return aiUnavailable(err)
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, 200, map[string]string{"answer": ans, "model": model})
	return nil
}

// POST /v1/ai/chart (multipart: file=gambar chart, note, symbol?) — analisis support/resistance dari gambar (Plus).
func (s *Server) aiChart(w http.ResponseWriter, r *http.Request) error {
	if err := needPlus(r); err != nil {
		return err
	}
	data, mime, _, err := readImageNamed(w, r)
	if err != nil {
		return err
	}
	if !s.allowAsk(r.Context(), uid(r)) {
		return &httpx.Problem{Type: "about:blank", Title: "Batas analisis tercapai", Status: 429, Detail: "Maksimal 30 permintaan AI per jam. Coba lagi nanti."}
	}
	note := plainCut(r.FormValue("note"), 400)
	ctx, cancel := context.WithTimeout(r.Context(), 55*time.Second)
	defer cancel()
	extra := ""
	if sym := strings.ToUpper(strings.TrimSpace(r.FormValue("symbol"))); sym != "" {
		if in, err := s.Store.InstrumentBySymbol(ctx, sym); err == nil {
			var sb strings.Builder
			if q, err := s.Market.Quote(ctx, in.ProviderSymbol); err == nil {
				fmt.Fprintf(&sb, "%s harga %s (%+.2f%% hari ini). ", in.Symbol, fmtNum(q.Price), q.ChangePercent)
			}
			if cs, err := s.Market.Candles(ctx, in.ProviderSymbol, "1day", 260); err == nil {
				sb.WriteString(ai.TechLine(ai.Technicals(cs)))
			}
			extra = sb.String()
		}
	}
	res, err := s.AI.Chart(ctx, mime, data, note, extra)
	if err != nil {
		s.Log.Warn("analisis chart gagal", "err", err)
		return aiUnavailable(err)
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, 200, res)
	return nil
}
