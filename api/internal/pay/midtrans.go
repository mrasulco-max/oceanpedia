// Package pay berisi klien payment gateway Midtrans (Snap + status transaksi).
//
// Server key hanya dibaca dari environment dan dipakai di sisi server untuk Basic Auth serta
// verifikasi tanda tangan notifikasi; tidak pernah dikirim ke peramban.
package pay

import (
	"bytes"
	"context"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ErrNotFound: transaksi belum ada di Midtrans (mis. pembeli belum memilih metode bayar).
var ErrNotFound = errors.New("transaksi midtrans tidak ditemukan")

// Midtrans adalah klien Snap & Core API.
type Midtrans struct {
	ServerKey  string
	Production bool
	NotifyURL  string // X-Override-Notification (webhook per transaksi)
	HTTP       *http.Client
}

func (m *Midtrans) snapBase() string {
	if m.Production {
		return "https://app.midtrans.com/snap/v1"
	}
	return "https://app.sandbox.midtrans.com/snap/v1"
}

func (m *Midtrans) apiBase() string {
	if m.Production {
		return "https://api.midtrans.com/v2"
	}
	return "https://api.sandbox.midtrans.com/v2"
}

// Enabled menandakan kunci server tersedia.
func (m *Midtrans) Enabled() bool { return m != nil && m.ServerKey != "" }

// Item baris tagihan.
type Item struct {
	ID       string `json:"id"`
	Price    int64  `json:"price"`
	Quantity int    `json:"quantity"`
	Name     string `json:"name"`
}

// SnapRequest adalah data transaksi Snap.
type SnapRequest struct {
	OrderID   string
	Gross     int64
	Items     []Item
	Name      string
	Email     string
	Phone     string
	Methods   []string // enabled_payments (kosong = semua)
	FinishURL string
	ExpiryMin int
}

// SnapResult berisi token & URL halaman bayar Midtrans.
type SnapResult struct {
	Token       string `json:"token"`
	RedirectURL string `json:"redirect_url"`
}

// CreateSnap membuat transaksi Snap.
func (m *Midtrans) CreateSnap(ctx context.Context, in SnapRequest) (SnapResult, error) {
	body := map[string]any{
		"transaction_details": map[string]any{"order_id": in.OrderID, "gross_amount": in.Gross},
		"item_details":        in.Items,
		"customer_details":    map[string]any{"first_name": in.Name, "email": in.Email, "phone": in.Phone},
		"credit_card":         map[string]any{"secure": true},
	}
	if len(in.Methods) > 0 {
		body["enabled_payments"] = in.Methods
	}
	if in.FinishURL != "" {
		body["callbacks"] = map[string]any{"finish": in.FinishURL, "error": in.FinishURL, "pending": in.FinishURL}
	}
	if in.ExpiryMin > 0 {
		body["expiry"] = map[string]any{"unit": "minute", "duration": in.ExpiryMin}
	}
	var out SnapResult
	err := m.do(ctx, http.MethodPost, m.snapBase()+"/transactions", body, &out)
	if err == nil && out.Token == "" {
		err = errors.New("midtrans: token kosong")
	}
	return out, err
}

// Status adalah status transaksi (Core API / notifikasi).
type Status struct {
	OrderID           string `json:"order_id"`
	StatusCode        string `json:"status_code"`
	GrossAmount       string `json:"gross_amount"`
	TransactionStatus string `json:"transaction_status"`
	FraudStatus       string `json:"fraud_status"`
	PaymentType       string `json:"payment_type"`
	TransactionID     string `json:"transaction_id"`
	TransactionTime   string `json:"transaction_time"`
	SettlementTime    string `json:"settlement_time"`
	ExpiryTime        string `json:"expiry_time"`
	SignatureKey      string `json:"signature_key"`
	Bank              string `json:"bank"`
	VANumbers         []struct {
		Bank     string `json:"bank"`
		VANumber string `json:"va_number"`
	} `json:"va_numbers"`
	BillKey    string `json:"bill_key"`
	BillerCode string `json:"biller_code"`
	PermataVA  string `json:"permata_va_number"`
	StatusMsg  string `json:"status_message"`
}

// GetStatus membaca status transaksi dari Midtrans.
func (m *Midtrans) GetStatus(ctx context.Context, orderID string) (Status, error) {
	var st Status
	if err := m.do(ctx, http.MethodGet, m.apiBase()+"/"+orderID+"/status", nil, &st); err != nil {
		return st, err
	}
	if st.StatusCode == "404" {
		return st, ErrNotFound
	}
	return st, nil
}

// VerifySignature memeriksa signature_key = SHA512(order_id + status_code + gross_amount + server_key).
func (m *Midtrans) VerifySignature(st Status) bool {
	h := sha512.Sum512([]byte(st.OrderID + st.StatusCode + st.GrossAmount + m.ServerKey))
	want := hex.EncodeToString(h[:])
	return subtle.ConstantTimeCompare([]byte(want), []byte(strings.ToLower(st.SignatureKey))) == 1
}

// Outcome menerjemahkan status Midtrans: paid | pending | failed | expired | refunded.
func Outcome(st Status) string {
	switch st.TransactionStatus {
	case "settlement":
		return "paid"
	case "capture":
		if st.FraudStatus == "" || st.FraudStatus == "accept" {
			return "paid"
		}
		return "pending"
	case "pending", "authorize":
		return "pending"
	case "expire":
		return "expired"
	case "refund", "partial_refund", "chargeback", "partial_chargeback":
		return "refunded"
	case "deny", "cancel", "failure":
		return "failed"
	}
	return "pending"
}

func (m *Midtrans) do(ctx context.Context, method, url string, body any, out any) error {
	if !m.Enabled() {
		return errors.New("midtrans belum dikonfigurasi")
	}
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, url, rd)
	if err != nil {
		return err
	}
	req.SetBasicAuth(m.ServerKey, "")
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if m.NotifyURL != "" && method == http.MethodPost {
		req.Header.Set("X-Override-Notification", m.NotifyURL)
	}
	c := m.HTTP
	if c == nil {
		c = http.DefaultClient
	}
	res, err := c.Do(req)
	if err != nil {
		return fmt.Errorf("midtrans: %w", err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if res.StatusCode >= 300 {
		var e struct {
			ErrorMessages []string `json:"error_messages"`
			StatusMessage string   `json:"status_message"`
		}
		_ = json.Unmarshal(b, &e)
		msg := strings.Join(e.ErrorMessages, "; ")
		if msg == "" {
			msg = e.StatusMessage
		}
		return fmt.Errorf("midtrans %d: %s", res.StatusCode, msg)
	}
	return json.Unmarshal(b, out)
}
