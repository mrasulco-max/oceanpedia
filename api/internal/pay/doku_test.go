package pay

import (
	"net/http"
	"testing"
)

func TestDokuSignatureRoundTrip(t *testing.T) {
	d := &Doku{ClientID: "BRN-0001", SecretKey: "SK-rahasia"}
	body := []byte(`{"order":{"invoice_number":"INV-1","amount":54390},"transaction":{"status":"SUCCESS"}}`)
	h := http.Header{}
	h.Set("Client-Id", "BRN-0001")
	h.Set("Request-Id", "req-1")
	h.Set("Request-Timestamp", "2026-11-13T03:00:00Z")
	h.Set("Signature", d.sign("req-1", "2026-11-13T03:00:00Z", "/v1/billing/doku/notify", body))
	if !d.VerifyNotification(h, "/v1/billing/doku/notify", body) {
		t.Fatal("tanda tangan sah ditolak")
	}
	if d.VerifyNotification(h, "/v1/billing/doku/notify", append(body, ' ')) {
		t.Fatal("body diubah tetap diterima")
	}
	h.Set("Client-Id", "BRN-lain")
	if d.VerifyNotification(h, "/v1/billing/doku/notify", body) {
		t.Fatal("Client-Id lain diterima")
	}
}

func TestDokuOutcome(t *testing.T) {
	for st, want := range map[string]string{"SUCCESS": "paid", "PENDING": "pending", "FAILED": "failed", "EXPIRED": "expired", "": "pending"} {
		var n DokuNotice
		n.Transaction.Status = st
		if got := n.Outcome(); got != want {
			t.Errorf("%q → %q, ingin %q", st, got, want)
		}
	}
}
