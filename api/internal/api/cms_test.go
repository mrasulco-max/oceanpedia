package api

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

func TestValidCategory(t *testing.T) {
	in := store.CategoryInput{Name: "  Pasar Modal ", Icon: "<svg>", Color: ""}
	if err := validCategory(&in); err != nil {
		t.Fatalf("valid: %v", err)
	}
	if in.Slug != "pasar-modal" || in.Icon != "bars" || in.Status != "active" || in.Name != "Pasar Modal" {
		t.Fatalf("normalisasi salah: %+v", in)
	}
	empty := ""
	in = store.CategoryInput{Name: "X", Slug: "Bad Slug!", Color: "red", Status: "live", SortOrder: -1, ParentID: &empty}
	err := validCategory(&in)
	if err == nil {
		t.Fatal("harus gagal")
	}
	b, _ := json.Marshal(err)
	for _, k := range []string{"name", "slug", "color", "status", "sort_order"} {
		if !strings.Contains(string(b), `"`+k+`"`) && !strings.Contains(err.Error(), k) {
			t.Errorf("field %s tidak dilaporkan: %s / %v", k, b, err)
		}
	}
	if in.ParentID != nil {
		t.Errorf("parent kosong harus jadi nil")
	}
}

func TestValidTag(t *testing.T) {
	slug, name, err := validTag("", "#Suku Bunga")
	if err != nil || slug != "suku-bunga" || name != "Suku Bunga" {
		t.Fatalf("got %q %q %v", slug, name, err)
	}
	if _, _, err := validTag("ok", "a"); err == nil {
		t.Fatal("nama 1 huruf harus ditolak")
	}
}

// fakeMod menyimpan pengaturan & kata terlarang moderasi.
type fakeMod struct {
	*fake
	words []string
	set   *ModerationSettings
}

func (f *fakeMod) ModerationWords(context.Context) ([]string, error) { return f.words, nil }
func (f *fakeMod) Setting(_ context.Context, _ string, dst any) (bool, error) {
	if f.set == nil {
		return false, nil
	}
	*(dst.(*ModerationSettings)) = *f.set
	return true, nil
}

func TestScreenComment(t *testing.T) {
	s, _ := newTest(t)
	fm := &fakeMod{fake: s.Store.(*fake), words: []string{"pasti cuan"}}
	s.Store = fm
	r := httptest.NewRequest("POST", "/", nil)
	old := 48 * time.Hour
	cases := []struct {
		body string
		age  time.Duration
		want string
	}{
		{"Analisis yang bagus, terima kasih.", old, "visible"},
		{"Gabung grup, PASTI CUAN 100%", old, "pending"},
		{"cek di t.me/grupsaham", old, "pending"},
		{"lihat www.contoh.com", old, "pending"},
		{"Komentar wajar dari akun baru", time.Hour, "pending"},
	}
	for _, c := range cases {
		if got, _ := s.screenComment(r, c.body, c.age); got != c.want {
			t.Errorf("%q: got %s want %s", c.body, got, c.want)
		}
	}
	// Filter dimatikan: semua langsung tampil.
	fm.set = &ModerationSettings{ReportThreshold: 3}
	for _, c := range cases {
		if got, _ := s.screenComment(r, c.body, c.age); got != "visible" {
			t.Errorf("filter mati %q: got %s", c.body, got)
		}
	}
}
