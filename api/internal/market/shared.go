package market

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// KV adalah penyimpanan cache bersama (PostgreSQL) yang dipakai semua instance serverless.
type KV interface {
	MarketCacheGet(ctx context.Context, key string) (body []byte, errText string, fetchedAt time.Time, found bool, err error)
	MarketCachePut(ctx context.Context, key string, body []byte, errText string) error
}

// Shared menghemat kuota penyedia (paket Basic Twelve Data: 8 kredit/menit, 800/hari):
//   - hasil disimpan di database dan dibagi semua instance,
//   - simbol yang tidak tersedia di paket dicatat (negative cache) agar tidak dicoba berulang,
//   - bila penyedia gagal sementara (kuota/jaringan), data terakhir tetap disajikan.
type Shared struct {
	P         Provider
	KV        KV
	QuoteTTL  time.Duration // default 10 menit
	CandleTTL time.Duration // untuk interval harian; interval lebih pendek memakai QuoteTTL
	ErrTTL    time.Duration // berapa lama simbol yang tidak tersedia tidak dicoba lagi
	Now       func() time.Time
}

// ErrUnavailable dikembalikan untuk simbol yang tidak tersedia di paket penyedia.
var ErrUnavailable = errors.New("data simbol ini tidak tersedia di paket penyedia")

func (s *Shared) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s *Shared) ttlFor(interval string) time.Duration {
	switch interval {
	case "1day", "1week", "1month":
		return s.CandleTTL
	case "1h", "4h":
		return s.QuoteTTL * 2
	default:
		return s.QuoteTTL
	}
}

// load mengembalikan nilai cache bila masih segar; stale berisi nilai lama (bisa kedaluwarsa) bila ada.
func load[T any](ctx context.Context, s *Shared, key string, ttl time.Duration, fetch func() (T, error)) (T, error) {
	var zero T
	body, errText, at, found, err := s.KV.MarketCacheGet(ctx, key)
	if err != nil {
		return fetch() // database bermasalah: langsung ke penyedia
	}
	age := s.now().Sub(at)
	if found && errText != "" && age < s.ErrTTL {
		return zero, ErrUnavailable
	}
	var stale *T
	if found && errText == "" && len(body) > 0 {
		var v T
		if json.Unmarshal(body, &v) == nil {
			if age < ttl {
				return v, nil
			}
			stale = &v
		}
	}
	v, ferr := fetch()
	if ferr == nil {
		if b, err := json.Marshal(v); err == nil {
			_ = s.KV.MarketCachePut(ctx, key, b, "")
		}
		return v, nil
	}
	if Permanent(ferr) {
		_ = s.KV.MarketCachePut(ctx, key, nil, ferr.Error())
		return zero, ErrUnavailable
	}
	if stale != nil {
		return *stale, nil // kuota habis / gangguan: sajikan data terakhir
	}
	return zero, ferr
}

func (s *Shared) Quote(ctx context.Context, ps string) (Quote, error) {
	return load(ctx, s, "q:"+ps, s.QuoteTTL, func() (Quote, error) { return s.P.Quote(ctx, ps) })
}

func (s *Shared) Candles(ctx context.Context, ps, interval string, n int) ([]Candle, error) {
	key := fmt.Sprintf("c:%s:%s:%d", ps, interval, n)
	return load(ctx, s, key, s.ttlFor(interval), func() ([]Candle, error) { return s.P.Candles(ctx, ps, interval, n) })
}
