package market

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBinancePair(t *testing.T) {
	cases := map[string]string{"BTC/USD": "BTCUSDT", "SOL/USD": "SOLUSDT", "XAU/USD": "", "USD/IDR": "", "BBCA:IDX": "", "ETH/BTC": ""}
	for in, want := range cases {
		if got := BinancePair(in); got != want {
			t.Errorf("BinancePair(%q) = %q, mau %q", in, got, want)
		}
	}
}

func TestBinanceQuoteCandles(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v3/ticker/24hr":
			_, _ = w.Write([]byte(`{"symbol":"BTCUSDT","priceChange":"-100.5","priceChangePercent":"-0.13","openPrice":"77100.5","highPrice":"78000","lowPrice":"76500","lastPrice":"77000","volume":"1234.5","closeTime":1793401262772}`))
		case "/api/v3/klines":
			_, _ = w.Write([]byte(`[[1793000000000,"70000","80000","60000","75000","10",0],[1793600000000,"75000","82000","65000","77000","12",0]]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	b := &Binance{BaseURL: srv.URL, HTTP: srv.Client()}
	q, err := b.Quote(context.Background(), "BTC/USD")
	if err != nil {
		t.Fatal(err)
	}
	if q.Price != 77000 || q.Change != -100.5 || q.PrevClose != 77100.5 || q.Week52Low != 60000 || q.Week52High != 82000 || q.Source != "binance" {
		t.Fatalf("quote salah: %+v", q)
	}
	cs, err := b.Candles(context.Background(), "BTC/USD", "1min", 2)
	if err != nil || len(cs) != 2 || cs[1].Close != 77000 {
		t.Fatalf("candles salah: %v %+v", err, cs)
	}
	if _, err := b.Quote(context.Background(), "XAU/USD"); !Permanent(err) {
		t.Fatalf("XAU/USD harus ditolak permanen: %v", err)
	}
}

type tagP struct{ name string }

func (p tagP) Quote(context.Context, string) (Quote, error) { return Quote{Source: p.name}, nil }
func (p tagP) Candles(context.Context, string, string, int) ([]Candle, error) {
	return []Candle{{Volume: 1}}, nil
}

func TestRouter(t *testing.T) {
	r := Router{Crypto: tagP{"binance"}, Default: tagP{"td"}}
	for ps, want := range map[string]string{"BTC/USD": "binance", "XAU/USD": "td", "EUR/IDR": "td"} {
		if q, _ := r.Quote(context.Background(), ps); q.Source != want {
			t.Errorf("%s → %s, mau %s", ps, q.Source, want)
		}
	}
}
