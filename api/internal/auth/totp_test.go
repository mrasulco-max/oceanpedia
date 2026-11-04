package auth

import (
	"testing"
	"time"
)

// Vektor uji RFC 6238 (SHA1, rahasia "12345678901234567890"), 6 digit terakhir.
func TestTOTPRFC6238(t *testing.T) {
	secret := b32.EncodeToString([]byte("12345678901234567890"))
	cases := map[int64]string{59: "287082", 1111111109: "081804", 1111111111: "050471", 1234567890: "005924", 2000000000: "279037"}
	for ts, want := range cases {
		got, err := TOTPCode(secret, time.Unix(ts, 0))
		if err != nil || got != want {
			t.Fatalf("t=%d: %s, mau %s (%v)", ts, got, want, err)
		}
	}
	now := time.Unix(1234567890, 0)
	if !VerifyTOTP(secret, "005924", now) || !VerifyTOTP(secret, "005924", now.Add(25*time.Second)) || VerifyTOTP(secret, "005924", now.Add(5*time.Minute)) || VerifyTOTP(secret, "12345", now) {
		t.Fatal("verifikasi jendela waktu salah")
	}
}

func TestSealTOTP(t *testing.T) {
	k := []byte("rahasia-server-uji-yang-panjang-sekali")
	s, _ := NewTOTPSecret()
	sealed, err := SealTOTP(k, s)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := OpenTOTP(k, sealed); err != nil || got != s {
		t.Fatalf("buka: %v %v", got, err)
	}
	if _, err := OpenTOTP([]byte("kunci-lain"), sealed); err == nil {
		t.Fatal("kunci salah harus gagal")
	}
	if u := TOTPURI(s, "a@b.co", "OceanBird"); u[:24] != "otpauth://totp/OceanBird" {
		t.Fatal(u)
	}
}
