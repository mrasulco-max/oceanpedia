package calendar

import (
	"encoding/json"
	"testing"
	"time"
)

func TestImpactFromImportance(t *testing.T) {
	cases := map[int]string{-1: "low", -2: "low", 0: "medium", 1: "high", 2: "high", 3: "high"}
	for n, want := range cases {
		if got := ImpactFromImportance(n); got != want {
			t.Fatalf("importance %d: got %q want %q", n, got, want)
		}
	}
}

func TestFormatValue(t *testing.T) {
	v := 0.6
	got := FormatValue(&v, "%", "")
	if got == nil || *got != "0,6%" {
		t.Fatalf("percent: got %#v", got)
	}
	n := 39.0
	got = FormatValue(&n, "", "K")
	if got == nil || *got != "39K" {
		t.Fatalf("scale K: got %#v", got)
	}
	if FormatValue(nil, "%", "") != nil {
		t.Fatal("nil in → nil out")
	}
}

func TestToStoreDocsSample(t *testing.T) {
	const sample = `{
		"id": "397925",
		"title": "Retail Sales MoM",
		"country": "US",
		"actual": null,
		"previous": 0.6,
		"forecast": 1.4,
		"unit": "%",
		"importance": 1,
		"date": "2026-04-21T12:30:00.000Z"
	}`
	var r RawEvent
	if err := json.Unmarshal([]byte(sample), &r); err != nil {
		t.Fatal(err)
	}
	e, err := ToStore(r)
	if err != nil {
		t.Fatal(err)
	}
	if e.ExternalID != "397925" || e.Country != "US" || e.Title != "Retail Sales MoM" || e.Impact != "high" || e.Source != "tradingview" {
		t.Fatalf("fields: %+v", e)
	}
	if e.Forecast == nil || *e.Forecast != "1,4%" {
		t.Fatalf("forecast: %#v", e.Forecast)
	}
	if e.Previous == nil || *e.Previous != "0,6%" {
		t.Fatalf("previous: %#v", e.Previous)
	}
	if e.Actual != nil {
		t.Fatalf("actual should be nil, got %#v", e.Actual)
	}
	want := time.Date(2026, 4, 21, 12, 30, 0, 0, time.UTC)
	if !e.ScheduledAt.Equal(want) {
		t.Fatalf("scheduled: %v", e.ScheduledAt)
	}
}

func TestParseEnvelope(t *testing.T) {
	const body = `{"success":true,"data":{"status":"ok","result":[{"id":"1","title":"CPI","country":"US","importance":-1,"date":"2026-01-02T00:00:00.000Z"}]},"msg":"Success"}`
	var env envelope
	if err := json.Unmarshal([]byte(body), &env); err != nil {
		t.Fatal(err)
	}
	if !env.Success || len(env.Data.Result) != 1 || env.Data.Result[0].Title != "CPI" {
		t.Fatalf("%+v", env)
	}
}
