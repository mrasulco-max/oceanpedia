package market

import (
	"context"
	"errors"
	"testing"
	"time"
)

type memKV struct {
	m map[string]struct {
		b  []byte
		e  string
		at time.Time
	}
	now *time.Time
}

func (k *memKV) MarketCacheGet(_ context.Context, key string) ([]byte, string, time.Time, bool, error) {
	v, ok := k.m[key]
	return v.b, v.e, v.at, ok, nil
}
func (k *memKV) MarketCachePut(_ context.Context, key string, b []byte, e string) error {
	k.m[key] = struct {
		b  []byte
		e  string
		at time.Time
	}{b, e, *k.now}
	return nil
}

type sharedP struct {
	calls int
	err   error
}

func (c *sharedP) Quote(context.Context, string) (Quote, error) {
	c.calls++
	if c.err != nil {
		return Quote{}, c.err
	}
	return Quote{Price: float64(100 + c.calls), Source: "twelvedata"}, nil
}
func (c *sharedP) Candles(context.Context, string, string, int) ([]Candle, error) {
	c.calls++
	return []Candle{{Close: 1}}, c.err
}

func TestSharedCache(t *testing.T) {
	now := time.Date(2026, 10, 31, 0, 0, 0, 0, time.UTC)
	kv := &memKV{m: map[string]struct {
		b  []byte
		e  string
		at time.Time
	}{}, now: &now}
	p := &sharedP{}
	s := &Shared{P: p, KV: kv, QuoteTTL: 10 * time.Minute, CandleTTL: time.Hour, ErrTTL: time.Hour, Now: func() time.Time { return now }}
	ctx := context.Background()

	q1, _ := s.Quote(ctx, "BTC/USD")
	q2, _ := s.Quote(ctx, "BTC/USD")
	if p.calls != 1 || q1.Price != q2.Price {
		t.Fatalf("harus dari cache: calls=%d", p.calls)
	}
	now = now.Add(11 * time.Minute)
	if q3, _ := s.Quote(ctx, "BTC/USD"); p.calls != 2 || q3.Price != 102 {
		t.Fatalf("kedaluwarsa harus ambil ulang: calls=%d", p.calls)
	}
	// Kuota habis → data lama tetap disajikan.
	now = now.Add(11 * time.Minute)
	p.err = &APIError{Code: 429, Message: "limit"}
	if q4, err := s.Quote(ctx, "BTC/USD"); err != nil || q4.Price != 102 {
		t.Fatalf("stale saat kuota habis: %v %v", q4, err)
	}
	// Simbol butuh paket Pro → dicatat, tidak dicoba lagi selama ErrTTL.
	p.err = &APIError{Code: 404, Message: "Pro plan"}
	if _, err := s.Quote(ctx, "BBCA:IDX"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("mau ErrUnavailable: %v", err)
	}
	before := p.calls
	if _, err := s.Quote(ctx, "BBCA:IDX"); !errors.Is(err, ErrUnavailable) || p.calls != before {
		t.Fatalf("negative cache: %v calls %d→%d", err, before, p.calls)
	}
}
