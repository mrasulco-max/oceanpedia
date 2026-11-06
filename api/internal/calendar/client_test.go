package calendar

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClientEconomicConsoleAuth(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		if r.URL.Path != "/api/calendar/economic" {
			t.Errorf("path %s", r.URL.Path)
		}
		if r.URL.Query().Get("market") != "america,china" {
			t.Errorf("market %s", r.URL.Query().Get("market"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"status":"ok","result":[{"id":"9","title":"CPI","country":"US","importance":1,"date":"2026-05-01T12:00:00.000Z","previous":0.2,"unit":"%"}]},"msg":"Success"}`))
	}))
	defer srv.Close()

	c := New("test-key", srv.URL)
	c.HTTP = srv.Client()
	from := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	out, err := c.Economic(context.Background(), from, from.Add(24*time.Hour), "america,china")
	if err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer test-key" {
		t.Fatalf("auth %q", gotAuth)
	}
	if len(out) != 1 || out[0].ID != "9" {
		t.Fatalf("%+v", out)
	}
}

func TestClientEconomicRapidAPI(t *testing.T) {
	var host, key string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host = r.Header.Get("x-rapidapi-host")
		key = r.Header.Get("x-rapidapi-key")
		_, _ = w.Write([]byte(`{"success":true,"data":{"status":"ok","result":[]}}`))
	}))
	defer srv.Close()

	// Simulate RapidAPI host by using server URL that contains rapidapi.com is hard with httptest;
	// call applyAuth directly via Economic after rewriting BaseURL host check — use custom RoundTrip.
	c := New("rapid-key", "https://tradingview-data1.p.rapidapi.com")
	c.HTTP = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		host = req.Header.Get("x-rapidapi-host")
		key = req.Header.Get("x-rapidapi-key")
		req.URL.Scheme = "http"
		req.URL.Host = srv.Listener.Addr().String()
		return http.DefaultTransport.RoundTrip(req)
	})}
	from := time.Now().UTC()
	_, err := c.Economic(context.Background(), from, from.Add(time.Hour), "")
	if err != nil {
		t.Fatal(err)
	}
	if key != "rapid-key" || host != "tradingview-data1.p.rapidapi.com" {
		t.Fatalf("rapid headers key=%q host=%q", key, host)
	}
}

func TestClientEconomicPublicFeed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/events" {
			t.Errorf("path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "" {
			t.Errorf("feed publik tidak boleh mengirim Authorization")
		}
		if r.Header.Get("Origin") != "https://www.tradingview.com" || r.Header.Get("Referer") != "https://www.tradingview.com/" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		q := r.URL.Query()
		if q.Get("countries") != "US,CN,ID" {
			t.Errorf("countries %q", q.Get("countries"))
		}
		if q.Get("from") != "2026-11-01T17:00:00.000Z" || q.Get("to") != "2026-11-08T17:00:00.000Z" {
			t.Errorf("from/to %q %q", q.Get("from"), q.Get("to"))
		}
		_, _ = w.Write([]byte(`{"status":"ok","result":[{"id":"381237","title":"Non Farm Payrolls","country":"US","importance":1,"date":"2026-11-06T13:30:00.000Z","actual":165,"forecast":65,"previous":60,"scale":"K"}]}`))
	}))
	defer srv.Close()

	c := New("", "")
	c.PublicURL = srv.URL
	c.HTTP = srv.Client()
	from := time.Date(2026, 11, 1, 17, 0, 0, 0, time.UTC)
	out, err := c.Economic(context.Background(), from, from.AddDate(0, 0, 7), "america,china,indonesia")
	if err != nil {
		t.Fatal(err)
	}
	if c.Mode() != "public" || len(out) != 1 || out[0].Title != "Non Farm Payrolls" || out[0].Actual == nil || *out[0].Actual != 165 {
		t.Fatalf("mode=%s out=%+v", c.Mode(), out)
	}
}

func TestClientEconomicPublicForbidden(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()
	c := New("", "")
	c.PublicURL = srv.URL
	from := time.Now().UTC()
	if _, err := c.Economic(context.Background(), from, from.Add(time.Hour), "america"); err == nil {
		t.Fatal("HTTP 403 harus menjadi galat")
	}
}

func TestDecodeErrorEnvelope(t *testing.T) {
	if _, err := decode([]byte(`{"success":false,"msg":"Invalid API key"}`)); err == nil || err.Error() != "calendar: Invalid API key" {
		t.Fatalf("err %v", err)
	}
	out, err := decode([]byte(`{"status":"ok","result":[]}`))
	if err != nil || len(out) != 0 {
		t.Fatalf("feed publik kosong: %v %v", out, err)
	}
}

func TestCountries(t *testing.T) {
	cases := map[string]string{
		"america,china,indonesia": "US,CN,ID",
		" America , EU ,jp":       "US,EU,JP",
		"america,us,unknownland":  "US",
		"":                        "",
	}
	for in, want := range cases {
		if got := Countries(in); got != want {
			t.Fatalf("Countries(%q)=%q want %q", in, got, want)
		}
	}
}

func TestFromSource(t *testing.T) {
	if c := FromSource("auto", "", ""); c == nil || c.Mode() != "public" {
		t.Fatal("auto tanpa kunci → feed publik")
	}
	if c := FromSource("", "k", ""); c == nil || c.Mode() != "api" {
		t.Fatal("auto dengan kunci → Data API")
	}
	if FromSource("api", "", "") != nil {
		t.Fatal("api tanpa kunci → nonaktif")
	}
	if c := FromSource("public", "k", ""); c == nil || c.Mode() != "public" {
		t.Fatal("public selalu feed publik")
	}
	if FromSource("off", "k", "") != nil {
		t.Fatal("off → nonaktif")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
