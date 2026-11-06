package calendar

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	finnhubBase = "https://finnhub.io/api/v1"
	// Finnhub docs: from/to opsional (YYYY-MM-DD). Batas jendela lokal agar sync tidak membengkak.
	finnhubMaxRange = 90 * 24 * time.Hour
)

// Finnhub memanggil GET /calendar/economic (https://finnhub.io/docs/api/economic-calendar).
// Auth: query token=… atau header X-Finnhub-Token (keduanya didukung Finnhub).
type Finnhub struct {
	Key     string
	BaseURL string
	HTTP    *http.Client
}

// NewFinnhub membuat klien. key wajib; base kosong → https://finnhub.io/api/v1.
func NewFinnhub(key string) *Finnhub {
	return &Finnhub{
		Key:     strings.TrimSpace(key),
		BaseURL: finnhubBase,
		HTTP:    &http.Client{Timeout: httpTimeout},
	}
}

func (f *Finnhub) Mode() string { return "finnhub" }

type fhEvent struct {
	Actual   *float64 `json:"actual"`
	Prev     *float64 `json:"prev"`
	Country  string   `json:"country"`
	Unit     string   `json:"unit"`
	Estimate *float64 `json:"estimate"`
	Event    string   `json:"event"`
	Impact   string   `json:"impact"`
	Time     string   `json:"time"`
}

type fhEnvelope struct {
	EconomicCalendar []fhEvent `json:"economicCalendar"`
	Error            string    `json:"error"`
}

// Economic mengambil rilis ekonomi Finnhub untuk [from, to), lalu filter negara dari markets.
func (f *Finnhub) Economic(ctx context.Context, from, to time.Time, markets string) ([]RawEvent, error) {
	if f == nil || f.Key == "" {
		return nil, fmt.Errorf("calendar: kunci Finnhub kosong")
	}
	if !to.After(from) {
		return nil, fmt.Errorf("calendar: rentang waktu tidak valid")
	}
	if to.Sub(from) > finnhubMaxRange {
		to = from.Add(finnhubMaxRange)
	}
	q := url.Values{}
	q.Set("from", from.UTC().Format("2006-01-02"))
	// Finnhub "to" inklusif; API internal memakai [from, to) → kirim hari terakhir yang termasuk.
	q.Set("to", to.UTC().Add(-time.Nanosecond).Format("2006-01-02"))
	q.Set("token", f.Key)

	base := strings.TrimRight(f.BaseURL, "/")
	if base == "" {
		base = finnhubBase
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/calendar/economic?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Finnhub-Token", f.Key)
	req.Header.Set("Accept", "application/json")

	hc := f.HTTP
	if hc == nil {
		hc = &http.Client{Timeout: httpTimeout}
	}
	res, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("calendar(finnhub): HTTP %d: %s", res.StatusCode, truncate(string(body), 200))
	}
	var env fhEnvelope
	if err := json.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("calendar(finnhub): JSON tidak valid: %w", err)
	}
	if env.Error != "" {
		return nil, fmt.Errorf("calendar(finnhub): %s", env.Error)
	}

	want := countrySet(markets)
	out := make([]RawEvent, 0, len(env.EconomicCalendar))
	for _, e := range env.EconomicCalendar {
		r, err := finnhubToRaw(e)
		if err != nil {
			continue
		}
		if len(want) > 0 && !want[r.Country] {
			continue
		}
		// Jaga jendela [from, to) meski Finnhub mengembalikan tepi hari.
		at, err := time.Parse(time.RFC3339Nano, r.Date)
		if err != nil {
			continue
		}
		if at.Before(from.UTC()) || !at.Before(to.UTC()) {
			continue
		}
		out = append(out, r)
	}
	return out, nil
}

func finnhubToRaw(e fhEvent) (RawEvent, error) {
	title := strings.TrimSpace(e.Event)
	country := strings.ToUpper(strings.TrimSpace(e.Country))
	tm := strings.TrimSpace(e.Time)
	if title == "" || country == "" || tm == "" {
		return RawEvent{}, fmt.Errorf("event tidak lengkap")
	}
	// Docs / contoh: "2020-06-02 01:30:00" (UTC).
	at, err := time.ParseInLocation("2006-01-02 15:04:05", tm, time.UTC)
	if err != nil {
		at, err = time.Parse(time.RFC3339Nano, tm)
	}
	if err != nil {
		at, err = time.Parse(time.RFC3339, tm)
	}
	if err != nil {
		return RawEvent{}, err
	}
	unit, scale := splitFinnhubUnit(e.Unit)
	return RawEvent{
		ID:         finnhubExternalID(country, title, at),
		Title:      title,
		Country:    country,
		Date:       at.UTC().Format(time.RFC3339Nano),
		Importance: importanceFromImpact(e.Impact),
		Actual:     e.Actual,
		Previous:   e.Prev,
		Forecast:   e.Estimate,
		Unit:       unit,
		Scale:      scale,
		Source:     "finnhub",
	}, nil
}

// splitFinnhubUnit: Finnhub sering menaruh skala (K/M/B) di field unit, bukan unit mata uang.
func splitFinnhubUnit(u string) (unit, scale string) {
	u = strings.TrimSpace(u)
	switch strings.ToUpper(u) {
	case "K", "M", "B", "T":
		return "", strings.ToUpper(u)
	default:
		return u, ""
	}
}

func importanceFromImpact(s string) int {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "high":
		return 1
	case "medium":
		return 0
	case "low":
		return -1
	default:
		return 0
	}
}

// finnhubExternalID stabil antar sync (Finnhub tidak memberi id event).
func finnhubExternalID(country, title string, at time.Time) string {
	h := sha1.Sum([]byte(country + "|" + title + "|" + at.UTC().Format(time.RFC3339)))
	return "fh:" + hex.EncodeToString(h[:12])
}

func countrySet(markets string) map[string]bool {
	cc := Countries(markets)
	if cc == "" {
		return nil
	}
	out := map[string]bool{}
	for _, c := range strings.Split(cc, ",") {
		if c = strings.TrimSpace(c); c != "" {
			out[c] = true
		}
	}
	return out
}
