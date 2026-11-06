package calendar

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestFinnhubEconomic(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/calendar/economic" {
			t.Errorf("path %s", r.URL.Path)
		}
		if r.URL.Query().Get("token") != "test-key" {
			t.Errorf("token %q", r.URL.Query().Get("token"))
		}
		if r.Header.Get("X-Finnhub-Token") != "test-key" {
			t.Errorf("header %q", r.Header.Get("X-Finnhub-Token"))
		}
		if r.URL.Query().Get("from") != "2026-11-02" || r.URL.Query().Get("to") != "2026-11-08" {
			t.Errorf("from/to %q %q", r.URL.Query().Get("from"), r.URL.Query().Get("to"))
		}
		_, _ = w.Write([]byte(`{"economicCalendar":[
			{"actual":165,"prev":60,"country":"US","unit":"K","estimate":65,"event":"Non Farm Payrolls","impact":"high","time":"2026-11-06 13:30:00"},
			{"actual":null,"prev":4.2,"country":"US","unit":"%","estimate":4.2,"event":"Unemployment Rate","impact":"high","time":"2026-11-06 13:30:00"},
			{"actual":51.6,"prev":null,"country":"CN","unit":"","estimate":51.2,"event":"Caixin Manufacturing PMI","impact":"medium","time":"2026-11-03 01:45:00"},
			{"actual":null,"prev":null,"country":"JP","unit":"","estimate":null,"event":"Japan CPI","impact":"low","time":"2026-11-04 00:00:00"},
			{"event":"tanpa waktu","country":"US","impact":"low","time":""}
		]}`))
	}))
	defer srv.Close()

	f := NewFinnhub("test-key")
	f.BaseURL = srv.URL
	f.HTTP = srv.Client()
	from := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)
	raw, err := f.Economic(context.Background(), from, to, "america,china,indonesia")
	if err != nil {
		t.Fatal(err)
	}
	// JP terfilter (bukan di markets); event tanpa waktu dilewati.
	if len(raw) != 3 {
		t.Fatalf("len=%d %+v", len(raw), raw)
	}
	nfp := raw[0]
	if nfp.Title != "Non Farm Payrolls" || nfp.Country != "US" || nfp.Importance != 1 || nfp.Source != "finnhub" {
		t.Fatalf("%+v", nfp)
	}
	if nfp.Actual == nil || *nfp.Actual != 165 || nfp.Forecast == nil || *nfp.Forecast != 65 {
		t.Fatalf("values %+v", nfp)
	}
	if nfp.ID == "" || nfp.ID[:3] != "fh:" {
		t.Fatalf("id %q", nfp.ID)
	}
	e, err := ToStore(nfp)
	if err != nil {
		t.Fatal(err)
	}
	if e.Source != "finnhub" || e.Impact != "high" || e.Actual == nil || *e.Actual != "165K" {
		t.Fatalf("store %+v", e)
	}
	wantAt := time.Date(2026, 11, 6, 13, 30, 0, 0, time.UTC)
	if !e.ScheduledAt.Equal(wantAt) {
		t.Fatalf("scheduled %v", e.ScheduledAt)
	}
}

func TestFinnhubHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"Invalid API key"}`))
	}))
	defer srv.Close()
	f := NewFinnhub("bad")
	f.BaseURL = srv.URL
	from := time.Now().UTC()
	if _, err := f.Economic(context.Background(), from, from.Add(24*time.Hour), "america"); err == nil {
		t.Fatal("HTTP 401 harus menjadi galat")
	}
}

func TestFinnhubAPIErrorBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"error":"You don't have access to this resource."}`))
	}))
	defer srv.Close()
	f := NewFinnhub("k")
	f.BaseURL = srv.URL
	from := time.Now().UTC()
	_, err := f.Economic(context.Background(), from, from.Add(time.Hour), "")
	if err == nil || err.Error() != "calendar(finnhub): You don't have access to this resource." {
		t.Fatalf("err %v", err)
	}
}

func TestNewSourcePrefersFinnhub(t *testing.T) {
	s := NewSource("fh-key", "auto", "", "")
	if s == nil || s.Mode() != "finnhub" {
		t.Fatalf("%v", s)
	}
	s = NewSource("", "public", "tv", "")
	if s == nil || s.Mode() != "public" {
		t.Fatalf("fallback TV: %v mode=%s", s, func() string {
			if s == nil {
				return ""
			}
			return s.Mode()
		}())
	}
	if NewSource("", "off", "", "") != nil {
		t.Fatal("off → nil")
	}
}

func TestFinnhubExternalIDStable(t *testing.T) {
	at := time.Date(2026, 11, 6, 13, 30, 0, 0, time.UTC)
	a := finnhubExternalID("US", "Non Farm Payrolls", at)
	b := finnhubExternalID("US", "Non Farm Payrolls", at)
	if a != b || a[:3] != "fh:" {
		t.Fatalf("%q %q", a, b)
	}
	if finnhubExternalID("US", "Other", at) == a {
		t.Fatal("id harus berbeda untuk judul berbeda")
	}
}
