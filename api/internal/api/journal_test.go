package api

import (
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
