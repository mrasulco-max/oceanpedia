package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Claims adalah isi access token.
type Claims struct {
	Sub  string `json:"sub"`
	Role string `json:"role"`
	Plan string `json:"plan,omitempty"`
	Iss  string `json:"iss"`
	Iat  int64  `json:"iat"`
	Exp  int64  `json:"exp"`
}

// Issuer adalah nilai klaim iss.
const Issuer = "oceanpedia-api"

var (
	ErrTokenInvalid = errors.New("token tidak valid")
	ErrTokenExpired = errors.New("token kedaluwarsa")
	enc             = base64.RawURLEncoding
	header          = enc.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
)

// Sign membuat JWT HS256.
func Sign(secret []byte, c Claims, ttl time.Duration, now time.Time) (string, error) {
	c.Iss, c.Iat, c.Exp = Issuer, now.Unix(), now.Add(ttl).Unix()
	body, err := json.Marshal(c)
	if err != nil {
		return "", err
	}
	unsigned := header + "." + enc.EncodeToString(body)
	return unsigned + "." + enc.EncodeToString(mac(secret, unsigned)), nil
}

// Verify memeriksa tanda tangan, issuer dan masa berlaku.
func Verify(secret []byte, tok string, now time.Time) (Claims, error) {
	var c Claims
	p := strings.Split(tok, ".")
	if len(p) != 3 || p[0] != header {
		return c, ErrTokenInvalid
	}
	sig, err := enc.DecodeString(p[2])
	if err != nil || !hmac.Equal(sig, mac(secret, p[0]+"."+p[1])) {
		return c, ErrTokenInvalid
	}
	body, err := enc.DecodeString(p[1])
	if err != nil || json.Unmarshal(body, &c) != nil || c.Iss != Issuer || c.Sub == "" {
		return c, ErrTokenInvalid
	}
	if now.Unix() >= c.Exp {
		return c, ErrTokenExpired
	}
	return c, nil
}

func mac(secret []byte, s string) []byte {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(s))
	return m.Sum(nil)
}

type ctxKey struct{}

// WithClaims menyimpan klaim pada context.
func WithClaims(ctx context.Context, c Claims) context.Context {
	return context.WithValue(ctx, ctxKey{}, c)
}

// FromContext mengambil klaim (ok=false bila anonim).
func FromContext(ctx context.Context) (Claims, bool) {
	c, ok := ctx.Value(ctxKey{}).(Claims)
	return c, ok
}
