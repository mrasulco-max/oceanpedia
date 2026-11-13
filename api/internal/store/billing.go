package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
)

// ======================================================================= tagihan & langganan (Midtrans)

// Bill adalah invoice beserta pembayaran terakhirnya.
type Bill struct {
	Invoice
	UserID        string     `json:"-"`
	UserEmail     string     `json:"-"`
	UserName      string     `json:"-"`
	PlanName      string     `json:"plan_name"`
	Period        string     `json:"billing_period"`
	Seats         int        `json:"seats"`
	PaidAt        *time.Time `json:"paid_at"`
	PaymentID     string     `json:"payment_id"`
	OrderID       string     `json:"order_id"`
	Method        string     `json:"method"`
	PaymentStatus string     `json:"payment_status"`
	PayURL        string     `json:"pay_url,omitempty"`
	PayExpiresAt  *time.Time `json:"pay_expires_at"`
	PeriodEnd     *time.Time `json:"period_end"`
	VABank        string     `json:"va_bank,omitempty"`
	VANumber      string     `json:"va_number,omitempty"`
	BillKey       string     `json:"bill_key,omitempty"`
	BillerCode    string     `json:"biller_code,omitempty"`
	Provider      string     `json:"provider"` // midtrans | doku | manual
}

// Subscription aktif pengguna.
type Subscription struct {
	ID                string     `json:"id"`
	PlanCode          string     `json:"plan_code"`
	PlanName          string     `json:"plan_name"`
	Period            string     `json:"billing_period"`
	Price             int64      `json:"price_amount"`
	Status            string     `json:"status"`
	Seats             int        `json:"seats"`
	PeriodStart       *time.Time `json:"current_period_start"`
	PeriodEnd         *time.Time `json:"current_period_end"`
	CancelAtPeriodEnd bool       `json:"cancel_at_period_end"`
}

const qCreatePayment = `INSERT INTO payments (invoice_id, provider, method, provider_ref, amount, expires_at)
VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::bigint, $6::timestamptz) RETURNING id`

// CreatePayment mencatat pembayaran tertunda untuk invoice.
func (p *PG) CreatePayment(ctx context.Context, invoiceID, provider, method, ref string, amount int64, expires time.Time) (string, error) {
	var id string
	err := p.DB.QueryRowContext(ctx, qCreatePayment, invoiceID, provider, method, ref, amount, expires).Scan(&id)
	return id, err
}

const qSetPaymentRaw = `UPDATE payments SET raw = raw || $2::jsonb WHERE id = $1::uuid`

// SetPaymentRaw menggabungkan data penyedia (mis. URL Snap) ke kolom raw.
func (p *PG) SetPaymentRaw(ctx context.Context, paymentID string, raw map[string]any) error {
	b, _ := json.Marshal(raw)
	_, err := p.DB.ExecContext(ctx, qSetPaymentRaw, paymentID, string(b))
	return err
}

const qSetSeats = `UPDATE subscriptions s SET seats = $2::int FROM invoices i WHERE i.id = $1::uuid AND s.id = i.subscription_id`

// SetInvoiceSeats menyimpan jumlah kursi langganan dari invoice.
func (p *PG) SetInvoiceSeats(ctx context.Context, invoiceID string, seats int) error {
	_, err := p.DB.ExecContext(ctx, qSetSeats, invoiceID, seats)
	return err
}

const billCols = `i.id, i.number, s.plan_code, i.subtotal, i.discount, i.tax_rate::float8, i.tax_amount, i.total, i.currency, i.promo_code, i.status, i.issued_at,
  u.id, u.email, u.full_name, sp.name, sp.billing_period, s.seats, i.paid_at,
  coalesce(pm.id::text, ''), coalesce(pm.provider_ref, ''), coalesce(pm.method, ''), coalesce(pm.status, ''), coalesce(pm.raw->>'redirect_url', ''), pm.expires_at, s.current_period_end,
  coalesce(pm.raw->>'va_bank', ''), coalesce(pm.raw->>'va_number', ''), coalesce(pm.raw->>'bill_key', ''), coalesce(pm.raw->>'biller_code', ''), coalesce(pm.provider, '')
FROM invoices i
JOIN users u ON u.id = i.user_id
JOIN subscriptions s ON s.id = i.subscription_id
JOIN subscription_plans sp ON sp.code = s.plan_code
LEFT JOIN LATERAL (SELECT * FROM payments p WHERE p.invoice_id = i.id ORDER BY p.created_at DESC LIMIT 1) pm ON true`

func scanBill(s scanner) (Bill, error) {
	var b Bill
	err := s.Scan(&b.ID, &b.Number, &b.PlanCode, &b.Subtotal, &b.Discount, &b.TaxRate, &b.TaxAmount, &b.Total, &b.Currency, &b.PromoCode, &b.Status, &b.IssuedAt,
		&b.UserID, &b.UserEmail, &b.UserName, &b.PlanName, &b.Period, &b.Seats, &b.PaidAt,
		&b.PaymentID, &b.OrderID, &b.Method, &b.PaymentStatus, &b.PayURL, &b.PayExpiresAt, &b.PeriodEnd,
		&b.VABank, &b.VANumber, &b.BillKey, &b.BillerCode, &b.Provider)
	return b, err
}

const qBillByID = `SELECT ` + billCols + ` WHERE i.id = $1::uuid AND ($2::text = '' OR i.user_id = NULLIF($2::text, '')::uuid)`
const qBillByOrder = `SELECT ` + billCols + ` WHERE pm.provider_ref = $1::text OR EXISTS (SELECT 1 FROM payments x WHERE x.invoice_id = i.id AND x.provider_ref = $1::text) LIMIT 1`
const qBills = `SELECT ` + billCols + ` WHERE i.user_id = $1::uuid ORDER BY i.issued_at DESC LIMIT 50`

// Bill membaca invoice; uid kosong = tanpa pembatasan pemilik.
func (p *PG) Bill(ctx context.Context, id, uid string) (Bill, error) {
	b, err := scanBill(p.DB.QueryRowContext(ctx, qBillByID, id, uid))
	if errors.Is(err, sql.ErrNoRows) {
		return b, httpx.ErrNotFound
	}
	return b, err
}

// BillByOrder membaca invoice dari order_id Midtrans.
func (p *PG) BillByOrder(ctx context.Context, orderID string) (Bill, error) {
	b, err := scanBill(p.DB.QueryRowContext(ctx, qBillByOrder, orderID))
	if errors.Is(err, sql.ErrNoRows) {
		return b, httpx.ErrNotFound
	}
	return b, err
}

// Bills: riwayat tagihan pengguna.
func (p *PG) Bills(ctx context.Context, uid string) ([]Bill, error) {
	rows, err := p.DB.QueryContext(ctx, qBills, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Bill{}
	for rows.Next() {
		b, err := scanBill(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

const qLockPayment = `SELECT pm.id, pm.invoice_id, i.status, i.user_id, i.subscription_id, sp.billing_period
FROM payments pm JOIN invoices i ON i.id = pm.invoice_id JOIN subscriptions s ON s.id = i.subscription_id JOIN subscription_plans sp ON sp.code = s.plan_code
WHERE pm.provider = $1::text AND pm.provider_ref = $2::text FOR UPDATE OF pm, i`
const qPaymentUpdate = `UPDATE payments SET status = $2::text, method = CASE WHEN $3::text = '' THEN method ELSE $3::text END,
  raw = raw || $4::jsonb, paid_at = CASE WHEN $2::text = 'succeeded' THEN now() ELSE paid_at END WHERE id = $1::uuid`
const qInvoicePaid = `UPDATE invoices SET status = 'paid', paid_at = now() WHERE id = $1::uuid`
const qInvoiceVoid = `UPDATE invoices SET status = 'void' WHERE id = $1::uuid AND status = 'open'`
const qSubPendingExpire = `UPDATE subscriptions SET status = 'expired' WHERE id = $1::uuid AND status = 'pending'`
const qOtherActive = `SELECT id FROM subscriptions WHERE user_id = $1::uuid AND status IN ('active', 'past_due') AND id <> $2::uuid FOR UPDATE`
const qExtendActive = `UPDATE subscriptions s SET plan_code = n.plan_code, seats = n.seats, cancel_at_period_end = false,
  current_period_end = greatest(coalesce(s.current_period_end, now()), now()) + CASE WHEN $3::text = 'year' THEN interval '1 year' ELSE interval '1 month' END
FROM subscriptions n WHERE s.id = $1::uuid AND n.id = $2::uuid`
const qSubCanceled = `UPDATE subscriptions SET status = 'canceled' WHERE id = $1::uuid`
const qSubActivate = `UPDATE subscriptions SET status = 'active', current_period_start = now(),
  current_period_end = now() + CASE WHEN $2::text = 'year' THEN interval '1 year' ELSE interval '1 month' END WHERE id = $1::uuid`

// ApplyPayment menerapkan hasil pembayaran (idempoten). outcome: paid | pending | failed | expired | refunded.
// Mengembalikan true bila invoice baru saja berubah menjadi lunas.
func (p *PG) ApplyPayment(ctx context.Context, provider, ref, outcome, method string, raw map[string]any) (bool, error) {
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	var payID, invID, invStatus, userID, subID, period string
	err = tx.QueryRowContext(ctx, qLockPayment, provider, ref).Scan(&payID, &invID, &invStatus, &userID, &subID, &period)
	if errors.Is(err, sql.ErrNoRows) {
		return false, httpx.ErrNotFound
	}
	if err != nil {
		return false, err
	}
	b, _ := json.Marshal(raw)
	status := map[string]string{"paid": "succeeded", "pending": "pending", "failed": "failed", "expired": "expired", "refunded": "refunded"}[outcome]
	if status == "" {
		status = "pending"
	}
	if invStatus == "paid" && outcome != "refunded" {
		// Sudah lunas: hanya catat data terbaru.
		if _, err := tx.ExecContext(ctx, `UPDATE payments SET raw = raw || $2::jsonb WHERE id = $1::uuid`, payID, string(b)); err != nil {
			return false, err
		}
		return false, tx.Commit()
	}
	if _, err := tx.ExecContext(ctx, qPaymentUpdate, payID, status, method, string(b)); err != nil {
		return false, err
	}
	paid := false
	switch outcome {
	case "paid":
		if _, err := tx.ExecContext(ctx, qInvoicePaid, invID); err != nil {
			return false, err
		}
		var other string
		err := tx.QueryRowContext(ctx, qOtherActive, userID, subID).Scan(&other)
		switch {
		case err == nil:
			if _, err := tx.ExecContext(ctx, qExtendActive, other, subID, period); err != nil {
				return false, err
			}
			if _, err := tx.ExecContext(ctx, qSubCanceled, subID); err != nil {
				return false, err
			}
		case errors.Is(err, sql.ErrNoRows):
			if _, err := tx.ExecContext(ctx, qSubActivate, subID, period); err != nil {
				return false, err
			}
		default:
			return false, err
		}
		paid = true
	case "failed", "expired":
		if _, err := tx.ExecContext(ctx, qInvoiceVoid, invID); err != nil {
			return false, err
		}
		if _, err := tx.ExecContext(ctx, qSubPendingExpire, subID); err != nil {
			return false, err
		}
	}
	return paid, tx.Commit()
}

const qSubscription = `SELECT s.id, s.plan_code, sp.name, sp.billing_period, sp.price_amount, s.status, s.seats, s.current_period_start, s.current_period_end, s.cancel_at_period_end
FROM subscriptions s JOIN subscription_plans sp ON sp.code = s.plan_code
WHERE s.user_id = $1::uuid AND s.status IN ('active', 'past_due') ORDER BY s.current_period_end DESC NULLS LAST LIMIT 1`

// ActiveSubscription: langganan aktif (ErrNotFound bila tidak ada).
func (p *PG) ActiveSubscription(ctx context.Context, uid string) (Subscription, error) {
	var s Subscription
	err := p.DB.QueryRowContext(ctx, qSubscription, uid).Scan(&s.ID, &s.PlanCode, &s.PlanName, &s.Period, &s.Price, &s.Status, &s.Seats, &s.PeriodStart, &s.PeriodEnd, &s.CancelAtPeriodEnd)
	if errors.Is(err, sql.ErrNoRows) {
		return s, httpx.ErrNotFound
	}
	return s, err
}

const qCancelSub = `UPDATE subscriptions SET cancel_at_period_end = $2::bool WHERE user_id = $1::uuid AND status IN ('active', 'past_due')`

// SetCancelAtPeriodEnd menghentikan/melanjutkan perpanjangan langganan.
func (p *PG) SetCancelAtPeriodEnd(ctx context.Context, uid string, cancel bool) error {
	r, err := p.DB.ExecContext(ctx, qCancelSub, uid, cancel)
	if err != nil {
		return err
	}
	if n, _ := r.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

func billingQueries() map[string]string {
	return map[string]string{
		"create_payment": qCreatePayment, "set_payment_raw": qSetPaymentRaw, "set_seats": qSetSeats, "bill_by_id": qBillByID, "bill_by_order": qBillByOrder, "bills": qBills,
		"lock_payment": qLockPayment, "payment_update": qPaymentUpdate, "invoice_paid": qInvoicePaid, "invoice_void": qInvoiceVoid, "sub_pending_expire": qSubPendingExpire,
		"other_active": qOtherActive, "extend_active": qExtendActive, "sub_canceled": qSubCanceled, "sub_activate": qSubActivate, "subscription": qSubscription, "cancel_sub": qCancelSub,
	}
}
