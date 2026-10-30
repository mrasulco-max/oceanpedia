package market

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
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
	// Skip: simbol yang pasti tidak termasuk paket (mis. bursa IDX di paket Basic) — tidak pernah diminta.
	Skip func(providerSymbol string) bool
	Now  func() time.Time
	// Name membedakan jeda kuota antarpenyedia (mis. "twelvedata", "binance").
	Name string
	// FastTTL (opsional): umur cache harga & candle intraday untuk penyedia tanpa kuota kredit (Binance).
	FastTTL time.Duration
}

// Setelah kuota per menit habis (HTTP 429), penyedia tidak dihubungi selama jeda ini.
const cooldown = 65 * time.Second

// ErrBusy: kuota per menit sedang habis dan belum ada data tersimpan.
var ErrBusy = errors.New("kuota data pasar per menit sedang habis")

func rateLimited(err error) bool {
	var e *APIError
	return errors.As(err, &e) && e.Code == 429
}

// ErrUnavailable dikembalikan untuk simbol yang tidak tersedia di paket penyedia.
var ErrUnavailable = errors.New("data simbol ini tidak tersedia di paket penyedia")

func (s *Shared) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// ttlFor: grafik intraday disegarkan cepat (data nyata ±1 menit) tanpa melampaui kuota,
// karena satu hasil dibagi semua pengunjung.
func (s *Shared) cooldownKey() string {
	if s.Name == "" {
		return "cooldown:provider"
	}
	return "cooldown:" + s.Name
}

func (s *Shared) quoteTTL() time.Duration {
	if s.FastTTL > 0 {
		return s.FastTTL
	}
	return s.QuoteTTL
}

func (s *Shared) ttlFor(interval string) time.Duration {
	if s.FastTTL > 0 && interval != "1day" && interval != "1week" && interval != "1month" {
		return s.FastTTL
	}
	switch interval {
	case "1min", "5min":
		return time.Minute
	case "15min", "30min":
		return 2 * time.Minute
	case "1h", "4h":
		return 5 * time.Minute
	default:
		return s.CandleTTL
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
	// Jeda global setelah kuota habis: jangan membakar kredit dengan permintaan yang pasti ditolak.
	if _, _, cAt, cFound, cErr := s.KV.MarketCacheGet(ctx, s.cooldownKey()); cErr == nil && cFound && s.now().Sub(cAt) < cooldown {
		if stale != nil {
			return *stale, nil
		}
		return zero, ErrBusy
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
	if rateLimited(ferr) {
		_ = s.KV.MarketCachePut(ctx, s.cooldownKey(), nil, "429")
	}
	if stale != nil {
		return *stale, nil // kuota habis / gangguan: sajikan data terakhir
	}
	if rateLimited(ferr) {
		return zero, ErrBusy
	}
	return zero, ferr
}

func (s *Shared) Quote(ctx context.Context, ps string) (Quote, error) {
	if s.Skip != nil && s.Skip(ps) {
		return Quote{}, ErrUnavailable
	}
	return load(ctx, s, "q:"+ps, s.quoteTTL(), func() (Quote, error) { return s.P.Quote(ctx, ps) })
}

func (s *Shared) Candles(ctx context.Context, ps, interval string, n int) ([]Candle, error) {
	if s.Skip != nil && s.Skip(ps) {
		return nil, ErrUnavailable
	}
	key := fmt.Sprintf("c:%s:%s:%d", ps, interval, n)
	return load(ctx, s, key, s.ttlFor(interval), func() ([]Candle, error) { return s.P.Candles(ctx, ps, interval, n) })
}

// SkipList membuat fungsi Skip dari daftar dipisah koma: akhiran bursa (mis. "IDX" untuk "BBCA:IDX")
// atau simbol penyedia persis (mis. "JKSE").
func SkipList(list []string) func(string) bool {
	set := map[string]bool{}
	for _, x := range list {
		if x = strings.TrimSpace(x); x != "" {
			set[x] = true
		}
	}
	return func(ps string) bool {
		if set[ps] {
			return true
		}
		if i := strings.LastIndex(ps, ":"); i > 0 && set[ps[i+1:]] {
			return true
		}
		return false
	}
}

// Live menyusun penyedia data produksi: kripto dari Binance (real-time, tanpa kuota kredit),
// instrumen lain dari Twelve Data dengan cache bersama + cache memori per instance.
func Live(tdKey string, kv KV, quoteTTL, candleTTL, memTTL time.Duration, skip func(string) bool) Provider {
	td := &Shared{P: NewTwelveData(tdKey), KV: kv, QuoteTTL: quoteTTL, CandleTTL: candleTTL, ErrTTL: 24 * time.Hour, Skip: skip, Name: "twelvedata"}
	bn := &Shared{P: NewBinance(), KV: kv, QuoteTTL: 15 * time.Second, CandleTTL: 5 * time.Minute, ErrTTL: time.Hour, Name: "binance", FastTTL: 15 * time.Second}
	return Router{Crypto: bn, Default: NewCached(td, memTTL)}
}
