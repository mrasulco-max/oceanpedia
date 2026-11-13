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
	"strconv"
	"strings"
	"time"
)

const (
	xoomarBase = "https://xoomar.com/api"
	// Docs: from/to opsional; batas jendela lokal agar sync tidak membengkak.
	xoomarMaxRange = 90 * 24 * time.Hour
)

// Xoomar memanggil GET /markets/calendar (https://xoomar.com/markets/api/calendar).
// Tanpa kunci: 10 req/menit; opsional X-API-Key menaikkan ke 30/menit.
type Xoomar struct {
	Key     string // opsional
	BaseURL string
	HTTP    *http.Client
}

// NewXoomar membuat klien. key boleh kosong.
func NewXoomar(key string) *Xoomar {
	return &Xoomar{
		Key:     strings.TrimSpace(key),
		BaseURL: xoomarBase,
		HTTP:    &http.Client{Timeout: httpTimeout},
	}
}

func (x *Xoomar) Mode() string { return "xoomar" }

type xmEvent struct {
	Source      string  `json:"source"`
	EventName   string  `json:"eventName"`
	Importance  string  `json:"importance"`
	ScheduledAt string  `json:"scheduledAt"`
	PeriodLabel *string `json:"periodLabel"`
	Previous    *string `json:"previous"`
	Forecast    *string `json:"forecast"`
	Actual      *string `json:"actual"`
	Unit        *string `json:"unit"`
}

type xmEnvelope struct {
	Data  []xmEvent `json:"data"`
	Error string    `json:"error"`
}

// Economic mengambil rilis makro AS dari XOOMAR untuk [from, to).
func (x *Xoomar) Economic(ctx context.Context, from, to time.Time, markets string) ([]RawEvent, error) {
	if x == nil {
		return nil, fmt.Errorf("calendar: klien Xoomar nil")
	}
	if !to.After(from) {
		return nil, fmt.Errorf("calendar: rentang waktu tidak valid")
	}
	if to.Sub(from) > xoomarMaxRange {
		to = from.Add(xoomarMaxRange)
	}
	// Filter markets: Xoomar hanya US — kosongkan hasil bila US tidak diminta.
	if want := countrySet(markets); len(want) > 0 && !want["US"] {
		return nil, nil
	}

	q := url.Values{}
	q.Set("from", from.UTC().Format("2006-01-02"))
	// Xoomar "to" inklusif; API internal memakai [from, to).
	q.Set("to", to.UTC().Add(-time.Nanosecond).Format("2006-01-02"))

	base := strings.TrimRight(x.BaseURL, "/")
	if base == "" {
		base = xoomarBase
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/markets/calendar?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if x.Key != "" {
		req.Header.Set("X-API-Key", x.Key)
	}

	hc := x.HTTP
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
		return nil, fmt.Errorf("calendar(xoomar): HTTP %d: %s", res.StatusCode, truncate(string(body), 200))
	}
	var env xmEnvelope
	if err := json.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("calendar(xoomar): JSON tidak valid: %w", err)
	}
	if env.Error != "" {
		return nil, fmt.Errorf("calendar(xoomar): %s", env.Error)
	}

	out := make([]RawEvent, 0, len(env.Data))
	for _, e := range env.Data {
		r, err := xoomarToRaw(e)
		if err != nil {
			continue
		}
		at, err := time.Parse(time.RFC3339Nano, r.Date)
		if err != nil {
			at, err = time.Parse(time.RFC3339, r.Date)
		}
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

func xoomarToRaw(e xmEvent) (RawEvent, error) {
	title := strings.TrimSpace(e.EventName)
	tm := strings.TrimSpace(e.ScheduledAt)
	if title == "" || tm == "" {
		return RawEvent{}, fmt.Errorf("event tidak lengkap")
	}
	at, err := time.Parse(time.RFC3339Nano, tm)
	if err != nil {
		at, err = time.Parse(time.RFC3339, tm)
	}
	if err != nil {
		return RawEvent{}, err
	}
	unitRaw := ""
	if e.Unit != nil {
		unitRaw = *e.Unit
	}
	unit, scale := splitXoomarUnit(unitRaw)
	return RawEvent{
		ID:         xoomarExternalID(title, at),
		Title:      title,
		Country:    "US",
		Date:       at.UTC().Format(time.RFC3339Nano),
		Importance: importanceFromXoomar(e.Importance),
		Actual:     parseXMNumber(e.Actual),
		Previous:   parseXMNumber(e.Previous),
		Forecast:   parseXMNumber(e.Forecast), // selalu null di docs
		Unit:       unit,
		Scale:      scale,
		Source:     "xoomar",
	}, nil
}

func importanceFromXoomar(s string) int {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "high":
		return 1
	case "med", "medium":
		return 0
	case "low":
		return -1
	default:
		return 0
	}
}

func parseXMNumber(s *string) *float64 {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	v, err := strconv.ParseFloat(t, 64)
	if err != nil {
		return nil
	}
	return &v
}

// splitXoomarUnit: actual/previous string; unit deskriptif ("thousands, …", "% y/y, …").
func splitXoomarUnit(u string) (unit, scale string) {
	u = strings.TrimSpace(u)
	low := strings.ToLower(u)
	switch {
	case strings.Contains(low, "thousand"):
		return "", "K"
	case strings.HasPrefix(low, "%") || strings.Contains(low, "%"):
		return "%", ""
	default:
		return u, ""
	}
}

func xoomarExternalID(title string, at time.Time) string {
	h := sha1.Sum([]byte(title + "|" + at.UTC().Format(time.RFC3339)))
	return "xm:" + hex.EncodeToString(h[:12])
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
