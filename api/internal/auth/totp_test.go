package auth

import (
	"strings"
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

func TestTOTPStep(t *testing.T) {
	secret, _ := NewTOTPSecret()
	now := time.Unix(1_800_000_000, 0)
	code, _ := TOTPCode(secret, now)
	step, ok := TOTPStep(secret, code, now.Add(25*time.Second))
	if !ok || step != now.Unix()/30 {
		t.Fatalf("langkah: %d %v", step, ok)
	}
	if _, ok := TOTPStep(secret, code, now.Add(2*time.Minute)); ok {
		t.Fatal("kode kedaluwarsa diterima")
	}
}

func TestRecoveryCodes(t *testing.T) {
	codes, err := NewRecoveryCodes(RecoveryCount)
	if err != nil || len(codes) != RecoveryCount {
		t.Fatal(err, codes)
	}
	seen := map[string]bool{}
	for _, c := range codes {
		if len(c) != 11 || c[5] != '-' || NormalizeRecovery(c) == "" || seen[c] {
			t.Fatalf("format/duplikat: %q", c)
		}
		seen[c] = true
	}
	c := codes[0]
	if NormalizeRecovery(strings.ToLower(c)) != NormalizeRecovery(c) || NormalizeRecovery(strings.ReplaceAll(c, "-", " ")) != NormalizeRecovery(c) {
		t.Fatal("normalisasi")
	}
	for _, bad := range []string{"", "123456", "ABCDE-FGH2", "ABCDE-FGH23X", "ABCDE_FGH23"} {
		if NormalizeRecovery(bad) != "" {
			t.Fatalf("%q harus ditolak", bad)
		}
	}
	key := []byte("rahasia-server")
	if HashRecovery(key, "u1", c) != HashRecovery(key, "u1", strings.ToLower(c)) {
		t.Fatal("hash harus sama untuk masukan yang dinormalisasi")
	}
	if HashRecovery(key, "u1", c) == HashRecovery(key, "u2", c) || HashRecovery(key, "u1", c) == HashRecovery([]byte("lain"), "u1", c) {
		t.Fatal("hash harus terikat ke pengguna & rahasia server")
	}
	if strings.Contains(HashRecovery(key, "u1", c), ",") {
		t.Fatal("hash tidak boleh berisi pemisah koma")
	}
}
