//go:build integration

// Uji integrasi terhadap PostgreSQL sungguhan (dijalankan di CI):
//
//	DATABASE_URL=postgres://... go test -tags integration ./internal/store/
package store_test

import (
	"context"
	"database/sql"
	"io"
	"log/slog"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/mrasulco-max/oceanpedia/api/internal/migrate"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
	"github.com/mrasulco-max/oceanpedia/api/migrations"
)

func TestPGStore(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL kosong")
	}
	ctx := context.Background()
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := migrate.Up(ctx, db, migrations.FS, slog.New(slog.NewTextHandler(io.Discard, nil))); err != nil {
		t.Fatal(err)
	}
	if err := migrate.Up(ctx, db, migrations.FS, slog.New(slog.NewTextHandler(io.Discard, nil))); err != nil {
		t.Fatal("migrasi kedua harus idempoten:", err)
	}
	seed, err := os.ReadFile("../../../db/seed/dev_seed.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, string(seed)); err != nil {
		t.Fatal("seed:", err)
	}
	s := &store.PG{DB: db}

	cats, err := s.Categories(ctx)
	if err != nil || len(cats) < 5 {
		t.Fatalf("categories: %v %d", err, len(cats))
	}
	list, err := s.Articles(ctx, store.ArticleFilter{Category: "saham", Limit: 2})
	if err != nil || len(list) != 2 || list[0].Category.Slug != "saham" {
		t.Fatalf("articles: %v %+v", err, list)
	}
	before := list[1].PublishedAt
	next, err := s.Articles(ctx, store.ArticleFilter{Category: "saham", Before: &before, Limit: 5})
	if err != nil || len(next) == 0 || !next[0].PublishedAt.Before(before) {
		t.Fatalf("paginasi keyset: %v %+v", err, next)
	}
	if hits, err := s.Articles(ctx, store.ArticleFilter{Query: "bitcoin", Limit: 5}); err != nil || len(hits) == 0 {
		t.Fatalf("pencarian: %v %d", err, len(hits))
	}
	a, err := s.ArticleBySlug(ctx, "ihsg-menguat-ditopang-saham-perbankan")
	if err != nil || len(a.Tags) == 0 || len(a.Symbols) == 0 || a.Author.Name == "" {
		t.Fatalf("article: %v %+v", err, a)
	}
	if _, err := s.ArticleBySlug(ctx, "tidak-ada"); err == nil {
		t.Fatal("seharusnya not found")
	}
	ins, err := s.Instruments(ctx, []string{"BBCA", "BTCUSD"})
	if err != nil || len(ins) != 2 {
		t.Fatalf("instruments: %v %d", err, len(ins))
	}
	if all, _ := s.Instruments(ctx, nil); len(all) < 10 {
		t.Fatalf("semua instrumen: %d", len(all))
	}
	ev, err := s.Events(ctx, time.Now().Add(-48*time.Hour), time.Now().Add(48*time.Hour), "high")
	if err != nil || len(ev) == 0 {
		t.Fatalf("events: %v %d", err, len(ev))
	}
	plans, err := s.Plans(ctx)
	if err != nil || len(plans) < 3 || len(plans[0].Features) == 0 {
		t.Fatalf("plans: %v %+v", err, plans)
	}
	ads, err := s.AdSlots(ctx, "web", "legal")
	if err != nil || len(ads) != 2 {
		t.Fatalf("iklan legal hanya rail kiri/kanan: %v %+v", err, ads)
	}

	email := "uji-" + time.Now().Format("150405.000000") + "@example.com"
	u, err := s.CreateUser(ctx, email, "Penguji", "hash")
	if err != nil || u.ID == "" {
		t.Fatalf("create user: %v", err)
	}
	if _, err := s.CreateUser(ctx, email, "Lagi", "hash"); err != store.ErrDuplicate {
		t.Fatalf("duplikat: %v", err)
	}
	if err := s.SaveRefreshToken(ctx, u.ID, []byte("h1"+email), "ua", "127.0.0.1", time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if id, err := s.ConsumeRefreshToken(ctx, []byte("h1"+email)); err != nil || id != u.ID {
		t.Fatalf("consume: %v", err)
	}
	if _, err := s.ConsumeRefreshToken(ctx, []byte("h1"+email)); err == nil {
		t.Fatal("token sekali pakai")
	}
	if err := s.AddToWatchlist(ctx, u.ID, "BBCA"); err != nil {
		t.Fatal(err)
	}
	_ = s.AddToWatchlist(ctx, u.ID, "BTCUSD")
	if wl, err := s.Watchlist(ctx, u.ID); err != nil || len(wl) != 2 {
		t.Fatalf("watchlist: %v %d", err, len(wl))
	}
	th := 10400.0
	al, err := s.CreateAlert(ctx, u.ID, store.Alert{Symbol: "BBCA", Condition: "price_above", Threshold: &th, Frequency: "once", Channels: []string{"push", "email"}})
	if err != nil || al.ID == "" || len(al.Channels) != 2 || *al.Threshold != th {
		t.Fatalf("alert: %v %+v", err, al)
	}
	if err := s.DeleteAlert(ctx, u.ID, al.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.SetBookmark(ctx, u.ID, a.Slug, true); err != nil {
		t.Fatal(err)
	}
	if bm, _ := s.Bookmarks(ctx, u.ID); len(bm) != 1 {
		t.Fatalf("bookmark: %d", len(bm))
	}
	if err := s.React(ctx, u.ID, a.Slug, "bullish"); err != nil {
		t.Fatal(err)
	}
	rc, _ := s.Reactions(ctx, a.Slug)
	if len(rc) != 4 || rc[0].Kind != "bullish" || rc[0].Count < 1 {
		t.Fatalf("reactions: %+v", rc)
	}
	if c, err := s.AddComment(ctx, u.ID, a.Slug, "Mantap"); err != nil || c.UserName != "Penguji" {
		t.Fatalf("comment: %v", err)
	}
	promo := "PLUSBARU"
	inv, err := s.CreateInvoice(ctx, u.ID, store.Invoice{PlanCode: "essential", Subtotal: 59000, Discount: 49100, TaxRate: 0.11, TaxAmount: 1089, Total: 10989, Currency: "IDR", PromoCode: &promo})
	if err != nil || inv.Total != 10989 || len(inv.Number) < 20 {
		t.Fatalf("invoice: %v %+v", err, inv)
	}
}
