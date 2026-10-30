// Package handler adalah entrypoint Vercel Function (runtime Go).
// Semua path diarahkan ke sini lewat vercel.json; router internal yang menangani /v1/*.
package handler

import (
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/mrasulco-max/oceanpedia/api/internal/api"
	"github.com/mrasulco-max/oceanpedia/api/internal/config"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/market"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

var (
	once    sync.Once
	h       http.Handler
	initErr error
)

func build() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		initErr = err
		return
	}
	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		initErr = err
		return
	}
	// Fungsi serverless: pool kecil, koneksi lewat Supavisor (transaction mode).
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(2)
	db.SetConnMaxIdleTime(30 * time.Second)
	var p market.Provider = market.Sample{}
	if cfg.TwelveDataKey != "" {
		p = market.NewTwelveData(cfg.TwelveDataKey)
	}
	srv := &api.Server{Store: &store.PG{DB: db}, Market: market.NewCached(p, cfg.MarketCacheTTL), Cfg: cfg, Log: log}
	h = srv.Handler()
}

// Handler dipanggil Vercel untuk setiap request.
func Handler(w http.ResponseWriter, r *http.Request) {
	once.Do(build)
	if initErr != nil {
		slog.Error("init gagal", "err", initErr)
		httpx.Error(w, r, &httpx.Problem{Type: "about:blank", Title: "Layanan belum siap", Status: 503})
		return
	}
	h.ServeHTTP(w, r)
}
