package api

import (
	"math"
	"testing"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

func f(v float64) *float64 { return &v }

func TestJournalCalcAndSummary(t *testing.T) {
	o := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	c := o.Add(48 * time.Hour)
	long := journalCalc(store.JournalEntry{Symbol: "BBCA", Side: "long", Currency: "IDR", EntryPrice: 9000, ExitPrice: f(9500), Quantity: 100, Fees: 1000, StopLoss: f(8750), OpenedAt: o, ClosedAt: &c})
	if *long.PnL != 49000 || *long.RMult != 1.96 || *long.HoldHrs != 48 {
		t.Fatalf("long: pnl=%v r=%v hold=%v", *long.PnL, *long.RMult, *long.HoldHrs)
	}
	short := journalCalc(store.JournalEntry{Symbol: "BTCUSD", Side: "short", Currency: "USD", EntryPrice: 80000, ExitPrice: f(82000), Quantity: 0.5, OpenedAt: o, ClosedAt: &c})
	if *short.PnL != -1000 || *short.PnLPct != -2.5 {
		t.Fatalf("short: pnl=%v pct=%v", *short.PnL, *short.PnLPct)
	}
	open := journalCalc(store.JournalEntry{Symbol: "BBCA", Side: "long", Currency: "IDR", EntryPrice: 9000, Quantity: 100, OpenedAt: o})
	if open.PnL != nil {
		t.Fatal("posisi terbuka tidak punya P/L")
	}
	st := journalSummary([]journalItem{long, short, open})
	if st.Total != 3 || st.Open != 1 || st.Closed != 2 || st.Wins != 1 || st.Losses != 1 || *st.WinRate != 50 {
		t.Fatalf("stats: %+v", st)
	}
	if len(st.Currencies) != 2 || st.TopSymbols[0] != "BBCA" {
		t.Fatalf("per mata uang / simbol: %+v %v", st.Currencies, st.TopSymbols)
	}
}

func TestValidJournal(t *testing.T) {
	s := &Server{Now: func() time.Time { return time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC) }}
	e, err := s.validJournal(journalIn{Symbol: " bbca ", Side: "LONG", Market: "saham", EntryPrice: 9000, Quantity: 100, ExitPrice: f(9100), OpenedAt: "2026-11-01", Tags: []string{"#breakout", "breakout", "swing"}})
	if err != nil || e.Symbol != "BBCA" || e.ClosedAt == nil || len(e.Tags) != 2 || e.Currency != "IDR" {
		t.Fatalf("valid: %+v %v", e, err)
	}
	if _, err := s.validJournal(journalIn{Symbol: "", Side: "x", EntryPrice: 0, Quantity: -1}); err == nil {
		t.Fatal("masukan buruk harus ditolak")
	}
	if _, err := s.validJournal(journalIn{Symbol: "BTC", Side: "long", EntryPrice: 1, Quantity: 1, ExitPrice: f(2), OpenedAt: "2026-11-03", ClosedAt: "2026-11-02"}); err == nil {
		t.Fatal("tanggal keluar sebelum masuk harus ditolak")
	}
}

func TestJournalLots(t *testing.T) {
	s := &Server{Now: func() time.Time { return time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC) }}
	// Emas: entry 4000 → 4010, 0,01 lot (1 lot = 100 oz) = 10 USD.
	e, err := s.validJournal(journalIn{Symbol: "XAUUSD", Market: "komoditas", Side: "long", Currency: "USD", EntryPrice: 4000, Quantity: 0.01, ExitPrice: f(4010), StopLoss: f(3995)})
	if err != nil || e.ContractSize != 100 {
		t.Fatalf("emas: cs=%v err=%v", e.ContractSize, err)
	}
	it := journalCalc(e)
	if *it.PnL != 10 || *it.RMult != 2 {
		t.Fatalf("emas 0,01 lot: pnl=%v R=%v", *it.PnL, *it.RMult)
	}
	// EURUSD: 1,1000 → 1,1050 (50 pip), 0,1 lot = 50 USD.
	e, _ = s.validJournal(journalIn{Symbol: "EURUSD", Market: "forex", Side: "long", Currency: "USD", EntryPrice: 1.1, Quantity: 0.1, ExitPrice: f(1.105)})
	if it := journalCalc(e); math.Abs(*it.PnL-50) > 1e-6 {
		t.Fatalf("EURUSD: %v", *it.PnL)
	}
	// USDJPY dicatat dalam USD: short 150 → 149 (100 pip), 1 lot = 100.000 JPY = 671,14 USD.
	e, _ = s.validJournal(journalIn{Symbol: "USDJPY", Market: "forex", Side: "short", Currency: "USD", EntryPrice: 150, Quantity: 1, ExitPrice: f(149)})
	if it := journalCalc(e); math.Abs(*it.PnL-671.14093960) > 1e-6 {
		t.Fatalf("USDJPY: %v", *it.PnL)
	}
	// Saham AS: 10 lembar AAPL 200 → 210 dikurangi biaya 1 = 99.
	e, _ = s.validJournal(journalIn{Symbol: "AAPL", Market: "saham", Side: "long", Currency: "USD", EntryPrice: 200, Quantity: 10, ExitPrice: f(210), Fees: 1})
	if it := journalCalc(e); *it.PnL != 99 {
		t.Fatalf("AAPL: %v", *it.PnL)
	}
	// Ukuran kontrak manual.
	cs := 1000.0
	e, _ = s.validJournal(journalIn{Symbol: "GBPUSD", Market: "forex", Side: "long", Currency: "USD", EntryPrice: 1.3, Quantity: 1, ContractSize: &cs, ExitPrice: f(1.31)})
	if it := journalCalc(e); math.Abs(*it.PnL-10) > 1e-6 {
		t.Fatalf("mikro lot: %v", *it.PnL)
	}
}
