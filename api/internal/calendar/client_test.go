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

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
