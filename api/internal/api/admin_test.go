package api

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/auth"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"IHSG Naik 0,6% di Sesi 1!":       "ihsg-naik-0-6-di-sesi-1",
		"  Café — Résumé  ":               "cafe-resume",
		"???":                             "artikel",
		"Rupiah   Menguat\tke 15.612/USD": "rupiah-menguat-ke-15-612-usd",
	}
	for in, want := range cases {
		if got := Slugify(in); got != want {
			t.Errorf("Slugify(%q) = %q, mau %q", in, got, want)
		}
	}
	long := Slugify("a kata-yang-sangat-panjang sekali untuk judul berita pasar modal indonesia hari ini dan besok juga")
	if len(long) > 80 || long[len(long)-1] == '-' {
		t.Errorf("slug terlalu panjang / berakhir '-': %q", long)
	}
}

func TestDecideStatus(t *testing.T) {
	now := time.Date(2026, 10, 31, 9, 0, 0, 0, time.UTC)
	if st, _, err := decideStatus("author", "review", nil, now); err != nil || st != "review" {
		t.Fatalf("penulis kirim review: %s %v", st, err)
	}
	if _, _, err := decideStatus("author", "publish", nil, now); err == nil {
		t.Fatal("penulis tidak boleh menerbitkan langsung")
	}
	st, at, err := decideStatus("editor", "publish", nil, now)
	if err != nil || st != "published" || !at.Equal(now) {
		t.Fatalf("editor terbit: %s %v %v", st, at, err)
	}
	later := now.Add(2 * time.Hour)
	if _, at, _ := decideStatus("admin", "publish", &later, now); !at.Equal(later) {
		t.Fatalf("terjadwal: %v", at)
	}
	if _, _, err := decideStatus("admin", "hapus", nil, now); err == nil {
		t.Fatal("aksi tak dikenal harus ditolak")
	}
}

// fakeAdmin menambah perilaku redaksi di atas fake.
type fakeAdmin struct {
	*fake
	created []store.ArticleInput
}

func (f *fakeAdmin) CreateArticle(_ context.Context, userID, _ string, in store.ArticleInput, slugFn func(int) string) (store.AdminArticle, error) {
	f.created = append(f.created, in)
	return store.AdminArticle{ID: "11111111-1111-1111-1111-111111111111", Slug: slugFn(0), Title: in.Title, Status: in.Status, CreatedBy: &userID}, nil
}
func (f *fakeAdmin) Audit(context.Context, string, string, string, string, any) error { return nil }

func TestAdminArticleRoles(t *testing.T) {
	s, _ := newTest(t)
	fk := s.Store.(*fake)
	fk.users["u-author"] = store.User{ID: "u-author", FullName: "Maya Lestari", Role: "author"}
	fa := &fakeAdmin{fake: fk}
	s.Store = fa
	h := s.Handler()
	tok := func(role string) string {
		t, _ := auth.Sign(s.Cfg.JWTSecret, auth.Claims{Sub: "u-" + role, Role: role}, time.Minute, time.Now())
		return "Bearer " + t
	}
	body := `{"title":"Rekap sesi 1: IHSG naik 0,6%","excerpt":"Ringkas.","body":"JAKARTA — IHSG ditutup menguat pada sesi pertama ditopang saham bank besar.","category":"saham","symbols":["ihsg","IHSG"],"action":"%s"}`

	if w := do(h, "POST", "/v1/admin/articles", body, "Authorization", tok("reader")); w.Code != 403 {
		t.Fatalf("pembaca harus 403, dapat %d", w.Code)
	}
	if w := do(h, "POST", "/v1/admin/articles", body); w.Code != 401 {
		t.Fatalf("tanpa login harus 401, dapat %d", w.Code)
	}
	pub := do(h, "POST", "/v1/admin/articles", fmtAction(body, "publish"), "Authorization", tok("author"))
	if pub.Code != 403 {
		t.Fatalf("penulis terbit langsung harus 403, dapat %d %s", pub.Code, pub.Body)
	}
	rev := do(h, "POST", "/v1/admin/articles", fmtAction(body, "review"), "Authorization", tok("author"))
	if rev.Code != 201 {
		t.Fatalf("penulis kirim review: %d %s", rev.Code, rev.Body)
	}
	var a store.AdminArticle
	_ = json.Unmarshal(rev.Body.Bytes(), &a)
	if a.Status != "review" || a.Slug != "rekap-sesi-1-ihsg-naik-0-6" {
		t.Fatalf("hasil: %+v", a)
	}
	in := fa.created[len(fa.created)-1]
	if len(in.Symbols) != 1 || in.Symbols[0] != "IHSG" || in.ReadingMinutes != 1 {
		t.Fatalf("normalisasi input: %+v", in)
	}
	bad := do(h, "POST", "/v1/admin/articles", `{"title":"pendek","category":"","action":"review"}`, "Authorization", tok("author"))
	if bad.Code != 422 {
		t.Fatalf("validasi harus 422, dapat %d %s", bad.Code, bad.Body)
	}
	if w := do(h, "POST", "/v1/admin/articles/bukan-uuid/status", `{"action":"publish"}`, "Authorization", tok("author")); w.Code != 403 {
		t.Fatalf("penulis ubah status harus 403, dapat %d", w.Code)
	}
}

func fmtAction(body, action string) string { return strings.Replace(body, "%s", action, 1) }
