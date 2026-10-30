package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/market"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// QuoteItem menggabungkan metadata instrumen dan harga.
type QuoteItem struct {
	Instrument store.Instrument `json:"instrument"`
	Quote      *market.Quote    `json:"quote"`
	Error      string           `json:"error,omitempty"`
}

func symbolsParam(r *http.Request) []string {
	var out []string
	for _, s := range strings.Split(r.URL.Query().Get("symbols"), ",") {
		if s = strings.ToUpper(strings.TrimSpace(s)); s != "" && len(out) < 30 {
			out = append(out, s)
		}
	}
	return out
}

func (s *Server) instruments(w http.ResponseWriter, r *http.Request) error {
	l, err := s.Store.Instruments(r.Context(), symbolsParam(r))
	if err != nil {
		return err
	}
	cacheFor(w, 10*time.Minute)
	httpx.JSON(w, 200, Page[store.Instrument]{Data: l})
	return nil
}

func (s *Server) quotes(w http.ResponseWriter, r *http.Request) error {
	syms := symbolsParam(r)
	if len(syms) == 0 {
		return httpx.BadRequest("parameter symbols wajib, mis. ?symbols=BBCA,BTCUSD")
	}
	ins, err := s.Store.Instruments(r.Context(), syms)
	if err != nil {
		return err
	}
	out := make([]QuoteItem, len(ins))
	for i, in := range ins {
		out[i].Instrument = in
		q, err := s.Market.Quote(r.Context(), in.ProviderSymbol)
		if err != nil {
			s.Log.Warn("quote gagal", "symbol", in.Symbol, "err", err)
			out[i].Error = "Harga sementara tidak tersedia."
			continue
		}
		q.Symbol = in.Symbol
		out[i].Quote = &q
	}
	w.Header().Set("Cache-Control", "public, max-age=15")
	httpx.JSON(w, 200, Page[QuoteItem]{Data: out})
	return nil
}

func (s *Server) instrument(w http.ResponseWriter, r *http.Request) error {
	in, err := s.Store.InstrumentBySymbol(r.Context(), strings.ToUpper(r.PathValue("symbol")))
	if err != nil {
		return err
	}
	item := QuoteItem{Instrument: in}
	if q, err := s.Market.Quote(r.Context(), in.ProviderSymbol); err == nil {
		q.Symbol = in.Symbol
		item.Quote = &q
	} else {
		item.Error = "Harga sementara tidak tersedia."
	}
	news, err := s.Store.Articles(r.Context(), store.ArticleFilter{Query: in.Symbol, Limit: 8})
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "public, max-age=15")
	httpx.JSON(w, 200, map[string]any{"instrument": item.Instrument, "quote": item.Quote, "error": item.Error, "news": news})
	return nil
}

func (s *Server) candles(w http.ResponseWriter, r *http.Request) error {
	in, err := s.Store.InstrumentBySymbol(r.Context(), strings.ToUpper(r.PathValue("symbol")))
	if err != nil {
		return err
	}
	interval := r.URL.Query().Get("interval")
	if interval == "" {
		interval = "1day"
	}
	if !market.Intervals[interval] {
		return httpx.BadRequest("interval tidak didukung")
	}
	cs, err := s.Market.Candles(r.Context(), in.ProviderSymbol, interval, limitParam(r, 120, 500))
	if err != nil {
		s.Log.Warn("candles gagal", "symbol", in.Symbol, "err", err)
		return &httpx.Problem{Type: "about:blank", Title: "Data pasar tidak tersedia", Status: 502, Detail: "Penyedia data sedang bermasalah. Coba lagi nanti."}
	}
	w.Header().Set("Cache-Control", "public, max-age=30")
	httpx.JSON(w, 200, map[string]any{"symbol": in.Symbol, "interval": interval, "data": cs})
	return nil
}
