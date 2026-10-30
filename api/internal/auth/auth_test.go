package auth

import (
	"strings"
	"testing"
	"time"
)

func TestPasswordRoundTrip(t *testing.T) {
	h, err := HashPassword("rahasia-panjang")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "pbkdf2-sha256$600000$") {
		t.Fatalf("format hash tak terduga: %s", h)
	}
	if !CheckPassword(h, "rahasia-panjang") || CheckPassword(h, "salah-sandi") {
		t.Fatal("verifikasi kata sandi keliru")
	}
	if _, err := HashPassword("pendek"); err == nil {
		t.Fatal("kata sandi pendek seharusnya ditolak")
	}
}

func TestJWT(t *testing.T) {
	secret := []byte(strings.Repeat("k", 32))
	now := time.Unix(1_800_000_000, 0)
	tok, err := Sign(secret, Claims{Sub: "u1", Role: "reader"}, time.Minute, now)
	if err != nil {
		t.Fatal(err)
	}
	c, err := Verify(secret, tok, now.Add(30*time.Second))
	if err != nil || c.Sub != "u1" || c.Role != "reader" {
		t.Fatalf("verify: %v %+v", err, c)
	}
	if _, err := Verify(secret, tok, now.Add(2*time.Minute)); err != ErrTokenExpired {
		t.Fatalf("seharusnya kedaluwarsa, dapat %v", err)
	}
	if _, err := Verify([]byte(strings.Repeat("x", 32)), tok, now); err != ErrTokenInvalid {
		t.Fatalf("secret lain seharusnya invalid, dapat %v", err)
	}
	tampered := tok[:len(tok)-2] + "AA"
	if _, err := Verify(secret, tampered, now); err != ErrTokenInvalid {
		t.Fatal("token yang diubah seharusnya ditolak")
	}
}
