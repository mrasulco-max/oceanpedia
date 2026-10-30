package api

import (
	"math"
	"net/http"
	"strings"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
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

func (s *Server) checkout(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		PlanCode  string `json:"plan_code"`
		Seats     int    `json:"seats"`
		PromoCode string `json:"promo_code"`
		Method    string `json:"method"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	p, err := s.Store.PlanByCode(r.Context(), in.PlanCode)
	if err != nil {
		return httpx.Validation(map[string]string{"plan_code": "Paket tidak dikenal."})
	}
	inv, err := Quote(p, in.Seats, strings.ToUpper(strings.TrimSpace(in.PromoCode)), s.Cfg.TaxRate)
	if err != nil {
		return err
	}
	out, err := s.Store.CreateInvoice(r.Context(), uid(r), inv)
	if err != nil {
		return err
	}
	// Integrasi payment gateway (Midtrans/Xendit) menghasilkan instruksi bayar di sini.
	httpx.JSON(w, http.StatusCreated, map[string]any{"invoice": out, "payment": map[string]any{"method": in.Method, "status": "pending", "provider": "unconfigured"}})
	return nil
}
