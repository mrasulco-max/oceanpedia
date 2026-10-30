// Package httpx berisi utilitas HTTP: respons JSON, Problem Details (RFC 9457), dan middleware.
package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

// Problem mengikuti RFC 9457 (application/problem+json).
type Problem struct {
	Type     string            `json:"type"`
	Title    string            `json:"title"`
	Status   int               `json:"status"`
	Detail   string            `json:"detail,omitempty"`
	Instance string            `json:"instance,omitempty"`
	Errors   map[string]string `json:"errors,omitempty"`
}

func (p *Problem) Error() string { return p.Title + ": " + p.Detail }

// Konstruktor problem umum.
func BadRequest(detail string) *Problem {
	return &Problem{Type: "about:blank", Title: "Permintaan tidak valid", Status: 400, Detail: detail}
}
func Unauthorized(detail string) *Problem {
	return &Problem{Type: "about:blank", Title: "Perlu masuk", Status: 401, Detail: detail}
}
func Forbidden(detail string) *Problem {
	return &Problem{Type: "about:blank", Title: "Akses ditolak", Status: 403, Detail: detail}
}
func NotFound(detail string) *Problem {
	return &Problem{Type: "about:blank", Title: "Tidak ditemukan", Status: 404, Detail: detail}
}
func Conflict(detail string) *Problem {
	return &Problem{Type: "about:blank", Title: "Konflik data", Status: 409, Detail: detail}
}
func TooMany() *Problem {
	return &Problem{Type: "about:blank", Title: "Terlalu banyak permintaan", Status: 429, Detail: "Coba lagi sebentar lagi."}
}

// Validation membuat problem 422 dengan detail per field.
func Validation(fields map[string]string) *Problem {
	return &Problem{Type: "https://oceanpedia.id/problems/validation", Title: "Validasi gagal", Status: 422, Errors: fields}
}

// ErrNotFound dipakai lapisan store untuk data yang tidak ada.
var ErrNotFound = errors.New("not found")

// JSON menulis respons JSON.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Error menulis error sebagai Problem; error lain menjadi 500 tanpa membocorkan detail.
func Error(w http.ResponseWriter, r *http.Request, err error) {
	var p *Problem
	switch {
	case errors.As(err, &p):
	case errors.Is(err, ErrNotFound):
		p = NotFound("Data tidak ditemukan.")
	default:
		LoggerFrom(r.Context()).Error("internal error", "err", err)
		p = &Problem{Type: "about:blank", Title: "Kesalahan server", Status: 500, Detail: "Terjadi kesalahan. Coba lagi nanti."}
	}
	cp := *p
	cp.Instance = r.URL.Path
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(cp.Status)
	_ = json.NewEncoder(w).Encode(cp)
}

// Decode membaca body JSON (maks. 1 MiB) dan menolak field yang tidak dikenal.
func Decode(r *http.Request, v any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return BadRequest("Body JSON tidak valid: " + err.Error())
	}
	return nil
}
