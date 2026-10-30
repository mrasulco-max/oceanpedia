package httpx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"slices"
	"strings"
	"sync"
	"time"
)

type ctxKey int

const (
	keyLogger ctxKey = iota
	keyRequestID
)

// LoggerFrom mengambil logger milik request (berisi request_id).
func LoggerFrom(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(keyLogger).(*slog.Logger); ok {
		return l
	}
	return slog.Default()
}

// Middleware membungkus handler.
type Middleware func(http.Handler) http.Handler

// Chain menerapkan middleware berurutan (yang pertama paling luar).
func Chain(h http.Handler, m ...Middleware) http.Handler {
	for i := len(m) - 1; i >= 0; i-- {
		h = m[i](h)
	}
	return h
}

type statusWriter struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (w *statusWriter) WriteHeader(s int) { w.status = s; w.ResponseWriter.WriteHeader(s) }
func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = 200
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytes += n
	return n, err
}

// RequestLog memberi X-Request-ID dan mencatat setiap request (JSON terstruktur).
func RequestLog(base *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get("X-Request-ID")
			if id == "" || len(id) > 64 {
				b := make([]byte, 8)
				_, _ = rand.Read(b)
				id = hex.EncodeToString(b)
			}
			w.Header().Set("X-Request-ID", id)
			l := base.With("request_id", id)
			ctx := context.WithValue(context.WithValue(r.Context(), keyLogger, l), keyRequestID, id)
			sw := &statusWriter{ResponseWriter: w}
			start := time.Now()
			next.ServeHTTP(sw, r.WithContext(ctx))
			l.Info("http", "method", r.Method, "path", r.URL.Path, "status", sw.status, "bytes", sw.bytes, "dur_ms", time.Since(start).Milliseconds())
		})
	}
}

// Recover mengubah panic menjadi 500.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				LoggerFrom(r.Context()).Error("panic", "value", v, "stack", string(debug.Stack()))
				Error(w, r, &Problem{Type: "about:blank", Title: "Kesalahan server", Status: 500})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// SecureHeaders menambahkan header keamanan dasar (OWASP).
func SecureHeaders(production bool) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
			h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
			if production {
				h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
			}
			next.ServeHTTP(w, r)
		})
	}
}

// CORS mengizinkan origin yang terdaftar saja.
func CORS(origins []string) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			o := r.Header.Get("Origin")
			if o != "" && slices.Contains(origins, o) {
				h := w.Header()
				h.Set("Access-Control-Allow-Origin", o)
				h.Set("Access-Control-Allow-Credentials", "true")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID")
				h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				h.Set("Access-Control-Max-Age", "600")
				h.Add("Vary", "Origin")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RateLimit membatasi request per IP dengan token bucket sederhana (in-memory).
func RateLimit(rps float64, burst int) Middleware {
	type bucket struct {
		tokens float64
		last   time.Time
	}
	var mu sync.Mutex
	buckets := map[string]*bucket{}
	go func() { // bersihkan bucket lama
		for range time.Tick(time.Minute) {
			mu.Lock()
			for k, b := range buckets {
				if time.Since(b.last) > 5*time.Minute {
					delete(buckets, k)
				}
			}
			mu.Unlock()
		}
	}()
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := ClientIP(r)
			now := time.Now()
			mu.Lock()
			b, ok := buckets[ip]
			if !ok {
				b = &bucket{tokens: float64(burst), last: now}
				buckets[ip] = b
			}
			b.tokens = min(float64(burst), b.tokens+now.Sub(b.last).Seconds()*rps)
			b.last = now
			allowed := b.tokens >= 1
			if allowed {
				b.tokens--
			}
			mu.Unlock()
			if !allowed {
				w.Header().Set("Retry-After", "1")
				Error(w, r, TooMany())
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ClientIP mengambil IP klien (menghormati X-Forwarded-For dari proxy tepercaya).
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
