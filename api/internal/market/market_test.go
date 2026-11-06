package market

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type countP struct{ n int }

func (c *countP) Quote(context.Context, string) (Quote, error) {
	c.n++
	return Quote{Price: float64(c.n)}, nil
}
func (c *countP) Candles(context.Context, string, string, int) ([]Candle, error) {
	c.n++
	return nil, nil
}

func TestCachedTTL(t *testing.T) {
	p := &countP{}
	c := NewCached(p, time.Minute)
	now := time.Unix(0, 0)
	c.now = func() time.Time { return now }
	a, _ := c.Quote(context.Background(), "X")
	b, _ := c.Quote(context.Background(), "X")
	if a.Price != 1 || b.Price != 1 || p.n != 1 {
		t.Fatalf("cache tidak dipakai: %v %v %d", a, b, p.n)
	}
	now = now.Add(2 * time.Minute)
	d, _ := c.Quote(context.Background(), "X")
	if d.Price != 2 {
		t.Fatal("cache seharusnya kedaluwarsa")
	}
}

func TestTwelveDataQuote(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("symbol") != "BBCA" || r.URL.Query().Get("exchange") != "IDX" || r.URL.Query().Get("apikey") != "k" {
			t.Errorf("query salah: %s", r.URL.RawQuery)
		}
		_, _ = w.Write([]byte(`{"symbol":"BBCA","datetime":"2026-10-28","open":"10025","high":"10150","low":"9990","close":"10125","volume":"86200000","previous_close":"10013","change":"112","percent_change":"1.12","fifty_two_week":{"low":"8650","high":"10400"}}`))
	}))
	defer srv.Close()
	td := NewTwelveData("k")
	td.BaseURL = srv.URL
	q, err := td.Quote(context.Background(), "BBCA:IDX")
	if err != nil || q.Price != 10125 || q.ChangePercent != 1.12 || q.Week52High != 10400 {
		t.Fatalf("%v %+v", err, q)
	}
}

func TestTwelveDataError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"code":401,"message":"invalid api key","status":"error"}`))
	}))
	defer srv.Close()
	td := NewTwelveData("bad")
	td.BaseURL = srv.URL
	if _, err := td.Quote(context.Background(), "BTC/USD"); err == nil {
		t.Fatal("seharusnya error")
	}
}

func TestTwelveDataQuotesBatch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("symbol") != "AAPL,XAU/USD,XBR/USD" {
			t.Errorf("symbol %q", r.URL.Query().Get("symbol"))
		}
		_, _ = w.Write([]byte(`{
			"AAPL":{"symbol":"AAPL","datetime":"2026-11-06","timestamp":1762387200,"last_quote_at":1762431018,"close":"345.12","previous_close":"344.15","change":"0.97","percent_change":"0.28","open":"344","high":"346","low":"343","volume":"100","is_market_open":true,"fifty_two_week":{"low":"160","high":"350"}},
			"XAU/USD":{"symbol":"XAU/USD","datetime":"2026-11-06","timestamp":1762387200,"last_quote_at":1762431018,"close":"4061.4","previous_close":"4114","change":"-52.6","percent_change":"-1.28","open":"4110","high":"4115","low":"4028","volume":"0","is_market_open":true,"fifty_two_week":{"low":"3800","high":"5600"}},
			"XBR/USD":{"symbol":"XBR/USD","status":"error","code":404,"message":"not found"}
		}`))
	}))
	defer srv.Close()
	td := NewTwelveData("k")
	td.BaseURL = srv.URL
	m, err := td.Quotes(context.Background(), []string{"AAPL", "XAU/USD", "XBR/USD"})
	if err != nil {
		t.Fatal(err)
	}
	if m["AAPL"].Price != 345.12 || m["AAPL"].MarketOpen == nil || !*m["AAPL"].MarketOpen {
		t.Fatalf("AAPL %+v", m["AAPL"])
	}
	if m["XAU/USD"].Price != 4061.4 {
		t.Fatalf("XAU %+v", m["XAU/USD"])
	}
	if _, ok := m["XBR/USD"]; ok {
		t.Fatal("XBR error tidak boleh masuk map")
	}
}

func TestTwelveDataQuoteTimestamp(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"symbol":"AAPL","datetime":"2026-11-06","timestamp":1762387200,"last_quote_at":1762431018,"close":"100","previous_close":"99","change":"1","percent_change":"1.01","open":"99","high":"101","low":"98","volume":"1","average_volume":"2","is_market_open":false,"fifty_two_week":{"low":"80","high":"120"}}`))
	}))
	defer srv.Close()
	td := NewTwelveData("k")
	td.BaseURL = srv.URL
	q, err := td.Quote(context.Background(), "AAPL")
	if err != nil {
		t.Fatal(err)
	}
	if q.AsOf.Unix() != 1762431018 || q.AvgVolume != 2 || q.MarketOpen == nil || *q.MarketOpen {
		t.Fatalf("%+v", q)
	}
}

func TestSampleCandles(t *testing.T) {
	cs, err := Sample{}.Candles(context.Background(), "BBCA:IDX", "1day", 60)
	if err != nil || len(cs) != 60 || cs[59].Close != 10125 || !cs[0].Time.Before(cs[59].Time) {
		t.Fatalf("%v %d", err, len(cs))
	}
}
