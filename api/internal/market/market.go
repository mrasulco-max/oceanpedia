// Package market menyediakan data harga. API key penyedia hanya dipakai di server.
package market

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Quote adalah harga terkini sebuah instrumen (bentuk respons /quote Twelve Data).
type Quote struct {
	Symbol        string    `json:"symbol"`
	Price         float64   `json:"price"`
	Change        float64   `json:"change"`
	ChangePercent float64   `json:"change_percent"`
	Open          float64   `json:"open"`
	High          float64   `json:"high"`
	Low           float64   `json:"low"`
	PrevClose     float64   `json:"previous_close"`
	Volume        float64   `json:"volume"`
	AvgVolume     float64   `json:"average_volume,omitempty"`
	Week52Low     float64   `json:"week52_low"`
	Week52High    float64   `json:"week52_high"`
	MarketOpen    *bool     `json:"is_market_open,omitempty"`
	AsOf          time.Time `json:"as_of"`
	Source        string    `json:"source"`
}

// Candle adalah satu batang OHLCV.
type Candle struct {
	Time   time.Time `json:"t"`
	Open   float64   `json:"o"`
	High   float64   `json:"h"`
	Low    float64   `json:"l"`
	Close  float64   `json:"c"`
	Volume float64   `json:"v"`
}

// Provider adalah sumber data harga.
type Provider interface {
	Quote(ctx context.Context, providerSymbol string) (Quote, error)
	Candles(ctx context.Context, providerSymbol, interval string, n int) ([]Candle, error)
}

// BatchQuoter (opsional): beberapa harga dalam satu panggilan HTTP (Twelve Data: symbol=A,B,C).
type BatchQuoter interface {
	Quotes(ctx context.Context, providerSymbols []string) (map[string]Quote, error)
}

// Intervals yang diizinkan (format Twelve Data time_series / quote).
var Intervals = map[string]bool{
	"1min": true, "5min": true, "15min": true, "30min": true, "45min": true,
	"1h": true, "2h": true, "4h": true, "8h": true,
	"1day": true, "1week": true, "1month": true,
}

// ---------------------------------------------------------------- Twelve Data

// TwelveData memanggil https://api.twelvedata.com.
type TwelveData struct {
	Key     string
	BaseURL string
	HTTP    *http.Client
}

func NewTwelveData(key string) *TwelveData {
	return &TwelveData{Key: key, BaseURL: "https://api.twelvedata.com", HTTP: &http.Client{Timeout: 8 * time.Second}}
}

func splitSymbol(s string) (sym, exchange string) {
	if i := strings.LastIndex(s, ":"); i > 0 {
		return s[:i], s[i+1:]
	}
	return s, ""
}

func (t *TwelveData) get(ctx context.Context, path string, q url.Values, out any) error {
	q.Set("apikey", t.Key)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, t.BaseURL+path+"?"+q.Encode(), nil)
	if err != nil {
		return err
	}
	res, err := t.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	var raw json.RawMessage
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return fmt.Errorf("twelvedata: respons tidak valid: %w", err)
	}
	var e struct {
		Status  string `json:"status"`
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	if json.Unmarshal(raw, &e) == nil && e.Status == "error" {
		return &APIError{Code: e.Code, Message: e.Message}
	}
	return json.Unmarshal(raw, out)
}

// APIError adalah galat dari penyedia data (mis. simbol butuh paket berbayar, kuota habis).
type APIError struct {
	Code    int
	Message string
}

func (e *APIError) Error() string { return fmt.Sprintf("twelvedata %d: %s", e.Code, e.Message) }

// Permanent: galat yang tidak akan berubah dalam waktu dekat (simbol tidak ada / tidak termasuk paket).
// Galat kuota (429) dan gangguan jaringan dianggap sementara.
func Permanent(err error) bool {
	var e *APIError
	return errors.As(err, &e) && (e.Code == 400 || e.Code == 403 || e.Code == 404)
}

type num string

func (n num) f() float64 { v, _ := strconv.ParseFloat(string(n), 64); return v }

// tdQuote adalah bentuk JSON /quote (satu simbol) sesuai dokumentasi Twelve Data.
type tdQuote struct {
	Symbol        string `json:"symbol"`
	Datetime      string `json:"datetime"`
	Timestamp     int64  `json:"timestamp"`
	LastQuoteAt   int64  `json:"last_quote_at"`
	Open          num    `json:"open"`
	High          num    `json:"high"`
	Low           num    `json:"low"`
	Close         num    `json:"close"`
	Volume        num    `json:"volume"`
	PreviousClose num    `json:"previous_close"`
	Change        num    `json:"change"`
	PercentChange num    `json:"percent_change"`
	AverageVolume num    `json:"average_volume"`
	IsMarketOpen  *bool  `json:"is_market_open"`
	FiftyTwoWeek  struct {
		Low  num `json:"low"`
		High num `json:"high"`
	} `json:"fifty_two_week"`
	Status  string `json:"status"`
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (r tdQuote) toQuote() Quote {
	asOf := time.Unix(r.LastQuoteAt, 0).UTC()
	if r.LastQuoteAt == 0 {
		asOf = time.Unix(r.Timestamp, 0).UTC()
	}
	if asOf.IsZero() || asOf.Year() < 2000 {
		if t, err := time.Parse("2006-01-02 15:04:05", r.Datetime); err == nil {
			asOf = t.UTC()
		} else if t, err := time.Parse("2006-01-02", r.Datetime); err == nil {
			asOf = t.UTC()
		}
	}
	return Quote{
		Symbol: r.Symbol, Price: r.Close.f(), Change: r.Change.f(), ChangePercent: r.PercentChange.f(),
		Open: r.Open.f(), High: r.High.f(), Low: r.Low.f(), PrevClose: r.PreviousClose.f(),
		Volume: r.Volume.f(), AvgVolume: r.AverageVolume.f(),
		Week52Low: r.FiftyTwoWeek.Low.f(), Week52High: r.FiftyTwoWeek.High.f(),
		MarketOpen: r.IsMarketOpen, AsOf: asOf, Source: "twelvedata",
	}
}

func (t *TwelveData) Quote(ctx context.Context, ps string) (Quote, error) {
	sym, ex := splitSymbol(ps)
	q := url.Values{"symbol": {sym}}
	if ex != "" {
		q.Set("exchange", ex)
	}
	var r tdQuote
	if err := t.get(ctx, "/quote", q, &r); err != nil {
		return Quote{}, err
	}
	out := r.toQuote()
	if out.Price == 0 && out.PrevClose == 0 {
		return Quote{}, &APIError{Code: 404, Message: "quote kosong untuk " + ps}
	}
	return out, nil
}

// Quotes mengambil beberapa harga sekaligus (GET /quote?symbol=A,B,C) — 1 kredit/simbol, 1 round-trip.
// Simbol dengan :exchange (mis. BBCA:IDX) dipanggil satu-satu karena batch tidak mendukung exchange per item.
func (t *TwelveData) Quotes(ctx context.Context, pss []string) (map[string]Quote, error) {
	out := make(map[string]Quote, len(pss))
	if len(pss) == 0 {
		return out, nil
	}
	var batch []string
	var batchKeys []string
	for _, ps := range pss {
		sym, ex := splitSymbol(ps)
		if ex != "" {
			q, err := t.Quote(ctx, ps)
			if err != nil {
				continue
			}
			out[ps] = q
			continue
		}
		batch = append(batch, sym)
		batchKeys = append(batchKeys, ps)
	}
	if len(batch) == 0 {
		return out, nil
	}
	if len(batch) == 1 {
		q, err := t.Quote(ctx, batchKeys[0])
		if err != nil {
			return out, err
		}
		out[batchKeys[0]] = q
		return out, nil
	}
	q := url.Values{"symbol": {strings.Join(batch, ",")}}
	var raw json.RawMessage
	if err := t.get(ctx, "/quote", q, &raw); err != nil {
		return out, err
	}
	// Multi-simbol → objek { "AAPL": {...}, "XAU/USD": {...} }; satu simbol → objek flat (gagal di-unmarshal ke map).
	var multi map[string]tdQuote
	if err := json.Unmarshal(raw, &multi); err == nil && len(multi) > 0 {
		for i, sym := range batch {
			r, ok := multi[sym]
			if !ok || r.Status == "error" {
				continue
			}
			out[batchKeys[i]] = r.toQuote()
		}
		return out, nil
	}
	var single tdQuote
	if err := json.Unmarshal(raw, &single); err != nil {
		return out, fmt.Errorf("twelvedata: batch quote tidak valid: %w", err)
	}
	if single.Status == "error" {
		return out, &APIError{Code: single.Code, Message: single.Message}
	}
	out[batchKeys[0]] = single.toQuote()
	return out, nil
}

func (t *TwelveData) Candles(ctx context.Context, ps, interval string, n int) ([]Candle, error) {
	if n < 1 {
		n = 30
	}
	if n > 5000 {
		n = 5000
	}
	sym, ex := splitSymbol(ps)
	q := url.Values{"symbol": {sym}, "interval": {interval}, "outputsize": {strconv.Itoa(n)}, "order": {"ASC"}, "timezone": {"UTC"}}
	if ex != "" {
		q.Set("exchange", ex)
	}
	var r struct {
		Values []struct {
			Datetime string `json:"datetime"`
			Open     num    `json:"open"`
			High     num    `json:"high"`
			Low      num    `json:"low"`
			Close    num    `json:"close"`
			Volume   num    `json:"volume"`
		} `json:"values"`
		Status  string `json:"status"`
		Code    int    `json:"code"`
		Message string `json:"message"`
	}
	if err := t.get(ctx, "/time_series", q, &r); err != nil {
		return nil, err
	}
	out := make([]Candle, 0, len(r.Values))
	for _, v := range r.Values {
		ts, err := time.Parse("2006-01-02 15:04:05", v.Datetime)
		if err != nil {
			ts, _ = time.Parse("2006-01-02", v.Datetime)
		}
		out = append(out, Candle{Time: ts.UTC(), Open: v.Open.f(), High: v.High.f(), Low: v.Low.f(), Close: v.Close.f(), Volume: v.Volume.f()})
	}
	return out, nil
}

// ---------------------------------------------------------------- data contoh (tanpa API key)

// Sample menghasilkan data deterministik untuk development dan demo.
type Sample struct{}

var sampleBase = map[string][2]float64{ // harga, perubahan %
	"BBCA:IDX": {10125, 1.12}, "BBRI:IDX": {4920, 2.15}, "BMRI:IDX": {6150, 0.82}, "TLKM:IDX": {2880, 0.70},
	"ASII:IDX": {5050, -0.49}, "GOTO:IDX": {64, -3.03}, "JKSE": {7284.16, 0.84}, "JKLQ45": {912.40, 0.66},
	"BTC/USD": {68420, 2.31}, "ETH/USD": {3512, 1.48}, "XAU/USD": {2384.1, -0.42}, "USD/IDR": {15612, -0.18},
	"SOL/USD": {168.4, -0.84}, "BNB/USD": {598.2, 0.35}, "XRP/USD": {0.52, 1.1}, "DOGE/USD": {0.16, -1.2}, "EUR/IDR": {16904, 0.12}, "SGD/IDR": {11588, -0.05},
	"XBR/USD": {82.14, 1.05}, "WTI/USD": {78.40, 0.62}, "NI1": {17240, 0.92}, "XAG/USD": {31.20, -0.35},
	"AAPL": {345.12, 0.28}, "MSFT": {535.59, -0.06}, "NVDA": {192.40, 1.10}, "TSLA": {358.09, 2.40},
	"AMZN": {228.50, 0.55}, "GOOGL": {178.20, -0.22}, "META": {612.30, 0.80},
	"EUR/USD": {1.0850, -0.12}, "GBP/USD": {1.2980, 0.08}, "USD/JPY": {153.40, 0.15}, "AUD/USD": {0.6520, -0.05},
}

func (Sample) Quote(_ context.Context, ps string) (Quote, error) {
	b, ok := sampleBase[ps]
	if !ok {
		return Quote{}, errors.New("simbol tidak tersedia")
	}
	prev := b[0] / (1 + b[1]/100)
	return Quote{Price: b[0], Change: round(b[0] - prev), ChangePercent: b[1], Open: round(prev * 1.001), High: round(b[0] * 1.0025),
		Low: round(prev * 0.997), PrevClose: round(prev), Volume: 86_200_000, Week52Low: round(b[0] * 0.85), Week52High: round(b[0] * 1.03),
		AsOf: time.Now().UTC().Truncate(time.Minute), Source: "sample"}, nil
}

func (s Sample) Candles(ctx context.Context, ps, interval string, n int) ([]Candle, error) {
	q, err := s.Quote(ctx, ps)
	if err != nil {
		return nil, err
	}
	step := map[string]time.Duration{
		"1min": time.Minute, "5min": 5 * time.Minute, "15min": 15 * time.Minute, "30min": 30 * time.Minute, "45min": 45 * time.Minute,
		"1h": time.Hour, "2h": 2 * time.Hour, "4h": 4 * time.Hour, "8h": 8 * time.Hour,
		"1day": 24 * time.Hour, "1week": 7 * 24 * time.Hour, "1month": 30 * 24 * time.Hour,
	}[interval]
	if step == 0 {
		step = 24 * time.Hour
	}
	out := make([]Candle, n)
	price := q.Price * 0.9
	end := time.Now().UTC().Truncate(step)
	for i := 0; i < n; i++ {
		x := float64(i)
		o := price
		c := o * (1 + 0.004*math.Sin(x/5) + 0.0025*math.Cos(x/2.3) + 0.1/float64(n))
		out[i] = Candle{Time: end.Add(-time.Duration(n-1-i) * step), Open: round(o), Close: round(c),
			High: round(math.Max(o, c) * 1.004), Low: round(math.Min(o, c) * 0.996), Volume: 40e6 + 30e6*math.Abs(math.Sin(x))}
		price = c
	}
	out[n-1].Close = q.Price
	return out, nil
}

func round(v float64) float64 { return math.Round(v*100) / 100 }

// ---------------------------------------------------------------- cache

// Cached membungkus provider dengan cache TTL dan menggabungkan permintaan identik.
type Cached struct {
	P   Provider
	TTL time.Duration
	mu  sync.Mutex
	m   map[string]entry
	now func() time.Time
}

type entry struct {
	v   any
	exp time.Time
}

func NewCached(p Provider, ttl time.Duration) *Cached {
	return &Cached{P: p, TTL: ttl, m: map[string]entry{}, now: time.Now}
}

func (c *Cached) get(key string) (any, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok || c.now().After(e.exp) {
		return nil, false
	}
	return e.v, true
}

func (c *Cached) put(key string, v any) {
	c.mu.Lock()
	c.m[key] = entry{v: v, exp: c.now().Add(c.TTL)}
	c.mu.Unlock()
}

type freshKey struct{}

// WithFresh menandai permintaan agar melewati cache (uji koneksi dari panel admin).
// Jeda kuota (429) tetap dihormati.
func WithFresh(ctx context.Context) context.Context { return context.WithValue(ctx, freshKey{}, true) }

func fresh(ctx context.Context) bool { v, _ := ctx.Value(freshKey{}).(bool); return v }

func (c *Cached) Quote(ctx context.Context, ps string) (Quote, error) {
	if v, ok := c.get("q:" + ps); ok && !fresh(ctx) {
		return v.(Quote), nil
	}
	q, err := c.P.Quote(ctx, ps)
	if err == nil {
		c.put("q:"+ps, q)
	}
	return q, err
}

func (c *Cached) Quotes(ctx context.Context, pss []string) (map[string]Quote, error) {
	out := make(map[string]Quote, len(pss))
	var miss []string
	for _, ps := range pss {
		if v, ok := c.get("q:" + ps); ok && !fresh(ctx) {
			out[ps] = v.(Quote)
			continue
		}
		miss = append(miss, ps)
	}
	if len(miss) == 0 {
		return out, nil
	}
	if bq, ok := c.P.(BatchQuoter); ok {
		m, err := bq.Quotes(ctx, miss)
		for ps, q := range m {
			c.put("q:"+ps, q)
			out[ps] = q
		}
		return out, err
	}
	for _, ps := range miss {
		q, err := c.Quote(ctx, ps)
		if err == nil {
			out[ps] = q
		}
	}
	return out, nil
}

func (c *Cached) Candles(ctx context.Context, ps, interval string, n int) ([]Candle, error) {
	key := fmt.Sprintf("c:%s:%s:%d", ps, interval, n)
	if v, ok := c.get(key); ok {
		return v.([]Candle), nil
	}
	cs, err := c.P.Candles(ctx, ps, interval, n)
	if err == nil {
		c.put(key, cs)
	}
	return cs, err
}
