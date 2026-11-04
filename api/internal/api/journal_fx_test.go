package api

import (
	"context"
	"errors"
	"math"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/market"
)

// fxMarket: kurs uji (mid-market).
type fxMarket map[string]float64

func (m fxMarket) Quote(_ context.Context, sym string) (market.Quote, error) {
	if p, ok := m[sym]; ok {
		return market.Quote{Symbol: sym, Price: p}, nil
	}
	return market.Quote{}, errors.New("tidak ada")
}
func (m fxMarket) Candles(context.Context, string, string, int) ([]market.Candle, error) {
	return nil, errors.New("tidak ada")
}

func TestJournalFX(t *testing.T) {
	s := &Server{Now: func() time.Time { return time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC) }, Market: fxMarket{"USD/IDR": 18162.47, "EUR/USD": 1.126, "USD/JPY": 158.43}}
	r := httptest.NewRequest("POST", "/", nil)
	near := func(a, b float64) bool { return math.Abs(a-b) < 0.01 }
	close := func(in journalIn) journalItem {
		t.Helper()
		e, err := s.validJournal(in)
		if err != nil {
			t.Fatal(err)
		}
		if err := s.resolveFX(r, &e, in); err != nil {
			t.Fatal(err)
		}
		return journalCalc(e)
	}
	// Emas 0,01 lot 4000 → 4010 = 10 USD; dicatat di akun IDR = 10 × 18.162,47.
	it := close(journalIn{Symbol: "XAUUSD", Market: "komoditas", Side: "long", Currency: "IDR", EntryPrice: 4000, Quantity: 0.01, ExitPrice: f(4010)})
	if it.QuoteCurrency != "USD" || it.FxSource != "market" || !near(*it.PnL, 181624.7) {
		t.Fatalf("XAU→IDR: qc=%s src=%s pnl=%v", it.QuoteCurrency, it.FxSource, *it.PnL)
	}
	// Kurs tetap broker (fixed rate) Rp10.000/USD.
	fixed := 10000.0
	it = close(journalIn{Symbol: "XAUUSD", Market: "komoditas", Side: "long", Currency: "IDR", EntryPrice: 4000, Quantity: 0.01, ExitPrice: f(4010), FxRate: &fixed})
	if it.FxSource != "manual" || !near(*it.PnL, 100000) {
		t.Fatalf("kurs tetap: %s %v", it.FxSource, *it.PnL)
	}
	// Akun USD: tanpa konversi.
	it = close(journalIn{Symbol: "XAUUSD", Market: "komoditas", Side: "long", Currency: "USD", EntryPrice: 4000, Quantity: 0.01, ExitPrice: f(4010)})
	if it.FxSource != "same" || !near(*it.PnL, 10) {
		t.Fatalf("USD: %s %v", it.FxSource, *it.PnL)
	}
	// USDJPY di akun USD: selisih (JPY) dibagi harga penutupan.
	it = close(journalIn{Symbol: "USDJPY", Market: "forex", Side: "short", Currency: "USD", EntryPrice: 150, Quantity: 1, ExitPrice: f(149)})
	if it.QuoteCurrency != "JPY" || it.FxSource != "price" || !near(*it.PnL, 671.14) {
		t.Fatalf("USDJPY: %s %s %v", it.QuoteCurrency, it.FxSource, *it.PnL)
	}
	// EURUSD di akun IDR: 50 pip × 0,1 lot = 50 USD = Rp908.123,5.
	it = close(journalIn{Symbol: "EURUSD", Market: "forex", Side: "long", Currency: "IDR", EntryPrice: 1.1, Quantity: 0.1, ExitPrice: f(1.105)})
	if !near(*it.PnL, 908123.5) {
		t.Fatalf("EURUSD→IDR: %v", *it.PnL)
	}
	// USDJPY di akun IDR: JPY → USD → IDR lewat kurs pasar.
	it = close(journalIn{Symbol: "USDJPY", Market: "forex", Side: "long", Currency: "IDR", EntryPrice: 150, Quantity: 0.01, ExitPrice: f(151)})
	if !near(*it.PnL, 1000/158.43*18162.47) {
		t.Fatalf("USDJPY→IDR: %v", *it.PnL)
	}
	// Kurs tidak tersedia → minta kurs manual.
	e, _ := s.validJournal(journalIn{Symbol: "XAUUSD", Market: "komoditas", Side: "long", Currency: "MYR", EntryPrice: 1, Quantity: 1, ExitPrice: f(2)})
	if err := s.resolveFX(r, &e, journalIn{}); err == nil {
		t.Fatal("kurs tak dikenal harus minta kurs manual")
	}
	// Posisi terbuka: kurs belum ditetapkan.
	e, _ = s.validJournal(journalIn{Symbol: "EURUSD", Market: "forex", Side: "long", Currency: "IDR", EntryPrice: 1.1, Quantity: 0.1})
	if err := s.resolveFX(r, &e, journalIn{}); err != nil || e.FxRate != nil {
		t.Fatalf("terbuka: %v %v", err, e.FxRate)
	}
	if got := s.fxRates(context.Background(), "IDR", "EUR")["USDIDR"]; !near(got, 18162.47) {
		t.Fatalf("USDIDR: %v", got)
	}
}
