package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/pay"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// Promo yang dikenal. Di produksi sebaiknya disimpan di database.
var promos = map[string]struct {
	Plans      []string
	FirstPrice int64 // harga bulan pertama (sebelum pajak)
}{
	"PLUSBARU": {Plans: []string{"essential"}, FirstPrice: 9900},
}

// Quote menghitung rincian tagihan. Pajak dibulatkan ke rupiah terdekat.
func Quote(p store.Plan, seats int, promo string, taxRate float64) (store.Invoice, error) {
	if seats < p.MinSeats {
		seats = p.MinSeats
	}
	inv := store.Invoice{PlanCode: p.Code, Subtotal: p.PriceAmount * int64(seats), Currency: p.Currency, TaxRate: taxRate, Status: "open"}
	if promo != "" {
		pr, ok := promos[promo]
		valid := ok
		if ok {
			valid = false
			for _, c := range pr.Plans {
				if c == p.Code {
					valid = true
				}
			}
		}
		if !valid {
			return inv, httpx.Validation(map[string]string{"promo_code": "Kode promo tidak berlaku untuk paket ini."})
		}
		inv.Discount = inv.Subtotal - pr.FirstPrice
		inv.PromoCode = &promo
	}
	inv.TaxAmount = int64(math.Round(float64(inv.Subtotal-inv.Discount) * taxRate))
	inv.Total = inv.Subtotal - inv.Discount + inv.TaxAmount
	return inv, nil
}

// Metode bayar di halaman checkout → enabled_payments Snap Midtrans (kosong = semua metode).
var snapMethods = map[string][]string{
	"":           nil,
	"all":        nil,
	"qris":       {"other_qris"},
	"gopay":      {"gopay"},
	"shopeepay":  {"shopeepay"},
	"va_bca":     {"bca_va"},
	"va_bni":     {"bni_va"},
	"va_bri":     {"bri_va"},
	"va_mandiri": {"echannel"},
	"va_permata": {"permata_va"},
	"card":       {"credit_card"},
}

// Metode bayar → payment_method_types DOKU Checkout (kosong = semua kanal aktif di akun DOKU).
var dokuMethods = map[string][]string{
	"":           nil,
	"all":        nil,
	"qris":       {"QRIS"},
	"shopeepay":  {"EMONEY_SHOPEE_PAY"},
	"va_bca":     {"VIRTUAL_ACCOUNT_BCA"},
	"va_bni":     {"VIRTUAL_ACCOUNT_BNI"},
	"va_bri":     {"VIRTUAL_ACCOUNT_BRI"},
	"va_mandiri": {"VIRTUAL_ACCOUNT_BANK_MANDIRI"},
	"va_permata": {"VIRTUAL_ACCOUNT_BANK_PERMATA"},
	"card":       {"CREDIT_CARD"},
	"ovo":        {"EMONEY_OVO"},
	"dana":       {"EMONEY_DANA"},
}

const payWindow = 24 * time.Hour

// orderID: nomor invoice tanpa "/" (Midtrans hanya menerima huruf, angka, "-", "_", ".", "~").
func orderID(number string) string { return strings.ReplaceAll(number, "/", "-") }

// POST /v1/billing/checkout (juga /v1/checkout) — buat invoice + transaksi Snap Midtrans.
func (s *Server) checkout(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		PlanCode  string `json:"plan_code"`
		Seats     int    `json:"seats"`
		PromoCode string `json:"promo_code"`
		Method    string `json:"method"`
		Provider  string `json:"provider"` // midtrans (bawaan) | doku
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	useDoku := in.Provider == "doku"
	if in.Provider != "" && in.Provider != "midtrans" && !useDoku {
		return httpx.Validation(map[string]string{"provider": "Penyedia pembayaran tidak dikenal."})
	}
	if useDoku && !s.Doku.Enabled() {
		return httpx.Validation(map[string]string{"provider": "Pembayaran lewat DOKU belum tersedia."})
	}
	methods, ok := snapMethods[in.Method]
	if useDoku {
		methods, ok = dokuMethods[in.Method]
	}
	if !ok {
		msg := "Metode pembayaran tidak dikenal."
		if useDoku && in.Method == "gopay" {
			msg = "GoPay tersedia lewat Midtrans."
		}
		return httpx.Validation(map[string]string{"method": msg})
	}
	p, err := s.Store.PlanByCode(r.Context(), in.PlanCode)
	if err != nil {
		return httpx.Validation(map[string]string{"plan_code": "Paket tidak dikenal."})
	}
	if in.Seats < p.MinSeats {
		in.Seats = p.MinSeats
	}
	if in.Seats > 500 {
		return httpx.Validation(map[string]string{"seats": "Maksimal 500 kursi."})
	}
	inv, err := Quote(p, in.Seats, strings.ToUpper(strings.TrimSpace(in.PromoCode)), s.Cfg.TaxRate)
	if err != nil {
		return err
	}
	if strings.HasPrefix(p.Code, "student") {
		if _, ok, err := s.Store.StudentStatus(r.Context(), uid(r)); err != nil {
			return err
		} else if !ok {
			return &httpx.Problem{Type: "about:blank", Title: "Verifikasi Student diperlukan", Status: 403, Detail: "Paket Student khusus mahasiswa terverifikasi. Ajukan verifikasi dengan email kampus & NIM di halaman Plus."}
		}
	}
	u, err := s.Store.UserByID(r.Context(), uid(r))
	if err != nil {
		return err
	}
	out, err := s.Store.CreateInvoice(r.Context(), u.ID, inv)
	if err != nil {
		return err
	}
	if in.Seats > 1 {
		if err := s.Store.SetInvoiceSeats(r.Context(), out.ID, in.Seats); err != nil {
			return err
		}
	}
	oid := orderID(out.Number)
	provider := "midtrans"
	switch {
	case useDoku:
		provider = "doku"
	case !s.Pay.Enabled():
		provider = "manual" // lingkungan pengembangan/CI tanpa kunci Midtrans
	}
	method := in.Method
	if method == "" {
		method = "all"
	}
	payID, err := s.Store.CreatePayment(r.Context(), out.ID, provider, method, oid, out.Total, s.Now().Add(payWindow))
	if err != nil {
		return err
	}
	resp := map[string]any{"invoice": out, "order_id": oid, "provider": provider, "status": "pending"}
	phone := ""
	if u.Phone != nil {
		phone = *u.Phone
	}
	name := "Ocean Pedia Plus " + p.Name
	if len(name) > 50 {
		name = name[:50]
	}
	finish := s.Cfg.SiteURL + "/plus/menunggu-pembayaran?inv=" + out.ID
	if useDoku {
		res, err := s.Doku.CreatePayment(r.Context(), pay.DokuRequest{
			InvoiceNumber: oid,
			Amount:        out.Total,
			Items:         []pay.Item{{ID: p.Code, Price: out.Total, Quantity: 1, Name: name}},
			Name:          u.FullName,
			Email:         u.Email,
			Phone:         phone,
			Methods:       methods,
			CallbackURL:   finish,
			DueMinutes:    int(payWindow / time.Minute),
		})
		if err != nil {
			s.Log.Error("doku checkout gagal", "order", oid, "err", err)
			_, _ = s.Store.ApplyPayment(context.WithoutCancel(r.Context()), provider, oid, "failed", "", map[string]any{"error": err.Error()})
			return &httpx.Problem{Type: "about:blank", Status: http.StatusBadGateway, Title: "Pembayaran belum dapat dibuat", Detail: "Gerbang pembayaran DOKU sedang bermasalah. Coba beberapa saat lagi."}
		}
		_ = s.Store.SetPaymentRaw(r.Context(), payID, map[string]any{"doku_token": res.TokenID, "redirect_url": res.URL})
		resp["pay_url"] = res.URL
	} else if s.Pay.Enabled() {
		snap, err := s.Pay.CreateSnap(r.Context(), pay.SnapRequest{
			OrderID:   oid,
			Gross:     out.Total,
			Items:     []pay.Item{{ID: p.Code, Price: out.Total, Quantity: 1, Name: name}},
			Name:      u.FullName,
			Email:     u.Email,
			Phone:     phone,
			Methods:   methods,
			FinishURL: finish,
			ExpiryMin: int(payWindow / time.Minute),
		})
		if err != nil {
			s.Log.Error("midtrans snap gagal", "order", oid, "err", err)
			_, _ = s.Store.ApplyPayment(context.WithoutCancel(r.Context()), provider, oid, "failed", "", map[string]any{"error": err.Error()})
			return &httpx.Problem{Type: "about:blank", Status: http.StatusBadGateway, Title: "Pembayaran belum dapat dibuat", Detail: "Gerbang pembayaran sedang bermasalah. Coba beberapa saat lagi."}
		}
		_ = s.Store.SetPaymentRaw(r.Context(), payID, map[string]any{"snap_token": snap.Token, "redirect_url": snap.RedirectURL})
		resp["pay_url"] = snap.RedirectURL
	}
	httpx.JSON(w, http.StatusCreated, resp)
	return nil
}

// POST /v1/billing/midtrans/notify — notifikasi pembayaran Midtrans (publik, diverifikasi tanda tangan).
func (s *Server) midtransNotify(w http.ResponseWriter, r *http.Request) error {
	if !s.Pay.Enabled() {
		return &httpx.Problem{Type: "about:blank", Status: http.StatusServiceUnavailable, Title: "Pembayaran belum dikonfigurasi"}
	}
	var st pay.Status
	if err := httpx.Decode(r, &st); err != nil {
		return err
	}
	if st.OrderID == "" || !s.Pay.VerifySignature(st) {
		s.Log.Warn("notifikasi midtrans ditolak: tanda tangan tidak sah", "order", st.OrderID)
		return &httpx.Problem{Type: "about:blank", Status: http.StatusUnauthorized, Title: "Tanda tangan tidak sah"}
	}
	b, err := s.Store.BillByOrder(r.Context(), st.OrderID)
	if err != nil {
		if errors.Is(err, httpx.ErrNotFound) {
			// Bukan transaksi kita (mis. uji dari dasbor Midtrans) — balas 200 agar tidak diulang.
			httpx.JSON(w, 200, map[string]any{"ok": true, "ignored": true})
			return nil
		}
		return err
	}
	if g, err := strconv.ParseFloat(st.GrossAmount, 64); err != nil || int64(math.Round(g)) != b.Total {
		s.Log.Error("notifikasi midtrans: nominal tidak cocok", "order", st.OrderID, "gross", st.GrossAmount, "total", b.Total)
		return &httpx.Problem{Type: "about:blank", Status: http.StatusConflict, Title: "Nominal tidak cocok"}
	}
	if err := s.applyStatus(r.Context(), b, st); err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
	return nil
}

// POST /v1/billing/doku/notify — notifikasi pembayaran DOKU (publik, diverifikasi HMAC header Signature).
func (s *Server) dokuNotify(w http.ResponseWriter, r *http.Request) error {
	if !s.Doku.Enabled() {
		return &httpx.Problem{Type: "about:blank", Status: http.StatusServiceUnavailable, Title: "Pembayaran belum dikonfigurasi"}
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return err
	}
	// Request-Target = path Notification URL yang didaftarkan di DOKU (bisa berbeda dari path lokal di balik proxy).
	if !s.Doku.VerifyNotification(r.Header, r.URL.Path, body) && !s.Doku.VerifyNotification(r.Header, "/v1/billing/doku/notify", body) {
		s.Log.Warn("notifikasi doku ditolak: tanda tangan tidak sah", "request_id", r.Header.Get("Request-Id"))
		return &httpx.Problem{Type: "about:blank", Status: http.StatusUnauthorized, Title: "Tanda tangan tidak sah"}
	}
	var n pay.DokuNotice
	if err := json.Unmarshal(body, &n); err != nil || n.Order.InvoiceNumber == "" {
		return httpx.Validation(map[string]string{"order": "Notifikasi tidak lengkap."})
	}
	b, err := s.Store.BillByOrder(r.Context(), n.Order.InvoiceNumber)
	if err != nil {
		if errors.Is(err, httpx.ErrNotFound) {
			httpx.JSON(w, 200, map[string]any{"ok": true, "ignored": true})
			return nil
		}
		return err
	}
	if int64(math.Round(n.Order.Amount)) != b.Total {
		s.Log.Error("notifikasi doku: nominal tidak cocok", "order", n.Order.InvoiceNumber, "amount", n.Order.Amount, "total", b.Total)
		return &httpx.Problem{Type: "about:blank", Status: http.StatusConflict, Title: "Nominal tidak cocok"}
	}
	if err := s.applyDoku(r.Context(), b, n); err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
	return nil
}

func (s *Server) applyDoku(ctx context.Context, b store.Bill, n pay.DokuNotice) error {
	outcome := n.Outcome()
	raw := map[string]any{"transaction_status": n.Transaction.Status, "payment_type": n.Method(), "transaction_time": n.Transaction.Date}
	if n.VirtualAccount.Number != "" {
		raw["va_bank"], raw["va_number"] = strings.TrimPrefix(n.Method(), "virtual_account_"), n.VirtualAccount.Number
	}
	paid, err := s.Store.ApplyPayment(ctx, "doku", n.Order.InvoiceNumber, outcome, n.Method(), raw)
	if err != nil {
		return err
	}
	s.Log.Info("status pembayaran doku", "order", n.Order.InvoiceNumber, "status", n.Transaction.Status, "hasil", outcome)
	if paid {
		s.afterPaid(context.WithoutCancel(ctx), b.ID)
	}
	return nil
}

func rawOf(st pay.Status) map[string]any {
	raw := map[string]any{"transaction_status": st.TransactionStatus, "payment_type": st.PaymentType, "transaction_id": st.TransactionID, "transaction_time": st.TransactionTime}
	if st.SettlementTime != "" {
		raw["settlement_time"] = st.SettlementTime
	}
	if len(st.VANumbers) > 0 {
		raw["va_bank"], raw["va_number"] = st.VANumbers[0].Bank, st.VANumbers[0].VANumber
	}
	if st.PermataVA != "" {
		raw["va_bank"], raw["va_number"] = "permata", st.PermataVA
	}
	if st.BillKey != "" {
		raw["bill_key"], raw["biller_code"] = st.BillKey, st.BillerCode
	}
	return raw
}

// applyStatus menerapkan status Midtrans ke invoice & langganan, lalu mengirim bukti bayar bila lunas.
func (s *Server) applyStatus(ctx context.Context, b store.Bill, st pay.Status) error {
	outcome := pay.Outcome(st)
	paid, err := s.Store.ApplyPayment(ctx, "midtrans", st.OrderID, outcome, st.PaymentType, rawOf(st))
	if err != nil {
		return err
	}
	s.Log.Info("status pembayaran", "order", st.OrderID, "status", st.TransactionStatus, "hasil", outcome)
	if paid {
		s.afterPaid(context.WithoutCancel(ctx), b.ID)
	}
	return nil
}

// afterPaid: notifikasi dalam aplikasi + email bukti bayar (best effort).
func (s *Server) afterPaid(ctx context.Context, invoiceID string) {
	b, err := s.Store.Bill(ctx, invoiceID, "")
	if err != nil {
		s.Log.Warn("baca invoice lunas gagal", "err", err)
		return
	}
	until := ""
	if b.PeriodEnd != nil {
		until = " hingga " + b.PeriodEnd.In(jakarta).Format("2 Jan 2006")
	}
	title := "Pembayaran berhasil · Ocean Pedia Plus aktif"
	body := fmt.Sprintf("Terima kasih! %s Rp%s lunas (%s). Langganan aktif%s.", b.PlanName, fmtNum(float64(b.Total)), b.Number, until)
	if err := s.Store.Notify(ctx, b.UserID, store.NotifyInput{Kind: "billing", Title: title, Body: body, Link: "/plus/berhasil?inv=" + b.ID}); err != nil {
		s.Log.Warn("notifikasi pembayaran gagal", "err", err)
	}
	if err := s.sendReceipt(ctx, b); err != nil {
		s.Log.Warn("email bukti bayar gagal", "err", err)
	}
}

func (s *Server) sendReceipt(ctx context.Context, b store.Bill) error {
	if s.Mail == nil {
		return errors.New("email belum dikonfigurasi")
	}
	paidAt := s.Now()
	if b.PaidAt != nil {
		paidAt = *b.PaidAt
	}
	rows := [][2]string{
		{"Nomor invoice", b.Number},
		{"Paket", b.PlanName},
		{"Subtotal", "Rp" + fmtNum(float64(b.Subtotal))},
	}
	if b.Discount > 0 {
		rows = append(rows, [2]string{"Diskon", "−Rp" + fmtNum(float64(b.Discount))})
	}
	rows = append(rows, [2]string{fmt.Sprintf("PPN %g%%", b.TaxRate*100), "Rp" + fmtNum(float64(b.TaxAmount))}, [2]string{"Total dibayar", "Rp" + fmtNum(float64(b.Total))}, [2]string{"Dibayar", paidAt.In(jakarta).Format("2 Jan 2006 15:04") + " WIB"})
	if b.Method != "" {
		rows = append(rows, [2]string{"Metode", strings.ToUpper(strings.ReplaceAll(b.Method, "_", " "))})
	}
	if b.PeriodEnd != nil {
		rows = append(rows, [2]string{"Aktif hingga", b.PeriodEnd.In(jakarta).Format("2 Jan 2006")})
	}
	var txt, html strings.Builder
	fmt.Fprintf(&txt, "Halo %s,\n\nPembayaran Ocean Pedia Plus kamu sudah kami terima.\n\n", b.UserName)
	html.WriteString(`<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0B0B0F"><h2 style="color:#2F74EB">Pembayaran berhasil</h2><p>Halo ` + htmlEsc(b.UserName) + `, pembayaran Ocean Pedia Plus kamu sudah kami terima.</p><table style="width:100%;border-collapse:collapse;font-size:14px">`)
	for _, r := range rows {
		fmt.Fprintf(&txt, "%-16s %s\n", r[0]+":", r[1])
		html.WriteString(`<tr><td style="padding:8px 0;color:#5F6B7D;border-bottom:1px solid #E3EAF4">` + htmlEsc(r[0]) + `</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #E3EAF4"><b>` + htmlEsc(r[1]) + `</b></td></tr>`)
	}
	link := s.Cfg.SiteURL + "/plus/berhasil?inv=" + b.ID
	fmt.Fprintf(&txt, "\nLihat invoice: %s\n\nOceanBird — Berita & data pasar\n", link)
	html.WriteString(`</table><p><a href="` + link + `" style="display:inline-block;margin-top:16px;padding:12px 20px;background:#2F74EB;color:#fff;border-radius:12px;text-decoration:none">Lihat invoice</a></p><p style="font-size:12px;color:#5F6B7D">Simpan email ini sebagai bukti pembayaran.</p></div>`)
	return s.Mail.SendMessage(ctx, b.UserEmail, "Bukti pembayaran "+b.Number, txt.String(), html.String())
}

// GET /v1/billing/invoices
func (s *Server) invoices(w http.ResponseWriter, r *http.Request) error {
	l, err := s.Store.Bills(r.Context(), uid(r))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, Page[store.Bill]{Data: l})
	return nil
}

// GET /v1/billing/invoices/{id}
func (s *Server) invoice(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	b, err := s.Store.Bill(r.Context(), id, uid(r))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, b)
	return nil
}

// POST /v1/billing/invoices/{id}/refresh — cek status ke Midtrans (dipakai halaman menunggu pembayaran).
func (s *Server) refreshInvoice(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	b, err := s.Store.Bill(r.Context(), id, uid(r))
	if err != nil {
		return err
	}
	if b.Status == "open" && b.OrderID != "" && b.Provider == "doku" && s.Doku.Enabled() {
		n, err := s.Doku.Status(r.Context(), b.OrderID)
		switch {
		case errors.Is(err, pay.ErrNotFound):
		case err != nil:
			s.Log.Warn("cek status doku gagal", "order", b.OrderID, "err", err)
		default:
			if n.Order.InvoiceNumber == "" {
				n.Order.InvoiceNumber = b.OrderID
			}
			if err := s.applyDoku(r.Context(), b, n); err != nil {
				return err
			}
			if b, err = s.Store.Bill(r.Context(), id, uid(r)); err != nil {
				return err
			}
		}
	} else if b.Status == "open" && b.OrderID != "" && b.Provider != "doku" && s.Pay.Enabled() {
		st, err := s.Pay.GetStatus(r.Context(), b.OrderID)
		switch {
		case errors.Is(err, pay.ErrNotFound):
			// belum memilih metode bayar — tetap menunggu
		case err != nil:
			s.Log.Warn("cek status midtrans gagal", "order", b.OrderID, "err", err)
		default:
			if err := s.applyStatus(r.Context(), b, st); err != nil {
				return err
			}
			if b, err = s.Store.Bill(r.Context(), id, uid(r)); err != nil {
				return err
			}
		}
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, b)
	return nil
}

// POST /v1/billing/invoices/{id}/resend — kirim ulang bukti bayar ke email.
func (s *Server) resendReceipt(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	b, err := s.Store.Bill(r.Context(), id, uid(r))
	if err != nil {
		return err
	}
	if b.Status != "paid" {
		return &httpx.Problem{Type: "about:blank", Status: http.StatusConflict, Title: "Invoice belum lunas"}
	}
	if err := s.sendReceipt(r.Context(), b); err != nil {
		s.Log.Warn("kirim ulang bukti bayar gagal", "err", err)
		return &httpx.Problem{Type: "about:blank", Status: http.StatusBadGateway, Title: "Email belum dapat dikirim", Detail: "Layanan email sedang bermasalah. Coba lagi nanti."}
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// POST /v1/billing/invoices/{id}/simulate {outcome} — hanya non-produksi: simulasi hasil bayar untuk uji.
func (s *Server) simulatePayment(w http.ResponseWriter, r *http.Request) error {
	if s.Cfg.Production() {
		return httpx.ErrNotFound
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Outcome string `json:"outcome"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	b, err := s.Store.Bill(r.Context(), id, uid(r))
	if err != nil {
		return err
	}
	paid, err := s.Store.ApplyPayment(r.Context(), "manual", b.OrderID, in.Outcome, "qris", map[string]any{"simulated": true})
	if err != nil {
		return err
	}
	if paid {
		s.afterPaid(context.WithoutCancel(r.Context()), b.ID)
	}
	b, err = s.Store.Bill(r.Context(), id, uid(r))
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, b)
	return nil
}

// GET /v1/billing/subscription
func (s *Server) subscription(w http.ResponseWriter, r *http.Request) error {
	sub, err := s.Store.ActiveSubscription(r.Context(), uid(r))
	w.Header().Set("Cache-Control", "private, no-store")
	if errors.Is(err, httpx.ErrNotFound) {
		httpx.JSON(w, 200, map[string]any{"data": nil})
		return nil
	}
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"data": sub})
	return nil
}

// POST /v1/billing/subscription/cancel {resume?} — berhenti perpanjang di akhir periode (atau lanjutkan).
func (s *Server) cancelSubscription(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Resume bool `json:"resume"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := s.Store.SetCancelAtPeriodEnd(r.Context(), uid(r), !in.Resume); err != nil {
		return err
	}
	return s.subscription(w, r)
}
