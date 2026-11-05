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
	_, ok := TOTPStep(secret, code, t)
	return ok
}

// TOTPStep seperti VerifyTOTP, tetapi juga mengembalikan nomor langkah (counter) kode yang cocok,
// supaya pemanggil bisa menolak kode yang sama dipakai dua kali (lihat Store.UseTOTPStep).
func TOTPStep(secret, code string, t time.Time) (int64, bool) {
	code = strings.ReplaceAll(strings.TrimSpace(code), " ", "")
	if len(code) != totpDigits {
		return 0, false
	}
	key, err := b32.DecodeString(strings.ToUpper(strings.TrimSpace(secret)))
	if err != nil {
		return 0, false
	}
	c := t.Unix() / totpStep
	for _, d := range []int64{-1, 0, 1} {
		if hmac.Equal([]byte(totpAt(key, uint64(c+d))), []byte(code)) {
			return c + d, true
		}
	}
	return 0, false
}

// ======================================================================= kode cadangan

// Alfabet kode cadangan: tanpa karakter yang mudah tertukar (0/O, 1/I/L).
const recoveryAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// RecoveryCount: jumlah kode cadangan yang dibuat sekali jalan.
const RecoveryCount = 10

const recoveryLen = 10 // 10 karakter dari 31 simbol ≈ 49 bit acak per kode

// NewRecoveryCodes membuat n kode cadangan sekali pakai, format "ABCDE-FGH23".
func NewRecoveryCodes(n int) ([]string, error) {
	out := make([]string, 0, n)
	buf := make([]byte, recoveryLen)
	for len(out) < n {
		if _, err := rand.Read(buf); err != nil {
			return nil, err
		}
		var b strings.Builder
		for i, x := range buf {
			if i == recoveryLen/2 {
				b.WriteByte('-')
			}
			// 248 = 8 × 31: tolak nilai ≥ 248 agar sebaran merata (tanpa bias modulo).
			for x >= 248 {
				var one [1]byte
				if _, err := rand.Read(one[:]); err != nil {
					return nil, err
				}
				x = one[0]
			}
			b.WriteByte(recoveryAlphabet[int(x)%len(recoveryAlphabet)])
		}
		out = append(out, b.String())
	}
	return out, nil
}

// NormalizeRecovery menyeragamkan masukan kode cadangan (huruf besar, tanpa spasi/tanda hubung).
// Mengembalikan "" bila bentuknya bukan kode cadangan.
func NormalizeRecovery(code string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(code) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else if r != '-' && r != ' ' {
			return ""
		}
	}
	if b.Len() != recoveryLen {
		return ""
	}
	return b.String()
}

// HashRecovery: hash HMAC-SHA256 kode cadangan (terikat ke pengguna). Hanya hash yang disimpan.
// Kode berentropi tinggi (≈49 bit) sehingga HMAC dengan rahasia server cukup — tidak perlu hash lambat.
func HashRecovery(serverSecret []byte, uid, code string) string {
	m := hmac.New(sha256.New, append([]byte("oceanpedia-recovery:"), serverSecret...))
	m.Write([]byte(uid + "\x00" + NormalizeRecovery(code)))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
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
