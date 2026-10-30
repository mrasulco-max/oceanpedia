// Package auth: hash kata sandi (PBKDF2-HMAC-SHA256, rekomendasi OWASP) dan token JWT HS256.
package auth

import (
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

const (
	pbkdf2Iter = 600_000 // OWASP Password Storage Cheat Sheet (PBKDF2-HMAC-SHA256)
	saltLen    = 16
	keyLen     = 32
)

var b64 = base64.RawStdEncoding

// HashPassword menghasilkan string format: pbkdf2-sha256$<iter>$<salt>$<hash>.
func HashPassword(pw string) (string, error) {
	if err := ValidatePassword(pw); err != nil {
		return "", err
	}
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	dk, err := pbkdf2.Key(sha256.New, pw, salt, pbkdf2Iter, keyLen)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("pbkdf2-sha256$%d$%s$%s", pbkdf2Iter, b64.EncodeToString(salt), b64.EncodeToString(dk)), nil
}

// CheckPassword membandingkan kata sandi dengan hash secara constant-time.
func CheckPassword(encoded, pw string) bool {
	p := strings.Split(encoded, "$")
	if len(p) != 4 || p[0] != "pbkdf2-sha256" {
		return false
	}
	iter, err := strconv.Atoi(p[1])
	if err != nil || iter < 1 {
		return false
	}
	salt, err1 := b64.DecodeString(p[2])
	want, err2 := b64.DecodeString(p[3])
	if err1 != nil || err2 != nil {
		return false
	}
	got, err := pbkdf2.Key(sha256.New, pw, salt, iter, len(want))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(got, want) == 1
}

// ErrWeakPassword dikembalikan bila kata sandi tidak memenuhi syarat.
var ErrWeakPassword = errors.New("kata sandi minimal 8 karakter dan maksimal 128 karakter")

// ValidatePassword menerapkan aturan NIST SP 800-63B (panjang, tanpa aturan komposisi berlebihan).
func ValidatePassword(pw string) error {
	if n := len([]rune(pw)); n < 8 || n > 128 {
		return ErrWeakPassword
	}
	return nil
}
