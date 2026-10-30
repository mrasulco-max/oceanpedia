package ai

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/market"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

type memKV struct {
	m map[string][]byte
	t map[string]time.Time
}

func (k *memKV) MarketCacheGet(_ context.Context, key string) ([]byte, string, time.Time, bool, error) {
	b, ok := k.m[key]
	return b, "", k.t[key], ok, nil
}
func (k *memKV) MarketCachePut(_ context.Context, key string, b []byte, _ string) error {
	k.m[key], k.t[key] = b, time.Now()
	return nil
}

func TestArticleAnalysisFallbackAndCache(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("x-goog-api-key") != "k" {
			t.Errorf("api key tidak dikirim lewat header")
		}
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), "responseSchema") {
			t.Errorf("schema tidak dikirim")
		}
		if strings.Contains(r.URL.Path, "sibuk") {
			w.WriteHeader(503)
			_, _ = w.Write([]byte(`{"error":{"code":503,"message":"high demand"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"pikir","thought":true},{"text":"{\"inti\":\"IHSG naik.\",\"poin\":[\"a\",\"b\",\"c\"],\"sentimen\":\"positif\",\"skor\":140,\"aset\":[{\"simbol\":\"bbca\",\"catatan\":\"x\",\"dampak\":\"positif\"}],\"pantau\":[],\"pertanyaan\":[\"q1\"]}"}]}}]}`))
	}))
	defer srv.Close()
	g := &Gemini{Key: "k", Models: []string{"sibuk", "ok"}, BaseURL: srv.URL, HTTP: srv.Client()}
	s := &Service{G: g, KV: &memKV{m: map[string][]byte{}, t: map[string]time.Time{}}}
	a := store.Article{ArticleCard: store.ArticleCard{Slug: "x", Title: "IHSG naik"}, Body: "<p>IHSG naik 1%.</p>"}
	res, err := s.Article(context.Background(), a, []string{"IHSG"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Model != "ok" || res.Skor != 100 || res.Aset[0].Simbol != "BBCA" || res.Inti != "IHSG naik." {
		t.Fatalf("hasil salah: %+v", res)
	}
	if _, err := s.Article(context.Background(), a, nil); err != nil || calls.Load() != 2 {
		t.Fatalf("panggilan kedua harus dari cache: calls=%d err=%v", calls.Load(), err)
	}
}

func TestDisabled(t *testing.T) {
	s := &Service{G: NewGemini("", nil)}
	if _, err := s.Market(context.Background(), store.Instrument{Symbol: "BTCUSD"}, nil, nil, nil); err != ErrDisabled {
		t.Fatalf("mau ErrDisabled, dapat %v", err)
	}
}

func TestTechnicalsAndFormat(t *testing.T) {
	var cs []market.Candle
	for i := 0; i < 60; i++ {
		v := 100 + float64(i)
		cs = append(cs, market.Candle{Open: v, High: v + 2, Low: v - 2, Close: v + 1})
	}
	tc := Technicals(cs)
	if !tc.OK || tc.RSI != 100 || tc.SMA20 == 0 || tc.S1 >= tc.R1 {
		t.Fatalf("teknikal salah: %+v", tc)
	}
	if f(77010.4) != "77.010" || f(-3.5) != "−3,5000" || f(1234567) != "1.234.567" || f(96.123) != "96,12" {
		t.Fatalf("format salah: %s %s %s %s", f(77010.4), f(-3.5), f(1234567), f(96.123))
	}
}
