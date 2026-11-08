package calendar

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/market"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// Writer menulis event hasil sync.
type Writer interface {
	UpsertEconomicEvents(ctx context.Context, events []store.EconomicEventInput) error
	ClearSeedEconomicEvents(ctx context.Context, from, to time.Time) error
}

// Syncer menyinkronkan kalender ekonomi ke DB (on-demand, dengan TTL).
type Syncer struct {
	// Client: sumber utama (Xoomar atau TradingView). Nama field dipertahankan agar kompatibel.
	Client  Source
	Store   Writer
	KV      market.KV
	TTL     time.Duration
	Markets string
	Log     *slog.Logger

	mu sync.Mutex
}

// ErrorBackoff: jeda sebelum mencoba lagi setelah sync gagal (hindari memanggil API di tiap request).
const ErrorBackoff = 2 * time.Minute

// SyncTimeout membatasi fetch+upsert agar request /v1/events tidak menggantung.
const SyncTimeout = 12 * time.Second

// EnsureSynced mengisi economic_events untuk [from, to) bila cache sync sudah kedaluwarsa.
// Galat penyedia → no-op (data seed/DB lama tetap dipakai), dicoba lagi setelah ErrorBackoff.
func (s *Syncer) EnsureSynced(ctx context.Context, from, to time.Time) {
	if s == nil || s.Client == nil || s.Store == nil {
		return
	}
	if !to.After(from) {
		return
	}
	limit := maxRange
	if s.Client.Mode() == "xoomar" {
		limit = xoomarMaxRange
	}
	if to.Sub(from) > limit {
		to = from.Add(limit)
	}
	ttl := s.TTL
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	key := fmt.Sprintf("cal:%s:%s:%s", s.Client.Mode(), from.UTC().Format("2006-01-02T15"), to.UTC().Format("2006-01-02T15"))
	if s.fresh(ctx, key, ttl) {
		return
	}
	// Satu sync per proses untuk kunci yang sama (hindari stampede singkat).
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.fresh(ctx, key, ttl) {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, SyncTimeout)
	defer cancel()

	raw, err := s.Client.Economic(ctx, from, to, s.Markets)
	if err != nil {
		s.fail(ctx, key, "kalender ekonomi gagal", err, "mode", s.Client.Mode(), "from", from, "to", to)
		return
	}
	in := make([]store.EconomicEventInput, 0, len(raw))
	for _, r := range raw {
		e, err := ToStore(r)
		if err != nil {
			continue
		}
		in = append(in, e)
	}
	if err := s.Store.UpsertEconomicEvents(ctx, in); err != nil {
		s.fail(ctx, key, "kalender ekonomi upsert gagal", err, "n", len(in))
		return
	}
	// Hapus contoh seed di jendela yang sama agar tidak bercampur dengan data nyata.
	if err := s.Store.ClearSeedEconomicEvents(ctx, from, to); err != nil && s.Log != nil {
		s.Log.Warn("kalender ekonomi bersihkan seed gagal", "err", err)
	}
	if s.KV != nil {
		_ = s.KV.MarketCachePut(ctx, key, []byte(`{"ok":true}`), "")
	}
	if s.Log != nil {
		s.Log.Info("kalender ekonomi tersinkron", "mode", s.Client.Mode(), "n", len(in), "from", from.Format(time.RFC3339), "to", to.Format(time.RFC3339))
	}
}

// fresh: sync sukses masih dalam TTL, atau galat terakhir masih dalam ErrorBackoff.
func (s *Syncer) fresh(ctx context.Context, key string, ttl time.Duration) bool {
	if s.KV == nil {
		return false
	}
	_, errText, at, found, err := s.KV.MarketCacheGet(ctx, key)
	if err != nil || !found {
		return false
	}
	if errText != "" {
		return time.Since(at) < ErrorBackoff
	}
	return time.Since(at) < ttl
}

func (s *Syncer) fail(ctx context.Context, key, msg string, err error, attrs ...any) {
	if s.Log != nil {
		s.Log.Warn(msg, append([]any{"err", err}, attrs...)...)
	}
	if s.KV != nil {
		_ = s.KV.MarketCachePut(context.WithoutCancel(ctx), key, nil, err.Error())
	}
}
