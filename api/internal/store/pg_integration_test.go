//go:build integration

// Uji integrasi terhadap PostgreSQL sungguhan (dijalankan di CI):
//
//	DATABASE_URL=postgres://... go test -tags integration ./internal/store/
package store_test

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"log/slog"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/mrasulco-max/oceanpedia/api/internal/migrate"
	"github.com/mrasulco-max/oceanpedia/api/internal/otp"
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
	u, err := s.CreateUser(ctx, email, "Penguji", "hash", "+6281234567890")
	if err != nil || u.ID == "" || u.EmailVerified || u.Phone == nil || *u.Phone != "+6281234567890" {
		t.Fatalf("create user (belum terverifikasi): %v %+v", err, u)
	}
	if _, err := s.CreateUser(ctx, email, "Lagi", "hash", ""); err != store.ErrDuplicate {
		t.Fatalf("duplikat: %v", err)
	}
	if u2, err := s.UpdatePendingUser(ctx, u.ID, "Penguji Baru", "hash2", ""); err != nil || u2.FullName != "Penguji Baru" || u2.Phone != nil {
		t.Fatalf("update pending: %v %+v", err, u2)
	}
	if err := s.MarkEmailVerified(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	if u3, _ := s.UserByEmail(ctx, email); !u3.EmailVerified {
		t.Fatal("harus terverifikasi")
	}
	if _, err := s.UpdatePendingUser(ctx, u.ID, "Tidak boleh", "x", ""); err != nil {
		t.Fatal(err)
	}
	if u4, _ := s.UserByID(ctx, u.ID); u4.FullName != "Penguji Baru" {
		t.Fatal("akun terverifikasi tidak boleh diubah lewat pendaftaran ulang")
	}
	if err := s.SetPassword(ctx, u.ID, "hash3"); err != nil {
		t.Fatal(err)
	}
	codeAt := time.Now().UTC().Truncate(time.Second)
	if err := s.SaveAuthCode(ctx, otp.CodeRecord{Email: email, Hash: []byte("h"), Provider: "email", ExpiresAt: codeAt.Add(10 * time.Minute), SentAt: codeAt, WindowAt: codeAt, WindowSent: 1}); err != nil {
		t.Fatal(err)
	}
	_ = s.AuthCodeAttempt(ctx, email)
	if rc, ok, err := s.AuthCode(ctx, email); err != nil || !ok || rc.Attempts != 1 || string(rc.Hash) != "h" || rc.Provider != "email" {
		t.Fatalf("auth code: %v %v %+v", err, ok, rc)
	}
	if err := s.SaveAuthCode(ctx, otp.CodeRecord{Email: email, Provider: "verify", ExpiresAt: codeAt, SentAt: codeAt, WindowAt: codeAt, WindowSent: 2}); err != nil {
		t.Fatal(err)
	}
	if rc, _, _ := s.AuthCode(ctx, email); rc.Attempts != 0 || rc.Hash != nil || rc.WindowSent != 2 {
		t.Fatalf("auth code diperbarui: %+v", rc)
	}
	_ = s.DeleteAuthCode(ctx, email)
	if _, ok, _ := s.AuthCode(ctx, email); ok {
		t.Fatal("kode harus terhapus")
	}
	if sr, err := s.Search(ctx, "bbca", 6); err != nil || len(sr.Instruments) == 0 || sr.Instruments[0].Symbol != "BBCA" {
		t.Fatalf("search: %v %+v", err, sr)
	}
	if sr, err := s.Search(ctx, "50%_", 6); err != nil || len(sr.Instruments) != 0 {
		t.Fatalf("search wildcard: %v %+v", err, sr)
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
	if c, err := s.AddComment(ctx, u.ID, a.Slug, "Mantap"); err != nil || c.UserName != "Penguji Baru" {
		t.Fatalf("comment: %v", err)
	}
	promo := "PLUSBARU"
	inv, err := s.CreateInvoice(ctx, u.ID, store.Invoice{PlanCode: "essential", Subtotal: 59000, Discount: 49100, TaxRate: 0.11, TaxAmount: 1089, Total: 10989, Currency: "IDR", PromoCode: &promo})
	if err != nil || inv.Total != 10989 || len(inv.Number) < 20 {
		t.Fatalf("invoice: %v %+v", err, inv)
	}

	// Alur redaksi: tulis draf → kirim review → terbit → tampil di daftar publik.
	slugBase := "uji-redaksi-" + time.Now().Format("150405000000")
	slugFn := func(i int) string {
		if i == 0 {
			return slugBase
		}
		return slugBase + "-" + string(rune('0'+i))
	}
	in := store.ArticleInput{Title: "Uji alur redaksi OceanBird", Excerpt: "Ringkasan uji.", Body: "Isi uji.", CategorySlug: "saham",
		Symbols: []string{"BBCA", "IHSG"}, Status: "review", ReadingMinutes: 1}
	art, err := s.CreateArticle(ctx, u.ID, "penguji-"+slugBase, in, slugFn)
	if err != nil || art.Status != "review" || len(art.Symbols) != 2 || !art.OwnedBy(u.ID) || art.AuthorName != "Penguji Baru" {
		t.Fatalf("create article: %v %+v", err, art)
	}
	dup, err := s.CreateArticle(ctx, u.ID, "penguji-"+slugBase, in, slugFn)
	if err != nil || dup.Slug == art.Slug {
		t.Fatalf("slug unik: %v %s %s", err, dup.Slug, art.Slug)
	}
	if _, err := s.CreateArticle(ctx, u.ID, "x", store.ArticleInput{Title: "Kategori salah sekali", CategorySlug: "tidak-ada", Status: "draft", ReadingMinutes: 1}, slugFn); err == nil {
		t.Fatal("kategori tak dikenal harus gagal")
	}
	mine, err := s.AdminArticles(ctx, store.AdminArticleFilter{Status: "review", Mine: u.ID, Limit: 10})
	if err != nil || len(mine) != 2 {
		t.Fatalf("admin list: %v %d", err, len(mine))
	}
	if pub, _ := s.Articles(ctx, store.ArticleFilter{Category: "saham", Limit: 50}); containsSlug(pub, art.Slug) {
		t.Fatal("artikel review tidak boleh tampil publik")
	}
	now := time.Now()
	if err := s.SetArticleStatus(ctx, art.ID, "published", &now, ""); err != nil {
		t.Fatal(err)
	}
	if pub, _ := s.Articles(ctx, store.ArticleFilter{Category: "saham", Limit: 50}); !containsSlug(pub, art.Slug) {
		t.Fatal("artikel terbit harus tampil publik")
	}
	in.Title, in.Symbols, in.Status, in.PublishedAt = "Uji alur redaksi (revisi)", []string{"BBRI"}, "published", &now
	upd, err := s.UpdateArticle(ctx, art.ID, in)
	if err != nil || upd.Title != in.Title || len(upd.Symbols) != 1 || upd.Symbols[0] != "BBRI" {
		t.Fatalf("update: %v %+v", err, upd)
	}
	if _, err := s.UpdateArticle(ctx, art.ID, store.ArticleInput{Title: "Ticker tidak dikenal", CategorySlug: "saham", Symbols: []string{"ZZZZ"}, Status: "draft", ReadingMinutes: 1}); err == nil {
		t.Fatal("ticker tak dikenal harus gagal")
	}
	counts, err := s.AdminCounts(ctx, "")
	if err != nil || counts["published"] < 13 || counts["review"] < 1 {
		t.Fatalf("counts: %v %+v", err, counts)
	}
	if mine, err := s.AdminCounts(ctx, u.ID); err != nil || mine["all"] < 1 || mine["all"] >= counts["all"] {
		t.Fatalf("counts milik penulis: %v %+v", err, mine)
	}
	// Hapus artikel (cascade ticker) lalu pastikan hilang.
	tmp, err := s.CreateArticle(ctx, u.ID, "penguji-"+slugBase, store.ArticleInput{Title: "Draf yang dihapus", CategorySlug: "saham", Symbols: []string{"BBCA"}, Status: "draft", ReadingMinutes: 1}, func(i int) string { return fmt.Sprintf("hapus-%s-%d", slugBase, i) })
	if err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteArticle(ctx, tmp.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AdminArticle(ctx, tmp.ID); err == nil {
		t.Fatal("artikel terhapus masih ada")
	}
	if err := s.DeleteArticle(ctx, tmp.ID); err == nil {
		t.Fatal("hapus dua kali harus 404")
	}
	mid, err := s.CreateMedia(ctx, u.ID, "image/png", []byte("\x89PNG data"))
	if err != nil {
		t.Fatal(err)
	}
	if mime, data, err := s.Media(ctx, mid); err != nil || mime != "image/png" || len(data) == 0 {
		t.Fatalf("media: %v %s", err, mime)
	}
	if err := s.Audit(ctx, u.ID, "article.publish", "article", art.ID, map[string]string{"title": art.Title}); err != nil {
		t.Fatal(err)
	}
	// Foto profil: unggah, ganti (foto lama terhapus), hapus.
	png := []byte("\x89PNG\r\n\x1a\nfoto")
	av1, err := s.SetAvatar(ctx, u.ID, "image/png", png)
	if err != nil {
		t.Fatal(err)
	}
	av2, err := s.SetAvatar(ctx, u.ID, "image/png", png)
	if err != nil || av2 == av1 {
		t.Fatalf("ganti foto: %v", err)
	}
	if u5, _ := s.UserByID(ctx, u.ID); u5.AvatarID == nil || *u5.AvatarID != av2 {
		t.Fatalf("avatar_id: %v", u5.AvatarID)
	}
	if _, _, err := s.Media(ctx, av1); err == nil {
		t.Fatal("foto lama harus terhapus")
	}
	if err := s.RemoveAvatar(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	if u6, _ := s.UserByID(ctx, u.ID); u6.AvatarID != nil {
		t.Fatal("avatar harus kosong")
	}
	// Cache data pasar bersama.
	if err := s.MarketCachePut(ctx, "q:TEST", []byte(`{"price":1}`), ""); err != nil {
		t.Fatal(err)
	}
	if b, e, _, ok, err := s.MarketCacheGet(ctx, "q:TEST"); err != nil || !ok || e != "" || len(b) == 0 {
		t.Fatalf("market cache: %v %v %s", err, ok, b)
	}
	if err := s.MarketCachePut(ctx, "q:TEST", nil, "plan"); err != nil {
		t.Fatal(err)
	}
	if b, e, _, ok, _ := s.MarketCacheGet(ctx, "q:TEST"); !ok || e != "plan" || len(b) == 0 {
		t.Fatalf("galat dicatat tanpa menghapus data lama: %s %q", b, e)
	}
	if _, _, _, ok, err := s.MarketCacheGet(ctx, "q:TIDAK-ADA"); ok || err != nil {
		t.Fatalf("kunci tak ada: %v %v", ok, err)
	}
}

func containsSlug(list []store.ArticleCard, slug string) bool {
	for _, a := range list {
		if a.Slug == slug {
			return true
		}
	}
	return false
}
