package market

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Binance memakai data pasar publik Binance (tanpa API key, tanpa kuota kredit):
// harga kripto real-time dalam pasangan USDT.
type Binance struct {
	BaseURL string
	HTTP    *http.Client
}

func NewBinance() *Binance {
	// data-api.binance.vision: endpoint khusus data pasar, dapat diakses dari semua region.
	return &Binance{BaseURL: "https://data-api.binance.vision", HTTP: &http.Client{Timeout: 8 * time.Second}}
}

// BinancePair memetakan simbol penyedia ("BTC/USD") ke pasangan Binance ("BTCUSDT"); "" bila bukan kripto.
func BinancePair(ps string) string {
	base, quote, ok := strings.Cut(ps, "/")
	if !ok || quote != "USD" || strings.Contains(ps, ":") {
		return ""
	}
	switch base {
	case "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "TON", "AVAX", "LINK", "DOT", "TRX", "LTC", "SHIB":
		return base + "USDT"
	}
	return ""
}

var binanceIV = map[string]string{"1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m", "1h": "1h", "4h": "4h", "1day": "1d", "1week": "1w", "1month": "1M"}

func (b *Binance) get(ctx context.Context, path string, q url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, b.BaseURL+path+"?"+q.Encode(), nil)
	if err != nil {
		return err
	}
	res, err := b.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		var e struct {
			Msg string `json:"msg"`
		}
		_ = json.NewDecoder(res.Body).Decode(&e)
		code := res.StatusCode
		if code == http.StatusTeapot { // 418: IP diblokir sementara karena melampaui batas
			code = 429
		}
		return &APIError{Code: code, Message: "binance: " + e.Msg}
	}
	return json.NewDecoder(res.Body).Decode(out)
}

func pf(s string) float64 { v, _ := strconv.ParseFloat(s, 64); return v }

func (b *Binance) klines(ctx context.Context, pair, iv string, n int) ([]Candle, error) {
	var rows [][]any
	if err := b.get(ctx, "/api/v3/klines", url.Values{"symbol": {pair}, "interval": {iv}, "limit": {strconv.Itoa(n)}}, &rows); err != nil {
		return nil, err
	}
	out := make([]Candle, 0, len(rows))
	for _, r := range rows {
		if len(r) < 6 {
			continue
		}
		ms, _ := r[0].(float64)
		s := func(i int) float64 { v, _ := r[i].(string); return pf(v) }
		out = append(out, Candle{Time: time.UnixMilli(int64(ms)).UTC(), Open: s(1), High: s(2), Low: s(3), Close: s(4), Volume: s(5)})
	}
	return out, nil
}

func (b *Binance) Quote(ctx context.Context, ps string) (Quote, error) {
	pair := BinancePair(ps)
	if pair == "" {
		return Quote{}, &APIError{Code: 404, Message: "binance: simbol tidak didukung"}
	}
	var t struct {
		LastPrice, PriceChange, PriceChangePercent, OpenPrice, HighPrice, LowPrice, PrevClosePrice, Volume string
		CloseTime                                                                                          int64
	}
	if err := b.get(ctx, "/api/v3/ticker/24hr", url.Values{"symbol": {pair}}, &t); err != nil {
		return Quote{}, err
	}
	q := Quote{Price: pf(t.LastPrice), Change: pf(t.PriceChange), ChangePercent: pf(t.PriceChangePercent), Open: pf(t.OpenPrice),
		High: pf(t.HighPrice), Low: pf(t.LowPrice), PrevClose: pf(t.OpenPrice), Volume: pf(t.Volume), AsOf: time.UnixMilli(t.CloseTime).UTC(), Source: "binance"}
	// Rentang 52 minggu dari candle mingguan.
	if w, err := b.klines(ctx, pair, "1w", 52); err == nil && len(w) > 0 {
		q.Week52Low, q.Week52High = w[0].Low, w[0].High
		for _, c := range w {
			q.Week52Low = min(q.Week52Low, c.Low)
			q.Week52High = max(q.Week52High, c.High)
		}
	}
	return q, nil
}

func (b *Binance) Candles(ctx context.Context, ps, interval string, n int) ([]Candle, error) {
	pair := BinancePair(ps)
	iv, ok := binanceIV[interval]
	if pair == "" || !ok {
		return nil, &APIError{Code: 404, Message: fmt.Sprintf("binance: %s %s tidak didukung", ps, interval)}
	}
	return b.klines(ctx, pair, iv, min(n, 1000))
}

// Router mengirim simbol kripto ke Binance dan simbol lain ke penyedia bawaan (Twelve Data).
type Router struct {
	Crypto  Provider
	Default Provider
}

func (r Router) pick(ps string) Provider {
	if r.Crypto != nil && BinancePair(ps) != "" {
		return r.Crypto
	}
	return r.Default
}

func (r Router) Quote(ctx context.Context, ps string) (Quote, error) {
	return r.pick(ps).Quote(ctx, ps)
}
func (r Router) Candles(ctx context.Context, ps, interval string, n int) ([]Candle, error) {
	return r.pick(ps).Candles(ctx, ps, interval, n)
}
