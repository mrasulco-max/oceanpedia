package pay

import (
	"context"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSignatureAndOutcome(t *testing.T) {
	m := &Midtrans{ServerKey: "kunci-uji"}
	h := sha512.Sum512([]byte("INV-1" + "200" + "65490.00" + "kunci-uji"))
	st := Status{OrderID: "INV-1", StatusCode: "200", GrossAmount: "65490.00", SignatureKey: hex.EncodeToString(h[:]), TransactionStatus: "settlement"}
	if !m.VerifySignature(st) {
		t.Fatal("tanda tangan sah ditolak")
	}
	st.GrossAmount = "1.00"
	if m.VerifySignature(st) {
		t.Fatal("tanda tangan palsu diterima")
	}
	cases := map[string]string{"settlement": "paid", "pending": "pending", "expire": "expired", "deny": "failed", "cancel": "failed", "refund": "refunded"}
	for in, want := range cases {
		if got := Outcome(Status{TransactionStatus: in}); got != want {
			t.Errorf("%s → %s, ingin %s", in, got, want)
		}
	}
	if Outcome(Status{TransactionStatus: "capture", FraudStatus: "challenge"}) != "pending" {
		t.Error("capture+challenge harus pending")
	}
}

func TestCreateSnapSendsAuthAndNotify(t *testing.T) {
	var gotAuth, gotNotify string
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, _, _ := r.BasicAuth()
		gotAuth, gotNotify = u, r.Header.Get("X-Override-Notification")
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, _ = w.Write([]byte(`{"token":"tok","redirect_url":"https://app.sandbox.midtrans.com/snap/v4/redirection/tok"}`))
	}))
	defer srv.Close()
	m := &Midtrans{ServerKey: "sk", NotifyURL: "https://api.example/notify", HTTP: &http.Client{Transport: rewrite{srv.URL}}}
	res, err := m.CreateSnap(context.Background(), SnapRequest{OrderID: "INV-2", Gross: 1000, Items: []Item{{ID: "p", Price: 1000, Quantity: 1, Name: "x"}}, Methods: []string{"other_qris"}})
	if err != nil || res.Token != "tok" {
		t.Fatalf("CreateSnap: %v %+v", err, res)
	}
	if gotAuth != "sk" || gotNotify != "https://api.example/notify" {
		t.Fatalf("auth/notify salah: %q %q", gotAuth, gotNotify)
	}
	if body["enabled_payments"] == nil {
		t.Fatal("enabled_payments tidak terkirim")
	}
}

type rewrite struct{ base string }

func (rw rewrite) RoundTrip(r *http.Request) (*http.Response, error) {
	u := rw.base + r.URL.Path
	req, _ := http.NewRequestWithContext(r.Context(), r.Method, u, r.Body)
	req.Header = r.Header
	return http.DefaultTransport.RoundTrip(req)
}
