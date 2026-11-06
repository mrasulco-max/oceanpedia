// Package config membaca konfigurasi dari environment (12-factor).
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config adalah seluruh pengaturan runtime API.
type Config struct {
	Addr            string
	Env             string
	DatabaseURL     string
	CORSOrigins     []string
	JWTSecret       []byte
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
	RateLimitRPS    float64
	RunMigrations   bool
	TwelveDataKey   string
	GeminiKey       string
	BirdKey         string
	BirdURL         string
	BirdEmailKey    string
	OTPEmailFrom    string
	SiteURL         string
	GeminiModels    []string
	MarketCacheTTL  time.Duration
	QuoteTTL        time.Duration
	CandleTTL       time.Duration
	MarketSkip      []string
	TaxRate         float64 // PPN, mis. 0.11
	// Midtrans (payment gateway). Server key hanya dari env (rahasia); tidak pernah dikirim ke klien.
	MidtransServerKey  string
	MidtransProduction bool
	APIPublicURL       string // untuk URL notifikasi pembayaran (webhook)
	// Kalender ekonomi: Finnhub diutamakan bila FINNHUB_API_KEY diisi; else TradingView.
	FinnhubAPIKey              string
	TradingViewAPIKey          string
	TradingViewAPIBase         string
	TradingViewCalendarTTL     time.Duration
	TradingViewCalendarMarkets string
	TradingViewCalendarSource  string // auto | api | public | off (hanya jika Finnhub kosong)
}

// Load membaca dan memvalidasi konfigurasi.
func Load() (Config, error) {
	c := Config{
		Addr:            env("API_ADDR", ":8080"),
		Env:             env("API_ENV", "development"),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		CORSOrigins:     splitList(env("API_CORS_ORIGINS", "http://localhost:3000")),
		JWTSecret:       []byte(os.Getenv("API_JWT_SECRET")),
		AccessTokenTTL:  dur("API_ACCESS_TTL", 15*time.Minute),
		RefreshTokenTTL: dur("API_REFRESH_TTL", 30*24*time.Hour),
		RateLimitRPS:    float("API_RATE_LIMIT_RPS", 20),
		RunMigrations:   env("API_RUN_MIGRATIONS", "true") == "true",
		TwelveDataKey:   os.Getenv("TWELVEDATA_API_KEY"),
		GeminiKey:       os.Getenv("GEMINI_API_KEY"),
		BirdKey:         os.Getenv("BIRD_API_KEY"),
		BirdURL:         os.Getenv("BIRD_API_URL"),
		BirdEmailKey:    os.Getenv("BIRD_EMAIL_KEY"),
		OTPEmailFrom:    os.Getenv("OTP_EMAIL_FROM"),
		SiteURL:         strings.TrimRight(env("SITE_URL", "https://oceanpedia-web.vercel.app"), "/"),
		GeminiModels:    splitList(os.Getenv("GEMINI_MODELS")),
		MarketCacheTTL:  dur("TWELVEDATA_CACHE_TTL", time.Minute),
		QuoteTTL:        dur("TWELVEDATA_QUOTE_TTL", 15*time.Minute),
		CandleTTL:       dur("TWELVEDATA_CANDLE_TTL", time.Hour),
		// Paket Basic Twelve Data tidak mencakup bursa IDX; kosongkan setelah upgrade ke Pro.
		MarketSkip: splitList(env("TWELVEDATA_SKIP", "IDX,JKSE,JKLQ45")),
		TaxRate:    float("API_TAX_RATE", 0.11),

		MidtransServerKey:  strings.TrimSpace(os.Getenv("MIDTRANS_SERVER_KEY")),
		MidtransProduction: env("MIDTRANS_PRODUCTION", "false") == "true",
		APIPublicURL:       strings.TrimRight(env("API_PUBLIC_URL", "https://oceanpedia-api.vercel.app"), "/"),

		FinnhubAPIKey:              strings.TrimSpace(os.Getenv("FINNHUB_API_KEY")),
		TradingViewAPIKey:          strings.TrimSpace(os.Getenv("TRADINGVIEW_API_KEY")),
		TradingViewAPIBase:         strings.TrimRight(env("TRADINGVIEW_API_BASE", "https://api.tradingviewapi.com"), "/"),
		TradingViewCalendarTTL:     dur("TRADINGVIEW_CALENDAR_TTL", 15*time.Minute),
		TradingViewCalendarMarkets: env("TRADINGVIEW_CALENDAR_MARKETS", "america,china,indonesia"),
		TradingViewCalendarSource:  strings.ToLower(env("TRADINGVIEW_CALENDAR_SOURCE", "auto")),
	}
	// Kunci sandbox Midtrans berawalan "SB-": selalu pakai endpoint sandbox walau MIDTRANS_PRODUCTION=true.
	if strings.HasPrefix(c.MidtransServerKey, "SB-") {
		c.MidtransProduction = false
	}
	var errs []error
	if c.DatabaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL wajib diisi"))
	}
	if len(c.JWTSecret) < 32 {
		errs = append(errs, errors.New("API_JWT_SECRET minimal 32 karakter"))
	}
	if c.Env != "development" && c.Env != "staging" && c.Env != "production" {
		errs = append(errs, fmt.Errorf("API_ENV tidak dikenal: %q", c.Env))
	}
	return c, errors.Join(errs...)
}

// Production menandakan lingkungan produksi.
func (c Config) Production() bool { return c.Env == "production" }

func env(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && v != "" {
		return v
	}
	return def
}

func dur(k string, def time.Duration) time.Duration {
	if d, err := time.ParseDuration(os.Getenv(k)); err == nil {
		return d
	}
	return def
}

func float(k string, def float64) float64 {
	if f, err := strconv.ParseFloat(os.Getenv(k), 64); err == nil {
		return f
	}
	return def
}

func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
