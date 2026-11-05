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

// Syncer menyinkronkan kalender TV ke DB (on-demand, dengan TTL).
type Syncer struct {
	Client  *Client
	Store   Writer
	KV      market.KV
	TTL     time.Duration
	Markets string
	Log     *slog.Logger

	mu sync.Mutex
}

// EnsureSynced mengisi economic_events untuk [from, to) bila cache sync sudah kedaluwarsa.
// Kunci kosong / galat TV → no-op (data seed/DB lama tetap dipakai).
func (s *Syncer) EnsureSynced(ctx context.Context, from, to time.Time) {
	if s == nil || s.Client == nil || s.Client.Key == "" || s.Store == nil {
		return
	}
	if !to.After(from) {
		return
	}
	// API membatasi rentang ≤40 hari.
	if to.Sub(from) > 40*24*time.Hour {
		to = from.Add(40 * 24 * time.Hour)
	}
	ttl := s.TTL
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	key := fmt.Sprintf("cal:tv:%s:%s", from.UTC().Format("2006-01-02"), to.UTC().Format("2006-01-02"))
	if s.KV != nil {
		if _, errText, at, found, err := s.KV.MarketCacheGet(ctx, key); err == nil && found && errText == "" && time.Since(at) < ttl {
			return
		}
	}
	// Satu sync per proses untuk kunci yang sama (hindari stampede singkat).
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.KV != nil {
		if _, errText, at, found, err := s.KV.MarketCacheGet(ctx, key); err == nil && found && errText == "" && time.Since(at) < ttl {
			return
		}
	}

	raw, err := s.Client.Economic(ctx, from, to, s.Markets)
	if err != nil {
		if s.Log != nil {
			s.Log.Warn("kalender TV gagal", "err", err, "from", from, "to", to)
		}
		if s.KV != nil {
			_ = s.KV.MarketCachePut(ctx, key, nil, err.Error())
		}
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
		if s.Log != nil {
			s.Log.Warn("kalender TV upsert gagal", "err", err, "n", len(in))
		}
		return
	}
	// Hapus contoh seed di jendela yang sama agar tidak bercampur dengan data nyata.
	if err := s.Store.ClearSeedEconomicEvents(ctx, from, to); err != nil && s.Log != nil {
		s.Log.Warn("kalender TV bersihkan seed gagal", "err", err)
	}
	if s.KV != nil {
		_ = s.KV.MarketCachePut(ctx, key, []byte(`{"ok":true}`), "")
	}
	if s.Log != nil {
		s.Log.Info("kalender TV tersinkron", "n", len(in), "from", from.Format(time.RFC3339), "to", to.Format(time.RFC3339))
	}
}
