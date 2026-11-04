package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1" //nolint:gosec // TOTP (RFC 6238) memakai HMAC-SHA1 secara standar; aplikasi autentikator mengharapkannya.
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// TOTP: kode 6 digit, langkah 30 detik, HMAC-SHA1 — cocok dengan Google Authenticator, Authy, Microsoft Authenticator, 1Password.
const (
	totpDigits = 6
	totpStep   = 30
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// NewTOTPSecret membuat rahasia acak 160-bit (base32 tanpa padding).
func NewTOTPSecret() (string, error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return b32.EncodeToString(b), nil
}

// TOTPURI: tautan otpauth:// untuk dipindai / dibuka aplikasi autentikator.
func TOTPURI(secret, account, issuer string) string {
	label := url.PathEscape(issuer + ":" + account)
	q := url.Values{"secret": {secret}, "issuer": {issuer}, "algorithm": {"SHA1"}, "digits": {fmt.Sprint(totpDigits)}, "period": {fmt.Sprint(totpStep)}}
	return "otpauth://totp/" + label + "?" + q.Encode()
}

func totpAt(key []byte, counter uint64) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], counter)
	m := hmac.New(sha1.New, key)
	m.Write(msg[:])
	sum := m.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	v := binary.BigEndian.Uint32(sum[off:off+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", v%1_000_000)
}

// TOTPCode menghitung kode pada waktu t.
func TOTPCode(secret string, t time.Time) (string, error) {
	key, err := b32.DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil {
		return "", err
	}
	return totpAt(key, uint64(t.Unix()/totpStep)), nil
}

// VerifyTOTP menerima kode dari langkah sebelumnya, sekarang, atau berikutnya (toleransi jam ±30 detik).
func VerifyTOTP(secret, code string, t time.Time) bool {
	code = strings.ReplaceAll(strings.TrimSpace(code), " ", "")
	if len(code) != totpDigits {
		return false
	}
	key, err := b32.DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil {
		return false
	}
	c := uint64(t.Unix() / totpStep)
	for _, d := range []int64{-1, 0, 1} {
		if hmac.Equal([]byte(totpAt(key, uint64(int64(c)+d))), []byte(code)) {
			return true
		}
	}
	return false
}

func sealKey(secret []byte) []byte {
	h := sha256.Sum256(append([]byte("oceanpedia-totp:"), secret...))
	return h[:]
}

// SealTOTP mengenkripsi rahasia TOTP (AES-256-GCM, kunci turunan dari rahasia server) sebelum disimpan.
func SealTOTP(serverSecret []byte, plain string) (string, error) {
	blk, err := aes.NewCipher(sealKey(serverSecret))
	if err != nil {
		return "", err
	}
	g, err := cipher.NewGCM(blk)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, g.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return "v1:" + base64.RawStdEncoding.EncodeToString(g.Seal(nonce, nonce, []byte(plain), nil)), nil
}

// OpenTOTP membuka rahasia TOTP yang tersimpan.
func OpenTOTP(serverSecret []byte, sealed string) (string, error) {
	raw, ok := strings.CutPrefix(sealed, "v1:")
	if !ok {
		return "", errors.New("format rahasia TOTP tidak dikenal")
	}
	b, err := base64.RawStdEncoding.DecodeString(raw)
	if err != nil {
		return "", err
	}
	blk, err := aes.NewCipher(sealKey(serverSecret))
	if err != nil {
		return "", err
	}
	g, err := cipher.NewGCM(blk)
	if err != nil {
		return "", err
	}
	if len(b) < g.NonceSize() {
		return "", errors.New("rahasia TOTP rusak")
	}
	out, err := g.Open(nil, b[:g.NonceSize()], b[g.NonceSize():], nil)
	return string(out), err
}
