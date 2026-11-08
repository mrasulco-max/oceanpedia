// Package calendar mengambil kalender ekonomi dari penyedia eksternal.
//
// Sumber (prioritas di NewSource):
//   - XOOMAR GET /api/markets/calendar (https://xoomar.com/markets/api/calendar) — gratis AS, kunci opsional;
//   - TradingView Data API (GET /api/calendar/economic) — butuh TRADINGVIEW_API_KEY;
//   - feed publik TradingView (economic-calendar.tradingview.com/events) — tanpa kunci.
package calendar

import (
	"context"
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
	defaultBase = "https://api.tradingviewapi.com"
	// PublicBase adalah feed kalender yang dipakai widget tradingview.com (tanpa kunci).
	PublicBase = "https://economic-calendar.tradingview.com"

	maxRange    = 40 * 24 * time.Hour
	publicUA    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
	isoMillis   = "2006-01-02T15:04:05.000Z"
	httpTimeout = 10 * time.Second
)

// Sumber kalender (TRADINGVIEW_CALENDAR_SOURCE).
const (
	SourceAuto   = "auto"   // kunci ada → Data API, kosong → feed publik
	SourceAPI    = "api"    // hanya Data API (tanpa kunci → nonaktif)
	SourcePublic = "public" // selalu feed publik
	SourceOff    = "off"    // nonaktif (data seed/DB saja)
)

// Client memanggil Data API (Console Bearer atau RapidAPI) atau, tanpa kunci, feed publik.
type Client struct {
	Key       string
	BaseURL   string
	PublicURL string
	HTTP      *http.Client
}

// New membuat klien. base kosong → api.tradingviewapi.com; key kosong → feed publik.
func New(key, base string) *Client {
	if base == "" {
		base = defaultBase
	}
	return &Client{Key: key, BaseURL: strings.TrimRight(base, "/"), PublicURL: PublicBase, HTTP: &http.Client{Timeout: httpTimeout}}
}

// FromSource membuat klien sesuai TRADINGVIEW_CALENDAR_SOURCE; nil = sync nonaktif.
func FromSource(source, key, base string) *Client {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case SourceOff:
		return nil
	case SourceAPI:
		if key == "" {
			return nil
		}
		return New(key, base)
	case SourcePublic:
		return New("", base)
	default:
		return New(key, base)
	}
}

// Mode: "api" (Data API berkunci) atau "public" (feed tanpa kunci).
func (c *Client) Mode() string {
	if c != nil && c.Key != "" {
		return "api"
	}
	return "public"
}

// Source adalah penyedia kalender (Xoomar atau TradingView).
type Source interface {
	Economic(ctx context.Context, from, to time.Time, markets string) ([]RawEvent, error)
	Mode() string
}

// RawEvent adalah bentuk normal internal (Xoomar + TV dipetakan ke sini).
type RawEvent struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	Country    string   `json:"country"`
	Date       string   `json:"date"`
	Importance int      `json:"importance"`
	Actual     *float64 `json:"actual"`
	Previous   *float64 `json:"previous"`
	Forecast   *float64 `json:"forecast"`
	Unit       string   `json:"unit"`
	Scale      string   `json:"scale"`
	Currency   string   `json:"currency"`
	Source     string   `json:"-"` // xoomar | tradingview
}

// XoomarCalendar: XOOMAR_CALENDAR=auto|on|off (default auto/on → pakai Xoomar).
const (
	XoomarAuto = "auto"
	XoomarOn   = "on"
	XoomarOff  = "off"
)

// NewSource memilih penyedia: Xoomar (default) → TradingView (FromSource) bila XOOMAR_CALENDAR=off.
func NewSource(xoomarKey, xoomarMode, tvSource, tvKey, tvBase string) Source {
	switch strings.ToLower(strings.TrimSpace(xoomarMode)) {
	case XoomarOff:
		// jatuh ke TradingView
	default: // auto | on | kosong
		return NewXoomar(xoomarKey)
	}
	// Hindari interface non-nil berisi *Client(nil).
	c := FromSource(tvSource, tvKey, tvBase)
	if c == nil {
		return nil
	}
	return c
}

type result struct {
	Status string     `json:"status"`
	Result []RawEvent `json:"result"`
}

// envelope: Data API membungkus hasil di "data"; feed publik mengirim {status, result} langsung.
type envelope struct {
	Success bool    `json:"success"`
	Data    *result `json:"data"`
	Msg     string  `json:"msg"`
	result
}

// Economic mengambil event dalam [from, to) untuk daftar market (kode TradingView, koma).
// Rentang dibatasi 40 hari sesuai dokumentasi API.
func (c *Client) Economic(ctx context.Context, from, to time.Time, markets string) ([]RawEvent, error) {
	if c == nil {
		return nil, fmt.Errorf("calendar: klien nil")
	}
	if !to.After(from) {
		return nil, fmt.Errorf("calendar: rentang waktu tidak valid")
	}
	if to.Sub(from) > maxRange {
		to = from.Add(maxRange)
	}
	var (
		req *http.Request
		err error
	)
	if c.Key != "" {
		req, err = c.apiRequest(ctx, from, to, markets)
	} else {
		req, err = c.publicRequest(ctx, from, to, markets)
	}
	if err != nil {
		return nil, err
	}
	hc := c.HTTP
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
		return nil, fmt.Errorf("calendar(%s): HTTP %d: %s", c.Mode(), res.StatusCode, truncate(string(body), 200))
	}
	return decode(body)
}

func (c *Client) apiRequest(ctx context.Context, from, to time.Time, markets string) (*http.Request, error) {
	q := url.Values{}
	q.Set("from", strconv.FormatInt(from.UTC().Unix(), 10))
	q.Set("to", strconv.FormatInt(to.UTC().Unix(), 10))
	if markets = strings.TrimSpace(markets); markets != "" {
		q.Set("market", markets)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/api/calendar/economic?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	c.applyAuth(req)
	return req, nil
}

func (c *Client) publicRequest(ctx context.Context, from, to time.Time, markets string) (*http.Request, error) {
	base := strings.TrimRight(c.PublicURL, "/")
	if base == "" {
		base = PublicBase
	}
	q := url.Values{}
	q.Set("from", from.UTC().Format(isoMillis))
	q.Set("to", to.UTC().Format(isoMillis))
	if cc := Countries(markets); cc != "" {
		q.Set("countries", cc)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/events?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	// Tanpa Origin/Referer tradingview.com feed menjawab 403.
	req.Header.Set("Origin", "https://www.tradingview.com")
	req.Header.Set("Referer", "https://www.tradingview.com/")
	req.Header.Set("User-Agent", publicUA)
	req.Header.Set("Accept", "application/json")
	return req, nil
}

func decode(body []byte) ([]RawEvent, error) {
	var env envelope
	if err := json.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("calendar: JSON tidak valid: %w", err)
	}
	r := env.result
	if env.Data != nil {
		r = *env.Data
	}
	if !env.Success && r.Status != "ok" && len(r.Result) == 0 {
		return nil, fmt.Errorf("calendar: %s", firstNonEmpty(env.Msg, r.Status, "gagal"))
	}
	return r.Result, nil
}

// marketCountry memetakan kode market Data API ke kode negara feed publik.
var marketCountry = map[string]string{
	"america": "US", "usa": "US", "us": "US",
	"china": "CN", "indonesia": "ID",
	"euro": "EU", "europe": "EU", "eurozone": "EU",
	"japan": "JP", "uk": "GB", "united_kingdom": "GB",
	"germany": "DE", "france": "FR", "italy": "IT", "spain": "ES",
	"canada": "CA", "australia": "AU", "new_zealand": "NZ", "switzerland": "CH",
	"india": "IN", "korea": "KR", "south_korea": "KR", "singapore": "SG",
	"malaysia": "MY", "thailand": "TH", "philippines": "PH", "vietnam": "VN",
	"hongkong": "HK", "hong_kong": "HK", "taiwan": "TW", "brazil": "BR", "mexico": "MX",
}

// Countries mengubah "america,china,indonesia" → "US,CN,ID" (kode 2 huruf diteruskan apa adanya).
func Countries(markets string) string {
	seen := map[string]bool{}
	out := []string{}
	for _, m := range strings.Split(markets, ",") {
		m = strings.ToLower(strings.TrimSpace(m))
		if m == "" {
			continue
		}
		cc, ok := marketCountry[m]
		if !ok && len(m) == 2 {
			cc, ok = strings.ToUpper(m), true
		}
		if ok && !seen[cc] {
			seen[cc] = true
			out = append(out, cc)
		}
	}
	return strings.Join(out, ",")
}

func (c *Client) applyAuth(req *http.Request) {
	host := req.URL.Host
	if strings.Contains(host, "rapidapi.com") {
		req.Header.Set("x-rapidapi-key", c.Key)
		req.Header.Set("x-rapidapi-host", host)
		return
	}
	req.Header.Set("Authorization", "Bearer "+c.Key)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func firstNonEmpty(ss ...string) string {
	for _, s := range ss {
		if strings.TrimSpace(s) != "" {
			return s
		}
	}
	return ""
}
