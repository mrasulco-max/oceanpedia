package otp

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"html"
	"math/big"
	"net/http"
	"strings"
	"time"
)

// CodeRecord adalah kode aktif untuk satu email (hanya hash yang disimpan).
type CodeRecord struct {
	Email      string
	Hash       []byte
	Provider   string // "email" | "verify"
	ExpiresAt  time.Time
	Attempts   int
	SentAt     time.Time
	WindowAt   time.Time
	WindowSent int
}

// CodeStore menyimpan kode aktif (tabel auth_codes).
type CodeStore interface {
	AuthCode(ctx context.Context, email string) (CodeRecord, bool, error)
	SaveAuthCode(ctx context.Context, r CodeRecord) error
	AuthCodeAttempt(ctx context.Context, email string) error
	DeleteAuthCode(ctx context.Context, email string) error
}

// Alfabet tanpa karakter yang mudah tertukar (0/O, 1/I/L).
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

const (
	codeLen     = 6
	codeTTL     = 10 * time.Minute
	maxAttempts = 5
	resendWait  = 45 * time.Second
	hourlySends = 5
)

// NewCode membuat kode 6 karakter acak berisi huruf dan angka (minimal satu dari masing-masing).
func NewCode() string {
	for {
		b := make([]byte, codeLen)
		for i := range b {
			n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
			b[i] = alphabet[n.Int64()]
		}
		s := string(b)
		if strings.ContainsAny(s, "23456789") && strings.ContainsAny(s, "ABCDEFGHJKMNPQRSTUVWXYZ") {
			return s
		}
	}
}

// Email mengirim kode huruf+angka buatan server lewat Bird Email dari domain sendiri.
// Bila pengiriman email gagal (mis. domain belum terverifikasi), kode dikirim lewat Bird Verify (angka) sebagai cadangan.
type Email struct {
	Store    CodeStore
	Key      string // Bird API key dengan izin emails:write
	BaseURL  string
	From     string // mis. "OceanBird <noreply@mail.psi.id>"
	Pepper   []byte
	Fallback Sender
	HTTP     *http.Client
	Now      func() time.Time
}

func (e *Email) now() time.Time {
	if e.Now != nil {
		return e.Now()
	}
	return time.Now()
}

func (e *Email) hash(email, code string) []byte {
	m := hmac.New(sha256.New, e.Pepper)
	m.Write([]byte(strings.ToLower(email) + "\x00" + strings.ToUpper(code)))
	return m.Sum(nil)
}

func (e *Email) Send(ctx context.Context, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	now := e.now()
	rec, found, err := e.Store.AuthCode(ctx, email)
	if err != nil {
		return err
	}
	// Batas kirim ulang: jeda 45 detik & maks. 5 kode per jam per email.
	win, sent := now, 1
	if found {
		if now.Sub(rec.SentAt) < resendWait {
			return ErrTooMany
		}
		if now.Sub(rec.WindowAt) < time.Hour {
			if rec.WindowSent >= hourlySends {
				return ErrTooMany
			}
			win, sent = rec.WindowAt, rec.WindowSent+1
		}
	}
	code := NewCode()
	r := CodeRecord{Email: email, Hash: e.hash(email, code), Provider: "email", ExpiresAt: now.Add(codeTTL), SentAt: now, WindowAt: win, WindowSent: sent}
	if err := e.sendMail(ctx, email, code); err != nil {
		if e.Fallback == nil {
			return err
		}
		// Cadangan: Bird Verify (kode angka) sampai domain pengirim siap.
		if ferr := e.Fallback.Send(ctx, email); ferr != nil {
			return ferr
		}
		r.Hash, r.Provider = nil, "verify"
	}
	return e.Store.SaveAuthCode(ctx, r)
}

func (e *Email) Check(ctx context.Context, email, code string) (Result, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	code = strings.ToUpper(strings.TrimSpace(code))
	rec, found, err := e.Store.AuthCode(ctx, email)
	if err != nil {
		return Result{}, err
	}
	if !found {
		return Result{Reason: "not_found"}, nil
	}
	if rec.Provider == "verify" && e.Fallback != nil {
		r, err := e.Fallback.Check(ctx, email, code)
		if err == nil && (r.OK || r.Reason == "not_found" || r.Reason == "expired" || r.Reason == "attempts_exhausted") {
			_ = e.Store.DeleteAuthCode(ctx, email)
		}
		return r, err
	}
	if e.now().After(rec.ExpiresAt) {
		_ = e.Store.DeleteAuthCode(ctx, email)
		return Result{Reason: "expired"}, nil
	}
	if rec.Attempts >= maxAttempts {
		return Result{Reason: "attempts_exhausted"}, nil
	}
	if hmac.Equal(rec.Hash, e.hash(email, code)) {
		if err := e.Store.DeleteAuthCode(ctx, email); err != nil {
			return Result{}, err
		}
		return Result{OK: true}, nil
	}
	if err := e.Store.AuthCodeAttempt(ctx, email); err != nil {
		return Result{}, err
	}
	left := maxAttempts - rec.Attempts - 1
	if left <= 0 {
		return Result{Reason: "attempts_exhausted"}, nil
	}
	return Result{Reason: "incorrect_code", Remaining: &left}, nil
}

func (e *Email) sendMail(ctx context.Context, to, code string) error {
	if e.Key == "" || e.From == "" {
		return ErrUnavailable
	}
	spaced := code[:3] + " " + code[3:]
	body := map[string]any{
		"from":     e.From,
		"to":       []string{to},
		"subject":  "Kode verifikasi OceanBird: " + code,
		"category": "transactional",
		"text":     fmt.Sprintf("Kode verifikasi OceanBird kamu: %s\n\nBerlaku 10 menit. Kode terdiri dari huruf dan angka (tidak membedakan huruf besar/kecil).\nJangan bagikan kode ini kepada siapa pun, termasuk yang mengaku dari OceanBird.\n\nJika kamu tidak meminta kode ini, abaikan email ini.\n\nOceanBird — Berita & data pasar\n", code),
		"html":     mailHTML(code, spaced),
		"headers":  map[string]string{"X-Entity-Ref-ID": fmt.Sprintf("otp-%d", e.now().UnixNano())},
	}
	buf, _ := json.Marshal(body)
	base := e.BaseURL
	if base == "" {
		base = "https://eu1.platform.bird.com"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(base, "/")+"/v1/email/messages", bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+e.Key)
	req.Header.Set("Content-Type", "application/json")
	hc := e.HTTP
	if hc == nil {
		hc = &http.Client{Timeout: 15 * time.Second}
	}
	res, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		var b bytes.Buffer
		_, _ = b.ReadFrom(res.Body)
		return fmt.Errorf("bird email %d: %s", res.StatusCode, strings.TrimSpace(b.String()))
	}
	return nil
}

func mailHTML(code, spaced string) string {
	c := html.EscapeString(spaced)
	return `<!doctype html><html lang="id"><body style="margin:0;background:#F6F8FC;font-family:Roboto,Arial,sans-serif;color:#0B0B0F">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid #E3EAF4;border-radius:24px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;color:#2F74EB">OceanBird</td></tr>
<tr><td style="padding-top:20px;font-size:22px;font-weight:700">Kode verifikasi kamu</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:1.5;color:#5F6B7D">Masukkan kode berikut di aplikasi atau situs OceanBird. Kode berisi huruf dan angka, berlaku 10 menit.</td></tr>
<tr><td style="padding:24px 0"><div style="font-family:'Roboto Mono',Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;background:#F2F7FF;border:1.5px solid #C9DBFB;border-radius:16px;padding:18px 8px;color:#0B0B0F">` + c + `</div></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#5F6B7D">Jangan bagikan kode ini kepada siapa pun, termasuk yang mengaku dari OceanBird. Jika kamu tidak meminta kode ini, abaikan email ini.</td></tr>
</table>
<div style="padding-top:16px;font-size:12px;color:#8794A8">OceanBird · Berita &amp; data pasar · ` + html.EscapeString(code) + `</div>
</td></tr></table></body></html>`
}
