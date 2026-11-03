package api

import (
	"crypto/sha512"
	"encoding/hex"
	"fmt"
	"testing"

	"github.com/mrasulco-max/oceanpedia/api/internal/pay"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

func sig(order, code, gross, key string) string {
	h := sha512.Sum512([]byte(order + code + gross + key))
	return hex.EncodeToString(h[:])
}

func TestMidtransNotify(t *testing.T) {
	s, _ := newTest(t)
	f := s.Store.(*fake)
	f.bill = &store.Bill{Invoice: store.Invoice{ID: "00000000-0000-0000-0000-000000000001", Number: "INV/OP/2026/11/000001", Total: 65490, Status: "open"}, OrderID: "INV-OP-2026-11-000001", UserID: "u1"}
	s.Pay = &pay.Midtrans{ServerKey: "kunci-server-uji"}
	h := s.Handler()
	body := func(status, gross, signature string) string {
		return fmt.Sprintf(`{"order_id":"INV-OP-2026-11-000001","status_code":"200","gross_amount":%q,"transaction_status":%q,"payment_type":"qris","signature_key":%q}`, gross, status, signature)
	}
	// Tanda tangan salah → 401, tidak ada perubahan.
	if w := do(h, "POST", "/v1/billing/midtrans/notify", body("settlement", "65490.00", "salah")); w.Code != 401 {
		t.Fatalf("tanda tangan salah: %d %s", w.Code, w.Body)
	}
	// Nominal berbeda (tanda tangan sah untuk nominal itu) → 409.
	if w := do(h, "POST", "/v1/billing/midtrans/notify", body("settlement", "1000.00", sig("INV-OP-2026-11-000001", "200", "1000.00", "kunci-server-uji"))); w.Code != 409 {
		t.Fatalf("nominal: %d %s", w.Code, w.Body)
	}
	if len(f.applied) != 0 {
		t.Fatalf("tidak boleh diterapkan: %v", f.applied)
	}
	// Sah → lunas.
	if w := do(h, "POST", "/v1/billing/midtrans/notify", body("settlement", "65490.00", sig("INV-OP-2026-11-000001", "200", "65490.00", "kunci-server-uji"))); w.Code != 200 {
		t.Fatalf("sah: %d %s", w.Code, w.Body)
	}
	if len(f.applied) != 1 || f.applied[0] != "midtrans:INV-OP-2026-11-000001:paid" {
		t.Fatalf("applied: %v", f.applied)
	}
	// Order tak dikenal → 200 diabaikan.
	other := `{"order_id":"LAIN-1","status_code":"200","gross_amount":"1.00","transaction_status":"settlement","signature_key":"` + sig("LAIN-1", "200", "1.00", "kunci-server-uji") + `"}`
	if w := do(h, "POST", "/v1/billing/midtrans/notify", other); w.Code != 200 {
		t.Fatalf("tak dikenal: %d", w.Code)
	}
	// Tanpa kunci → 503.
	s.Pay = nil
	if w := do(s.Handler(), "POST", "/v1/billing/midtrans/notify", body("settlement", "65490.00", "x")); w.Code != 503 {
		t.Fatalf("tanpa kunci: %d", w.Code)
	}
}

func TestOrderID(t *testing.T) {
	if orderID("INV/OP/2026/11/000123") != "INV-OP-2026-11-000123" {
		t.Fatal(orderID("INV/OP/2026/11/000123"))
	}
}
