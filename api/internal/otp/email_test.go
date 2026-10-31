package otp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"
)

type memCodes struct{ m map[string]CodeRecord }

func (s *memCodes) AuthCode(_ context.Context, e string) (CodeRecord, bool, error) {
	r, ok := s.m[e]
	return r, ok, nil
}
func (s *memCodes) SaveAuthCode(_ context.Context, r CodeRecord) error { s.m[r.Email] = r; return nil }
func (s *memCodes) AuthCodeAttempt(_ context.Context, e string) error {
	r := s.m[e]
	r.Attempts++
	s.m[e] = r
	return nil
}
func (s *memCodes) DeleteAuthCode(_ context.Context, e string) error { delete(s.m, e); return nil }

type fakeVerify struct{ sent int }

func (f *fakeVerify) Send(context.Context, string) error { f.sent++; return nil }
func (f *fakeVerify) Check(_ context.Context, _, c string) (Result, error) {
	if c == "123456" {
		return Result{OK: true}, nil
	}
	return Result{Reason: "incorrect_code"}, nil
}

var codeRe = regexp.MustCompile(`^[A-HJKMNP-Z2-9]{6}$`)

func TestNewCodeAlnum(t *testing.T) {
	for i := 0; i < 500; i++ {
		c := NewCode()
		if !codeRe.MatchString(c) || !strings.ContainsAny(c, "23456789") || !strings.ContainsAny(c, "ABCDEFGHJKMNPQRSTUVWXYZ") {
			t.Fatalf("kode tidak valid: %s", c)
		}
	}
}

func TestEmailOTPFlow(t *testing.T) {
	var lastCode string
	fail := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if fail {
			w.WriteHeader(422)
			_, _ = w.Write([]byte(`{"message":"domain not verified"}`))
			return
		}
		var b map[string]any
		_ = json.NewDecoder(r.Body).Decode(&b)
		subj := b["subject"].(string)
		lastCode = subj[len(subj)-6:]
		if b["category"] != "transactional" || !strings.Contains(b["html"].(string), lastCode[:3]+" "+lastCode[3:]) {
			t.Errorf("email tidak sesuai: %v", b)
		}
		w.WriteHeader(202)
	}))
	defer srv.Close()
	now := time.Date(2026, 10, 31, 10, 0, 0, 0, time.UTC)
	fv := &fakeVerify{}
	e := &Email{Store: &memCodes{m: map[string]CodeRecord{}}, Key: "k", BaseURL: srv.URL, From: "OceanBird <noreply@mail.psi.id>", Pepper: []byte("p"), Fallback: fv, Now: func() time.Time { return now }}
	ctx := context.Background()
	if err := e.Send(ctx, "A@b.co"); err != nil {
		t.Fatal(err)
	}
	if err := e.Send(ctx, "a@b.co"); err != ErrTooMany {
		t.Fatalf("kirim ulang < 45 detik harus ditolak: %v", err)
	}
	if r, _ := e.Check(ctx, "a@b.co", "ZZZZZ9"); r.OK || r.Remaining == nil || *r.Remaining != 4 {
		t.Fatalf("kode salah: %+v", r)
	}
	if r, _ := e.Check(ctx, "a@b.co", strings.ToLower(lastCode)); !r.OK {
		t.Fatalf("kode benar (huruf kecil) harus diterima: %+v", r)
	}
	if r, _ := e.Check(ctx, "a@b.co", lastCode); r.OK || r.Reason != "not_found" {
		t.Fatalf("kode sekali pakai: %+v", r)
	}
	// Kedaluwarsa.
	now = now.Add(time.Minute)
	_ = e.Send(ctx, "a@b.co")
	now = now.Add(11 * time.Minute)
	if r, _ := e.Check(ctx, "a@b.co", lastCode); r.Reason != "expired" {
		t.Fatalf("harus kedaluwarsa: %+v", r)
	}
	// Domain belum siap → cadangan Bird Verify (angka).
	fail = true
	now = now.Add(time.Minute)
	if err := e.Send(ctx, "c@d.co"); err != nil || fv.sent != 1 {
		t.Fatalf("cadangan: %v %d", err, fv.sent)
	}
	if r, _ := e.Check(ctx, "c@d.co", "123456"); !r.OK {
		t.Fatalf("cek lewat cadangan: %+v", r)
	}
	// Batas 5 kode per jam.
	fail = false
	for i := 0; i < 5; i++ {
		now = now.Add(time.Minute)
		_ = e.Send(ctx, "x@y.co")
	}
	now = now.Add(time.Minute)
	if err := e.Send(ctx, "x@y.co"); err != ErrTooMany {
		t.Fatalf("batas per jam: %v", err)
	}
}
