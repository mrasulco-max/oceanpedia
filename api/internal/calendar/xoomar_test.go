package calendar

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestXoomarEconomic(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/markets/calendar" {
			t.Errorf("path %s", r.URL.Path)
		}
		if r.Header.Get("X-API-Key") != "xm_test" {
			t.Errorf("api key %q", r.Header.Get("X-API-Key"))
		}
		if r.URL.Query().Get("from") != "2026-11-02" || r.URL.Query().Get("to") != "2026-11-08" {
			t.Errorf("from/to %q %q", r.URL.Query().Get("from"), r.URL.Query().Get("to"))
		}
		_, _ = w.Write([]byte(`{"data":[
			{"source":"bls","eventName":"Nonfarm Payrolls (Employment Situation)","importance":"high","scheduledAt":"2026-11-06T13:30:00.000Z","periodLabel":"October 2026","previous":"60.0000","forecast":null,"actual":"165.0000","unit":"thousands, monthly change"},
			{"source":"bls","eventName":"CPI (Consumer Price Index)","importance":"med","scheduledAt":"2026-11-10T13:30:00.000Z","previous":null,"forecast":null,"actual":null,"unit":"% y/y, all items"},
			{"source":"dol","eventName":"Initial Jobless Claims","importance":"high","scheduledAt":"2026-11-05T13:30:00.000Z","previous":"195.0000","forecast":null,"actual":"189.0000","unit":"thousands, week ending Saturday"},
			{"source":"bls","eventName":"tanpa waktu","importance":"low","scheduledAt":"","actual":null,"previous":null,"unit":null}
		],"updatedAt":"2026-11-06T13:32:00.339Z"}`))
	}))
	defer srv.Close()

	x := NewXoomar("xm_test")
	x.BaseURL = srv.URL
	x.HTTP = srv.Client()
	from := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)
	raw, err := x.Economic(context.Background(), from, to, "america,china,indonesia")
	if err != nil {
		t.Fatal(err)
	}
	// CPI 10 Nov di luar [from,to); event tanpa waktu dilewati → 2 event.
	if len(raw) != 2 {
		t.Fatalf("len=%d %+v", len(raw), raw)
	}
	var nfp RawEvent
	for _, r := range raw {
		if strings.Contains(r.Title, "Nonfarm") {
			nfp = r
		}
	}
	if nfp.Title == "" || nfp.Country != "US" || nfp.Importance != 1 || nfp.Source != "xoomar" {
		t.Fatalf("%+v", nfp)
	}
	if nfp.Actual == nil || *nfp.Actual != 165 || nfp.Previous == nil || *nfp.Previous != 60 {
		t.Fatalf("values %+v", nfp)
	}
	if nfp.Scale != "K" || nfp.ID == "" || !strings.HasPrefix(nfp.ID, "xm:") {
		t.Fatalf("scale/id %+v", nfp)
	}
	e, err := ToStore(nfp)
	if err != nil {
		t.Fatal(err)
	}
	if e.Source != "xoomar" || e.Impact != "high" || e.Actual == nil || *e.Actual != "165K" {
		t.Fatalf("store %+v actual=%v", e, e.Actual)
	}
}

func TestXoomarImportanceMed(t *testing.T) {
	if importanceFromXoomar("med") != 0 {
		t.Fatal("med → 0")
	}
	e, err := ToStore(RawEvent{
		ID: "xm:test", Title: "CPI", Country: "US",
		Date:       time.Date(2026, 11, 10, 13, 30, 0, 0, time.UTC).Format(time.RFC3339Nano),
		Importance: 0, Unit: "%", Source: "xoomar",
	})
	if err != nil {
		t.Fatal(err)
	}
	if e.Impact != "medium" {
		t.Fatalf("impact=%q", e.Impact)
	}
}

func TestXoomarMarketsWithoutUS(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer srv.Close()
	x := NewXoomar("")
	x.BaseURL = srv.URL
	from := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	out, err := x.Economic(context.Background(), from, from.AddDate(0, 0, 7), "china,indonesia")
	if err != nil || len(out) != 0 || called {
		t.Fatalf("harus skip request tanpa US: err=%v n=%d called=%v", err, len(out), called)
	}
}

func TestXoomarHTTP429(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"rate limited"}`))
	}))
	defer srv.Close()
	x := NewXoomar("")
	x.BaseURL = srv.URL
	from := time.Now().UTC()
	if _, err := x.Economic(context.Background(), from, from.Add(24*time.Hour), "america"); err == nil {
		t.Fatal("HTTP 429 harus menjadi galat")
	}
}

func TestNewSourcePrefersTradingView(t *testing.T) {
	s := NewSource("", "auto", "auto", "", "")
	if f, ok := s.(*Fallback); !ok || s.Mode() != "public" || f.Secondary.Mode() != "xoomar" {
		t.Fatalf("auto → TV publik + cadangan Xoomar, got %v", s)
	}
	s = NewSource("xm_key", "on", "public", "tv", "")
	if s == nil || s.Mode() != "xoomar" {
		t.Fatal("on → xoomar utama")
	}
	if s := NewSource("", "auto", "off", "", ""); s == nil || s.Mode() != "xoomar" {
		t.Fatal("TV off → xoomar saja")
	}
	s = NewSource("", "off", "public", "", "")
	if s == nil || s.Mode() != "public" {
		t.Fatalf("XOOMAR off → TV public, got %v", s)
	}
	if NewSource("", "off", "off", "", "") != nil {
		t.Fatal("keduanya off → nil")
	}
}

func TestXoomarExternalIDStable(t *testing.T) {
	at := time.Date(2026, 11, 6, 13, 30, 0, 0, time.UTC)
	a := xoomarExternalID("Nonfarm Payrolls", at)
	b := xoomarExternalID("Nonfarm Payrolls", at)
	if a != b || !strings.HasPrefix(a, "xm:") {
		t.Fatalf("%q %q", a, b)
	}
}
