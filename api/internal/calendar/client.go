// Package calendar mengambil kalender ekonomi dari TradingView Data API
// (GET /api/calendar/economic — lihat dokumentasi tradingviewapi.com).
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

const defaultBase = "https://api.tradingviewapi.com"

// Client memanggil TradingView Data API (Console Bearer atau RapidAPI).
type Client struct {
	Key     string
	BaseURL string
	HTTP    *http.Client
}

// New membuat klien. base kosong → api.tradingviewapi.com.
func New(key, base string) *Client {
	if base == "" {
		base = defaultBase
	}
	return &Client{Key: key, BaseURL: strings.TrimRight(base, "/"), HTTP: &http.Client{Timeout: 20 * time.Second}}
}

// RawEvent adalah satu baris dari /api/calendar/economic.
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
}

type envelope struct {
	Success bool `json:"success"`
	Data    struct {
		Status string     `json:"status"`
		Result []RawEvent `json:"result"`
	} `json:"data"`
	Msg string `json:"msg"`
}

// Economic mengambil event dalam [from, to) untuk daftar market (kode TradingView, koma).
// Rentang dibatasi 40 hari sesuai dokumentasi API.
func (c *Client) Economic(ctx context.Context, from, to time.Time, markets string) ([]RawEvent, error) {
	if c == nil || c.Key == "" {
		return nil, fmt.Errorf("calendar: kunci API kosong")
	}
	if !to.After(from) {
		return nil, fmt.Errorf("calendar: rentang waktu tidak valid")
	}
	if to.Sub(from) > 40*24*time.Hour {
		to = from.Add(40 * 24 * time.Hour)
	}
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
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("calendar: HTTP %d: %s", res.StatusCode, truncate(string(body), 200))
	}
	var env envelope
	if err := json.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("calendar: JSON tidak valid: %w", err)
	}
	if !env.Success && env.Data.Status != "ok" && len(env.Data.Result) == 0 {
		return nil, fmt.Errorf("calendar: %s", firstNonEmpty(env.Msg, env.Data.Status, "gagal"))
	}
	return env.Data.Result, nil
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
