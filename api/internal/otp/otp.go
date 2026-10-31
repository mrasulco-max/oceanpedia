// Package otp mengirim dan memeriksa kode verifikasi (OTP) lewat Bird Verify.
// Kode dibuat, dikirim, dan dibatasi (kedaluwarsa, jumlah percobaan, jeda kirim ulang) oleh Bird;
// server tidak pernah menerima atau menyimpan kodenya.
package otp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Sender adalah layanan OTP.
type Sender interface {
	Send(ctx context.Context, email string) error
	Check(ctx context.Context, email, code string) (Result, error)
}

// Result hasil pemeriksaan kode.
type Result struct {
	OK        bool
	Reason    string // incorrect_code | expired | attempts_exhausted | not_found
	Remaining *int
}

var (
	ErrTooMany     = errors.New("terlalu banyak permintaan kode")
	ErrUnavailable = errors.New("layanan kode verifikasi belum aktif")
)

// Bird memanggil https://{region}.platform.bird.com/v1/verify/….
type Bird struct {
	Key     string
	BaseURL string
	HTTP    *http.Client
}

func NewBird(key, baseURL string) *Bird {
	if baseURL == "" {
		baseURL = "https://eu1.platform.bird.com"
		if strings.HasPrefix(key, "bk_us1_") {
			baseURL = "https://us1.platform.bird.com"
		}
	}
	return &Bird{Key: key, BaseURL: strings.TrimRight(baseURL, "/"), HTTP: &http.Client{Timeout: 15 * time.Second}}
}

func (b *Bird) post(ctx context.Context, path string, body, out any) (int, error) {
	if b == nil || b.Key == "" {
		return 0, ErrUnavailable
	}
	buf, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.BaseURL+path, bytes.NewReader(buf))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+b.Key)
	req.Header.Set("Content-Type", "application/json")
	res, err := b.HTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusTooManyRequests {
		return res.StatusCode, ErrTooMany
	}
	if res.StatusCode >= 300 {
		var e struct {
			Message string `json:"message"`
			Error   any    `json:"error"`
		}
		_ = json.NewDecoder(res.Body).Decode(&e)
		return res.StatusCode, fmt.Errorf("bird %d: %s %v", res.StatusCode, e.Message, e.Error)
	}
	if out != nil {
		return res.StatusCode, json.NewDecoder(res.Body).Decode(out)
	}
	return res.StatusCode, nil
}

type to struct {
	Email string `json:"email"`
}

// Send mengirim (atau mengirim ulang) kode 6 digit ke email, berbahasa Indonesia.
func (b *Bird) Send(ctx context.Context, email string) error {
	body := map[string]any{"to": to{strings.ToLower(email)}, "options": map[string]any{"language": "id", "code_length": 6}}
	_, err := b.post(ctx, "/v1/verify/verifications", body, nil)
	return err
}

// Check memeriksa kode. Kode salah/kedaluwarsa bukan error: Result.OK = false.
func (b *Bird) Check(ctx context.Context, email, code string) (Result, error) {
	var r struct {
		Success           bool   `json:"success"`
		Reason            string `json:"reason"`
		AttemptsRemaining *int   `json:"attempts_remaining"`
	}
	status, err := b.post(ctx, "/v1/verify/verifications/check", map[string]any{"to": to{strings.ToLower(email)}, "code": code}, &r)
	if status == http.StatusNotFound {
		return Result{Reason: "not_found"}, nil // tidak ada kode aktif (kedaluwarsa / sudah dipakai)
	}
	if err != nil {
		return Result{}, err
	}
	return Result{OK: r.Success, Reason: r.Reason, Remaining: r.AttemptsRemaining}, nil
}

// Message: pesan untuk pengguna dari hasil pemeriksaan yang gagal.
func (r Result) Message() string {
	switch r.Reason {
	case "expired", "not_found":
		return "Kode sudah kedaluwarsa atau tidak berlaku. Minta kode baru."
	case "attempts_exhausted":
		return "Terlalu banyak percobaan. Minta kode baru."
	default:
		if r.Remaining != nil {
			return fmt.Sprintf("Kode salah. Sisa %d percobaan.", *r.Remaining)
		}
		return "Kode salah."
	}
}

// Dev untuk pengembangan lokal tanpa Bird: kode selalu "000000" (jangan dipakai di produksi).
type Dev struct{}

func (Dev) Send(context.Context, string) error { return nil }
func (Dev) Check(_ context.Context, _, code string) (Result, error) {
	if code == "000000" {
		return Result{OK: true}, nil
	}
	return Result{Reason: "incorrect_code"}, nil
}
