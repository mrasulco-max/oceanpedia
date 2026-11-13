package pay

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Doku adalah klien DOKU Checkout (halaman bayar DOKU) + cek status order.
//
// Setiap permintaan ditandatangani HMAC-SHA256 dengan Secret Key (header Client-Id, Request-Id,
// Request-Timestamp, Signature); notifikasi DOKU diverifikasi dengan skema yang sama.
type Doku struct {
	ClientID   string
	SecretKey  string
	Production bool
	HTTP       *http.Client
	Now        func() time.Time
}

// Enabled menandakan kredensial DOKU tersedia.
func (d *Doku) Enabled() bool { return d != nil && d.ClientID != "" && d.SecretKey != "" }

func (d *Doku) base() string {
	if d.Production {
		return "https://api.doku.com"
	}
	return "https://api-sandbox.doku.com"
}

func (d *Doku) now() time.Time {
	if d.Now != nil {
		return d.Now()
	}
	return time.Now()
}

// DokuRequest adalah data pembayaran DOKU Checkout.
type DokuRequest struct {
	InvoiceNumber string
	Amount        int64
	Items         []Item
	Name          string
	Email         string
	Phone         string
	Methods       []string // payment_method_types (kosong = semua yang aktif di akun DOKU)
	CallbackURL   string   // kembali ke situs setelah bayar
	DueMinutes    int
}

// DokuResult berisi URL halaman bayar DOKU.
type DokuResult struct {
	URL       string
	TokenID   string
	ExpiresAt string
}

// CreatePayment membuat sesi DOKU Checkout.
func (d *Doku) CreatePayment(ctx context.Context, in DokuRequest) (DokuResult, error) {
	items := make([]map[string]any, 0, len(in.Items))
	for _, it := range in.Items {
		items = append(items, map[string]any{"id": it.ID, "name": it.Name, "price": it.Price, "quantity": it.Quantity})
	}
	order := map[string]any{"amount": in.Amount, "invoice_number": in.InvoiceNumber, "currency": "IDR", "line_items": items}
	if in.CallbackURL != "" {
		order["callback_url"] = in.CallbackURL
		order["callback_url_cancel"] = in.CallbackURL
	}
	payment := map[string]any{}
	if in.DueMinutes > 0 {
		payment["payment_due_date"] = in.DueMinutes
	}
	if len(in.Methods) > 0 {
		payment["payment_method_types"] = in.Methods
	}
	body := map[string]any{
		"order":    order,
		"payment":  payment,
		"customer": map[string]any{"id": in.Email, "name": in.Name, "email": in.Email, "phone": in.Phone},
	}
	var out struct {
		Response struct {
			Payment struct {
				URL         string `json:"url"`
				TokenID     string `json:"token_id"`
				ExpiredDate string `json:"expired_date"`
			} `json:"payment"`
		} `json:"response"`
	}
	if err := d.do(ctx, http.MethodPost, "/checkout/v1/payment", body, &out); err != nil {
		return DokuResult{}, err
	}
	p := out.Response.Payment
	if p.URL == "" {
		return DokuResult{}, errors.New("doku: URL pembayaran kosong")
	}
	return DokuResult{URL: p.URL, TokenID: p.TokenID, ExpiresAt: p.ExpiredDate}, nil
}

// DokuNotice adalah isi notifikasi / status order DOKU (bagian yang dipakai).
type DokuNotice struct {
	Order struct {
		InvoiceNumber string  `json:"invoice_number"`
		Amount        float64 `json:"amount"`
	} `json:"order"`
	Transaction struct {
		Status string `json:"status"` // SUCCESS | PENDING | FAILED | EXPIRED | REFUNDED ...
		Date   string `json:"date"`
		ID     string `json:"original_request_id"`
	} `json:"transaction"`
	Service struct {
		ID string `json:"id"`
	} `json:"service"`
	Channel struct {
		ID string `json:"id"`
	} `json:"channel"`
	VirtualAccount struct {
		Number string `json:"virtual_account_number"`
	} `json:"virtual_account_info"`
}

// Method: kanal bayar DOKU dalam huruf kecil (mis. virtual_account_bca, qris).
func (n DokuNotice) Method() string {
	if n.Channel.ID != "" {
		return strings.ToLower(n.Channel.ID)
	}
	return strings.ToLower(n.Service.ID)
}

// Outcome menerjemahkan status DOKU: paid | pending | failed | expired | refunded.
func (n DokuNotice) Outcome() string {
	switch strings.ToUpper(n.Transaction.Status) {
	case "SUCCESS":
		return "paid"
	case "FAILED", "CANCELLED", "CANCELED":
		return "failed"
	case "EXPIRED", "TIMEOUT":
		return "expired"
	case "REFUNDED", "REFUND":
		return "refunded"
	}
	return "pending"
}

// Status membaca status order DOKU berdasarkan nomor invoice.
func (d *Doku) Status(ctx context.Context, invoiceNumber string) (DokuNotice, error) {
	var n DokuNotice
	err := d.do(ctx, http.MethodGet, "/orders/v1/status/"+invoiceNumber, nil, &n)
	return n, err
}

// VerifyNotification memeriksa header Signature notifikasi DOKU untuk path target & body mentah.
func (d *Doku) VerifyNotification(h http.Header, target string, body []byte) bool {
	if !d.Enabled() || h.Get("Client-Id") != d.ClientID {
		return false
	}
	want := d.sign(h.Get("Request-Id"), h.Get("Request-Timestamp"), target, body)
	return subtle.ConstantTimeCompare([]byte(want), []byte(h.Get("Signature"))) == 1
}

// sign: "HMACSHA256=" + base64(HMAC-SHA256(secret, komponen)). Digest hanya untuk permintaan berbody.
func (d *Doku) sign(reqID, ts, target string, body []byte) string {
	comp := "Client-Id:" + d.ClientID + "\nRequest-Id:" + reqID + "\nRequest-Timestamp:" + ts + "\nRequest-Target:" + target
	if len(body) > 0 {
		sum := sha256.Sum256(body)
		comp += "\nDigest:" + base64.StdEncoding.EncodeToString(sum[:])
	}
	m := hmac.New(sha256.New, []byte(d.SecretKey))
	m.Write([]byte(comp))
	return "HMACSHA256=" + base64.StdEncoding.EncodeToString(m.Sum(nil))
}

func newRequestID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func (d *Doku) do(ctx context.Context, method, target string, body any, out any) error {
	if !d.Enabled() {
		return errors.New("doku belum dikonfigurasi")
	}
	var raw []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		raw = b
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, d.base()+target, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	rid := newRequestID()
	ts := d.now().UTC().Format("2006-01-02T15:04:05Z")
	req.Header.Set("Client-Id", d.ClientID)
	req.Header.Set("Request-Id", rid)
	req.Header.Set("Request-Timestamp", ts)
	req.Header.Set("Signature", d.sign(rid, ts, target, raw))
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	c := d.HTTP
	if c == nil {
		c = http.DefaultClient
	}
	res, err := c.Do(req)
	if err != nil {
		return fmt.Errorf("doku: %w", err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if res.StatusCode >= 300 {
		var e struct {
			Message []string `json:"message"`
			Error   struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(b, &e)
		msg := strings.Join(e.Message, "; ")
		if msg == "" {
			msg = e.Error.Message
		}
		return fmt.Errorf("doku %d: %s", res.StatusCode, msg)
	}
	return json.Unmarshal(b, out)
}
