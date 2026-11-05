//go:build integration

package store_test

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/mrasulco-max/oceanpedia/api/internal/migrate"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
	"github.com/mrasulco-max/oceanpedia/api/migrations"
)

// TestPGTOTP menguji kueri autentikator terhadap PostgreSQL sungguhan, termasuk perlombaan (race):
// request paralel dengan kode yang sama hanya boleh lolos satu kali.
func TestPGTOTP(t *testing.T) {
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
	s := &store.PG{DB: db}
	u, err := s.CreateUser(ctx, fmt.Sprintf("totp-%d@example.com", time.Now().UnixNano()), "Uji TOTP", "x", "")
	if err != nil {
		t.Fatal(err)
	}
	id := u.ID

	if err := s.SetTOTP(ctx, id, "totp_secret", "v1:rahasia"); err != nil {
		t.Fatal(err)
	}
	if a, _, err := s.TOTP(ctx, id); err != nil || a != "v1:rahasia" {
		t.Fatalf("TOTP: %q %v", a, err)
	}

	// Langkah: hanya langkah yang lebih baru yang diterima.
	for _, c := range []struct {
		step int64
		want bool
	}{{100, true}, {100, false}, {99, false}, {101, true}} {
		if ok, err := s.UseTOTPStep(ctx, id, c.step); err != nil || ok != c.want {
			t.Fatalf("UseTOTPStep(%d) = %v %v, mau %v", c.step, ok, err, c.want)
		}
	}
	// Perlombaan: 20 request paralel dengan langkah yang sama → tepat satu lolos.
	if n := race(20, func() bool { ok, _ := s.UseTOTPStep(ctx, id, 200); return ok }); n != 1 {
		t.Fatalf("langkah sama lolos %d kali", n)
	}

	// Percobaan: bertambah dalam jendela, mulai ulang setelah jendela lewat.
	now := time.Now().Unix()
	for want := 1; want <= 3; want++ {
		if n, err := s.TOTPAttempt(ctx, id, now, 900); err != nil || n != want {
			t.Fatalf("TOTPAttempt #%d = %d %v", want, n, err)
		}
	}
	if n, _ := s.TOTPAttempt(ctx, id, now+901, 900); n != 1 {
		t.Fatalf("jendela baru harus mulai dari 1: %d", n)
	}
	if n := race(20, func() bool { _, err := s.TOTPAttempt(ctx, id, now+901, 900); return err == nil }); n != 20 {
		t.Fatalf("percobaan paralel gagal: %d", n)
	}
	if n, _ := s.TOTPAttempt(ctx, id, now+901, 900); n != 22 {
		t.Fatalf("penghitung paralel tidak atomik: %d (mau 22)", n)
	}
	if err := s.SetTOTP(ctx, id, "totp_fail", ""); err != nil {
		t.Fatal(err)
	}
	if n, _ := s.TOTPAttempt(ctx, id, now+901, 900); n != 1 {
		t.Fatalf("setelah reset: %d", n)
	}

	// Kode cadangan: sekali pakai, sisa dihitung benar, perlombaan hanya satu yang lolos.
	if err := s.SetTOTP(ctx, id, "totp_recovery", "h1,h2,h3"); err != nil {
		t.Fatal(err)
	}
	if l, err := s.TOTPRecovery(ctx, id); err != nil || strings.Join(l, ",") != "h1,h2,h3" {
		t.Fatalf("TOTPRecovery: %v %v", l, err)
	}
	if left, ok, err := s.UseRecoveryCode(ctx, id, "h2"); err != nil || !ok || left != 2 {
		t.Fatalf("pakai h2: %d %v %v", left, ok, err)
	}
	if _, ok, _ := s.UseRecoveryCode(ctx, id, "h2"); ok {
		t.Fatal("h2 dipakai dua kali")
	}
	if _, ok, _ := s.UseRecoveryCode(ctx, id, "h"); ok {
		t.Fatal("potongan hash tidak boleh cocok")
	}
	if n := race(20, func() bool { _, ok, _ := s.UseRecoveryCode(ctx, id, "h1"); return ok }); n != 1 {
		t.Fatalf("kode cadangan sama lolos %d kali", n)
	}
	if left, ok, _ := s.UseRecoveryCode(ctx, id, "h3"); !ok || left != 0 {
		t.Fatalf("kode terakhir: %d %v", left, ok)
	}
	if l, _ := s.TOTPRecovery(ctx, id); len(l) != 0 {
		t.Fatalf("semua kode sudah dipakai: %v", l)
	}

	// Kunci di luar daftar putih diabaikan; ClearTOTP menghapus semuanya.
	_ = s.SetTOTP(ctx, id, "role", "admin")
	if err := s.ClearTOTP(ctx, id); err != nil {
		t.Fatal(err)
	}
	var prefs string
	if err := db.QueryRowContext(ctx, `SELECT COALESCE(preferences, '{}'::jsonb)::text FROM users WHERE id = $1::uuid`, id).Scan(&prefs); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(prefs, "totp") || strings.Contains(prefs, "role") {
		t.Fatalf("sisa preferences: %s", prefs)
	}
	if a, p, _ := s.TOTP(ctx, id); a != "" || p != "" {
		t.Fatal("rahasia masih ada")
	}
	// Ekspor data pribadi tidak membocorkan rahasia / hash.
	_ = s.SetTOTP(ctx, id, "totp_secret", "v1:rahasia")
	_ = s.SetTOTP(ctx, id, "totp_recovery", "hashrahasia")
	_, _ = s.UseTOTPStep(ctx, id, 5)
	out, err := s.ExportUser(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	// Panel admin melihat status autentikator (untuk tombol "Reset 2FA").
	if au, err := s.AdminUser(ctx, id); err != nil || !au.TOTP {
		t.Fatalf("AdminUser.TOTP: %+v %v", au.TOTP, err)
	}
	if _, _, err := s.AdminUsers(ctx, "reader", "", 5); err != nil {
		t.Fatalf("AdminUsers: %v", err)
	}
	if strings.Contains(out, "v1:rahasia") || strings.Contains(out, "hashrahasia") || strings.Contains(out, "totp_last_step") || !strings.Contains(out, `"totp_enabled" : true`) && !strings.Contains(out, `"totp_enabled": true`) && !strings.Contains(out, `"totp_enabled":true`) {
		t.Fatalf("ekspor: %s", out)
	}
	if err := s.ClearTOTP(ctx, id); err != nil {
		t.Fatal(err)
	}
}

// race menjalankan fn secara paralel n kali dan menghitung berapa yang mengembalikan true.
func race(n int, fn func() bool) int {
	var wg sync.WaitGroup
	var mu sync.Mutex
	start := make(chan struct{})
	ok := 0
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if fn() {
				mu.Lock()
				ok++
				mu.Unlock()
			}
		}()
	}
	close(start)
	wg.Wait()
	return ok
}
