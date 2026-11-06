package calendar

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

type kvEntry struct {
	body    []byte
	errText string
	at      time.Time
}

type memKV map[string]kvEntry

func (m memKV) MarketCacheGet(_ context.Context, key string) ([]byte, string, time.Time, bool, error) {
	e, ok := m[key]
	return e.body, e.errText, e.at, ok, nil
}

func (m memKV) MarketCachePut(_ context.Context, key string, body []byte, errText string) error {
	m[key] = kvEntry{body, errText, time.Now()}
	return nil
}

type memWriter struct {
	upserted []store.EconomicEventInput
	cleared  int
}

func (w *memWriter) UpsertEconomicEvents(_ context.Context, ev []store.EconomicEventInput) error {
	w.upserted = append(w.upserted, ev...)
	return nil
}

func (w *memWriter) ClearSeedEconomicEvents(context.Context, time.Time, time.Time) error {
	w.cleared++
	return nil
}

func TestEnsureSyncedPublicFeedAndTTL(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		_, _ = w.Write([]byte(`{"status":"ok","result":[
			{"id":"1","title":"Non Farm Payrolls","country":"US","importance":1,"date":"2026-11-06T13:30:00.000Z","actual":165,"forecast":65,"previous":60,"scale":"K"},
			{"id":"2","title":"Interest Rate Decision","country":"ID","importance":0,"date":"2026-11-05T07:20:00.000Z"},
			{"id":"","title":"tanpa id","country":"US","importance":0,"date":"2026-11-05T07:20:00.000Z"}
		]}`))
	}))
	defer srv.Close()

	c := New("", "")
	c.PublicURL = srv.URL
	w := &memWriter{}
	kv := memKV{}
	s := &Syncer{Client: c, Store: w, KV: kv, TTL: time.Minute, Markets: "america,indonesia"}
	from := time.Date(2026, 11, 1, 17, 0, 0, 0, time.UTC)
	to := from.AddDate(0, 0, 7)

	s.EnsureSynced(context.Background(), from, to)
	if len(w.upserted) != 2 || w.cleared != 1 {
		t.Fatalf("upserted=%d cleared=%d", len(w.upserted), w.cleared)
	}
	nfp := w.upserted[0]
	if nfp.Impact != "high" || nfp.Actual == nil || *nfp.Actual != "165K" || nfp.Source != "tradingview" {
		t.Fatalf("NFP %+v", nfp)
	}
	s.EnsureSynced(context.Background(), from, to)
	if hits.Load() != 1 {
		t.Fatalf("masih dalam TTL, hits=%d", hits.Load())
	}
}

func TestEnsureSyncedErrorBackoff(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	c := New("", "")
	c.PublicURL = srv.URL
	w := &memWriter{}
	kv := memKV{}
	s := &Syncer{Client: c, Store: w, KV: kv, TTL: time.Minute, Markets: "america"}
	from := time.Date(2026, 11, 1, 17, 0, 0, 0, time.UTC)
	to := from.AddDate(0, 0, 1)

	s.EnsureSynced(context.Background(), from, to)
	s.EnsureSynced(context.Background(), from, to)
	if hits.Load() != 1 {
		t.Fatalf("galat harus ditahan ErrorBackoff, hits=%d", hits.Load())
	}
	if len(w.upserted) != 0 || w.cleared != 0 {
		t.Fatal("galat tidak boleh menyentuh data seed")
	}
	for k, e := range kv {
		e.at = e.at.Add(-ErrorBackoff - time.Second)
		kv[k] = e
	}
	s.EnsureSynced(context.Background(), from, to)
	if hits.Load() != 2 {
		t.Fatalf("setelah backoff harus mencoba lagi, hits=%d", hits.Load())
	}
}
