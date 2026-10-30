package ai

import "github.com/mrasulco-max/oceanpedia/api/internal/market"

// Tech berisi indikator harian yang dihitung sistem (bukan oleh AI) agar angka tidak dikarang.
type Tech struct {
	OK                     bool
	RSI                    float64
	SMA20, SMA50, SMA200   float64
	Perf1W, Perf1M, Perf3M float64
	Pivot, S1, R1          float64
}

// Technicals menghitung indikator dari candle harian berurutan naik.
func Technicals(c []market.Candle) Tech {
	n := len(c)
	if n < 15 {
		return Tech{}
	}
	t := Tech{OK: true}
	sma := func(k int) float64 {
		if n < k {
			return 0
		}
		s := 0.0
		for _, x := range c[n-k:] {
			s += x.Close
		}
		return s / float64(k)
	}
	t.SMA20, t.SMA50, t.SMA200 = sma(20), sma(50), sma(200)
	// RSI 14 (Wilder).
	var g, l float64
	for i := 1; i < n; i++ {
		d := c[i].Close - c[i-1].Close
		up, dn := max(d, 0), max(-d, 0)
		if i <= 14 {
			g += up / 14
			l += dn / 14
		} else {
			g = (g*13 + up) / 14
			l = (l*13 + dn) / 14
		}
	}
	if l == 0 {
		t.RSI = 100
	} else {
		t.RSI = 100 - 100/(1+g/l)
	}
	perf := func(k int) float64 {
		if n <= k || c[n-1-k].Close == 0 {
			return 0
		}
		return (c[n-1].Close/c[n-1-k].Close - 1) * 100
	}
	t.Perf1W, t.Perf1M, t.Perf3M = perf(5), perf(21), perf(63)
	// Pivot klasik dari candle harian terakhir yang sudah selesai.
	p := c[n-2]
	t.Pivot = (p.High + p.Low + p.Close) / 3
	t.S1 = 2*t.Pivot - p.High
	t.R1 = 2*t.Pivot - p.Low
	return t
}
