// Command api menjalankan REST API OceanPedia.
//
//	api            jalankan server (default)
//	api migrate    terapkan migrasi lalu keluar
package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/api"
	"github.com/mrasulco-max/oceanpedia/api/internal/config"
	"github.com/mrasulco-max/oceanpedia/api/internal/market"
	"github.com/mrasulco-max/oceanpedia/api/internal/migrate"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
	"github.com/mrasulco-max/oceanpedia/api/migrations"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)
	if err := run(log); err != nil {
		log.Error("berhenti", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := sql.Open(driverName, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(30 * time.Minute)
	pctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := db.PingContext(pctx); err != nil {
		return err
	}

	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		return migrate.Up(ctx, db, migrations.FS, log)
	}
	if cfg.RunMigrations {
		if err := migrate.Up(ctx, db, migrations.FS, log); err != nil {
			return err
		}
	}

	var provider market.Provider = market.Sample{}
	if cfg.TwelveDataKey != "" {
		provider = &market.Shared{P: market.NewTwelveData(cfg.TwelveDataKey), KV: &store.PG{DB: db}, QuoteTTL: cfg.QuoteTTL, CandleTTL: cfg.CandleTTL, ErrTTL: 24 * time.Hour}
	} else {
		log.Warn("TWELVEDATA_API_KEY kosong: memakai data pasar contoh")
	}
	srv := &api.Server{Store: &store.PG{DB: db}, Market: market.NewCached(provider, cfg.MarketCacheTTL), Cfg: cfg, Log: log}

	hs := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    1 << 16,
	}
	errc := make(chan error, 1)
	go func() {
		log.Info("API berjalan", "addr", cfg.Addr, "env", cfg.Env)
		if err := hs.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errc <- err
		}
		close(errc)
	}()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	log.Info("menghentikan server…")
	sctx, scancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer scancel()
	return hs.Shutdown(sctx)
}
