package api

import (
	"math"
	"net/http"
	"regexp"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// ======================================================================= Jurnal Trading (semua jenis akun)

const journalMax = 5000

var (
	reJournalSym = regexp.MustCompile(`^[A-Z0-9][A-Z0-9./:_-]{0,19}$`)
	reJournalCur = regexp.MustCompile(`^[A-Z]{3,5}$`)
	reJournalTag = regexp.MustCompile(`^[\p{L}\p{N} #&+._-]{1,30}$`)
	journalMkts  = []string{"saham", "crypto", "forex", "komoditas", "indeks", "lainnya"}
)

// journalItem: catatan + hasil hitung (P/L, %, kelipatan risiko R).
type journalItem struct {
	store.JournalEntry
	PnL     *float64 `json:"pnl"`
	PnLPct  *float64 `json:"pnl_pct"`
	RMult   *float64 `json:"r_multiple"`
	HoldHrs *float64 `json:"hold_hours"`
}

type journalCur struct {
	Currency     string   `json:"currency"`
	Closed       int      `json:"closed"`
	Net          float64  `json:"net"`
	GrossWin     float64  `json:"gross_win"`
	GrossLoss    float64  `json:"gross_loss"`
	ProfitFactor *float64 `json:"profit_factor"`
	Best         float64  `json:"best"`
	Worst        float64  `json:"worst"`
}

type journalStats struct {
	Total      int          `json:"total"`
	Open       int          `json:"open"`
	Closed     int          `json:"closed"`
	Wins       int          `json:"wins"`
	Losses     int          `json:"losses"`
	WinRate    *float64     `json:"win_rate"`
	AvgR       *float64     `json:"avg_r"`
	AvgHoldHrs *float64     `json:"avg_hold_hours"`
	Currencies []journalCur `json:"currencies"`
	TopSymbols []string     `json:"top_symbols"`
}

func round(v float64, d int) float64 {
	p := math.Pow(10, float64(d))
	return math.Round(v*p) / p
}

func ptr(v float64) *float64 { return &v }

func journalCalc(e store.JournalEntry) journalItem {
	it := journalItem{JournalEntry: e}
	if e.ExitPrice == nil {
		return it
	}
	dir := 1.0
	if e.Side == "short" {
		dir = -1
	}
	move := dir * (*e.ExitPrice - e.EntryPrice)
	pnl := move*e.Quantity - e.Fees
	it.PnL = ptr(round(pnl, 8))
	it.PnLPct = ptr(round(move/e.EntryPrice*100, 4))
	if e.StopLoss != nil {
		if risk := math.Abs(e.EntryPrice-*e.StopLoss) * e.Quantity; risk > 0 {
			it.RMult = ptr(round(pnl/risk, 2))
		}
	}
	if e.ClosedAt != nil {
		it.HoldHrs = ptr(round(e.ClosedAt.Sub(e.OpenedAt).Hours(), 2))
	}
	return it
}

func journalSummary(items []journalItem) journalStats {
	st := journalStats{Total: len(items), Currencies: []journalCur{}, TopSymbols: []string{}}
	cur := map[string]*journalCur{}
	var rSum, holdSum float64
	var rN, holdN int
	symN := map[string]int{}
	for _, it := range items {
		symN[it.Symbol]++
		if it.PnL == nil {
			st.Open++
			continue
		}
		st.Closed++
		p := *it.PnL
		if p > 0 {
			st.Wins++
		} else if p < 0 {
			st.Losses++
		}
		c := cur[it.Currency]
		if c == nil {
			c = &journalCur{Currency: it.Currency, Best: p, Worst: p}
			cur[it.Currency] = c
		}
		c.Closed++
		c.Net += p
		if p > 0 {
			c.GrossWin += p
		} else {
			c.GrossLoss += -p
		}
		c.Best, c.Worst = math.Max(c.Best, p), math.Min(c.Worst, p)
		if it.RMult != nil {
			rSum += *it.RMult
			rN++
		}
		if it.HoldHrs != nil {
			holdSum += *it.HoldHrs
			holdN++
		}
	}
	if st.Wins+st.Losses > 0 {
		st.WinRate = ptr(round(float64(st.Wins)/float64(st.Wins+st.Losses)*100, 1))
	}
	if rN > 0 {
		st.AvgR = ptr(round(rSum/float64(rN), 2))
	}
	if holdN > 0 {
		st.AvgHoldHrs = ptr(round(holdSum/float64(holdN), 1))
	}
	for _, c := range cur {
		c.Net, c.GrossWin, c.GrossLoss = round(c.Net, 8), round(c.GrossWin, 8), round(c.GrossLoss, 8)
		if c.GrossLoss > 0 {
			c.ProfitFactor = ptr(round(c.GrossWin/c.GrossLoss, 2))
		}
		st.Currencies = append(st.Currencies, *c)
	}
	sort.Slice(st.Currencies, func(i, j int) bool { return st.Currencies[i].Closed > st.Currencies[j].Closed })
	for s := range symN {
		st.TopSymbols = append(st.TopSymbols, s)
	}
	sort.Slice(st.TopSymbols, func(i, j int) bool {
		a, b := st.TopSymbols[i], st.TopSymbols[j]
		return symN[a] > symN[b] || symN[a] == symN[b] && a < b
	})
	if len(st.TopSymbols) > 5 {
		st.TopSymbols = st.TopSymbols[:5]
	}
	return st
}

// GET /v1/me/journal — semua catatan + ringkasan statistik.
func (s *Server) journalList(w http.ResponseWriter, r *http.Request) error {
	list, err := s.Store.Journal(r.Context(), uid(r), journalMax)
	if err != nil {
		return err
	}
	items := make([]journalItem, len(list))
	for i, e := range list {
		items[i] = journalCalc(e)
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.JSON(w, 200, map[string]any{"data": items, "stats": journalSummary(items)})
	return nil
}

type journalIn struct {
	Symbol     string   `json:"symbol"`
	Market     string   `json:"market"`
	Side       string   `json:"side"`
	Currency   string   `json:"currency"`
	EntryPrice float64  `json:"entry_price"`
	ExitPrice  *float64 `json:"exit_price"`
	Quantity   float64  `json:"quantity"`
	Fees       float64  `json:"fees"`
	StopLoss   *float64 `json:"stop_loss"`
	TakeProfit *float64 `json:"take_profit"`
	OpenedAt   string   `json:"opened_at"`
	ClosedAt   string   `json:"closed_at"`
	Strategy   string   `json:"strategy"`
	Emotion    string   `json:"emotion"`
	Notes      string   `json:"notes"`
	Tags       []string `json:"tags"`
	Rating     *int     `json:"rating"`
}

func parseWhen(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	for _, f := range []string{time.RFC3339, "2006-01-02T15:04", "2006-01-02 15:04", "2006-01-02"} {
		if t, err := time.ParseInLocation(f, s, jakarta); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func posOrNil(p *float64) *float64 {
	if p == nil || *p <= 0 || math.IsNaN(*p) || math.IsInf(*p, 0) {
		return nil
	}
	return p
}

// validJournal memeriksa & merapikan masukan menjadi catatan jurnal.
func (s *Server) validJournal(in journalIn) (store.JournalEntry, error) {
	errs := map[string]string{}
	e := store.JournalEntry{
		Symbol:   strings.ToUpper(strings.TrimSpace(in.Symbol)),
		Market:   strings.ToLower(strings.TrimSpace(in.Market)),
		Side:     strings.ToLower(strings.TrimSpace(in.Side)),
		Currency: strings.ToUpper(strings.TrimSpace(in.Currency)),
		Strategy: cut(strings.TrimSpace(in.Strategy), 80),
		Emotion:  cut(strings.TrimSpace(in.Emotion), 40),
		Notes:    cut(strings.TrimSpace(in.Notes), 4000),
		Tags:     []string{},
	}
	if !reJournalSym.MatchString(e.Symbol) {
		errs["symbol"] = "Isi kode aset, mis. BBCA atau BTCUSD."
	}
	if e.Market == "" {
		e.Market = "lainnya"
	}
	if !slices.Contains(journalMkts, e.Market) {
		errs["market"] = "Pasar tidak dikenal."
	}
	if e.Side != "long" && e.Side != "short" {
		errs["side"] = "Pilih posisi beli (long) atau jual (short)."
	}
	if e.Currency == "" {
		e.Currency = "IDR"
	}
	if !reJournalCur.MatchString(e.Currency) {
		errs["currency"] = "Mata uang tidak valid."
	}
	if !(in.EntryPrice > 0) || math.IsInf(in.EntryPrice, 0) {
		errs["entry_price"] = "Harga masuk harus lebih dari 0."
	}
	if !(in.Quantity > 0) || math.IsInf(in.Quantity, 0) {
		errs["quantity"] = "Jumlah harus lebih dari 0."
	}
	if in.Fees < 0 || math.IsNaN(in.Fees) || math.IsInf(in.Fees, 0) {
		errs["fees"] = "Biaya tidak boleh negatif."
	}
	e.EntryPrice, e.Quantity, e.Fees = in.EntryPrice, in.Quantity, in.Fees
	e.ExitPrice, e.StopLoss, e.TakeProfit = posOrNil(in.ExitPrice), posOrNil(in.StopLoss), posOrNil(in.TakeProfit)
	now := s.Now()
	e.OpenedAt = now
	if strings.TrimSpace(in.OpenedAt) != "" {
		t, ok := parseWhen(in.OpenedAt)
		if !ok {
			errs["opened_at"] = "Tanggal masuk tidak valid."
		}
		e.OpenedAt = t
	}
	if e.OpenedAt.After(now.Add(24 * time.Hour)) {
		errs["opened_at"] = "Tanggal masuk tidak boleh di masa depan."
	}
	if e.ExitPrice != nil {
		closed := now
		if strings.TrimSpace(in.ClosedAt) != "" {
			t, ok := parseWhen(in.ClosedAt)
			if !ok {
				errs["closed_at"] = "Tanggal keluar tidak valid."
			}
			closed = t
		}
		if closed.Before(e.OpenedAt) {
			errs["closed_at"] = "Tanggal keluar harus setelah tanggal masuk."
		}
		e.ClosedAt = &closed
	}
	if in.Rating != nil && *in.Rating >= 1 && *in.Rating <= 5 {
		e.Rating = in.Rating
	}
	seen := map[string]bool{}
	for _, t := range in.Tags {
		t = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(t), "#"))
		if t == "" || seen[strings.ToLower(t)] {
			continue
		}
		if !reJournalTag.MatchString(t) {
			errs["tags"] = "Tag hanya huruf, angka, dan spasi (maks. 30 karakter)."
			break
		}
		seen[strings.ToLower(t)] = true
		e.Tags = append(e.Tags, t)
		if len(e.Tags) == 10 {
			break
		}
	}
	if len(errs) > 0 {
		return e, httpx.Validation(errs)
	}
	return e, nil
}

// POST /v1/me/journal — tambah catatan.
func (s *Server) journalCreate(w http.ResponseWriter, r *http.Request) error {
	var in journalIn
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	e, err := s.validJournal(in)
	if err != nil {
		return err
	}
	if n, err := s.Store.JournalCount(r.Context(), uid(r)); err != nil {
		return err
	} else if n >= journalMax {
		return &httpx.Problem{Type: "about:blank", Title: "Jurnal penuh", Status: 409, Detail: "Maksimal 5.000 catatan. Hapus catatan lama terlebih dahulu."}
	}
	out, err := s.Store.SaveJournal(r.Context(), uid(r), e)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, journalCalc(out))
	return nil
}

// PUT /v1/me/journal/{id} — perbarui catatan (mis. menutup posisi).
func (s *Server) journalUpdate(w http.ResponseWriter, r *http.Request) error {
	id := r.PathValue("id")
	if !uuidRe.MatchString(id) {
		return httpx.ErrNotFound
	}
	var in journalIn
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	e, err := s.validJournal(in)
	if err != nil {
		return err
	}
	e.ID = id
	out, err := s.Store.SaveJournal(r.Context(), uid(r), e)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, journalCalc(out))
	return nil
}

// DELETE /v1/me/journal/{id}
func (s *Server) journalDelete(w http.ResponseWriter, r *http.Request) error {
	id := r.PathValue("id")
	if !uuidRe.MatchString(id) {
		return httpx.ErrNotFound
	}
	if err := s.Store.DeleteJournal(r.Context(), uid(r), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
