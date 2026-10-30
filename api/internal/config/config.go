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
	MarketCacheTTL  time.Duration
	QuoteTTL        time.Duration
	CandleTTL       time.Duration
	TaxRate         float64 // PPN, mis. 0.11
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
		MarketCacheTTL:  dur("TWELVEDATA_CACHE_TTL", time.Minute),
		QuoteTTL:        dur("TWELVEDATA_QUOTE_TTL", 10*time.Minute),
		CandleTTL:       dur("TWELVEDATA_CANDLE_TTL", time.Hour),
		TaxRate:         float("API_TAX_RATE", 0.11),
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
