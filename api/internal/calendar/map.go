package calendar

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// ImpactFromImportance memetakan skala TradingView (−1…3) ke low|medium|high.
func ImpactFromImportance(n int) string {
	switch {
	case n <= -1:
		return "low"
	case n == 0:
		return "medium"
	default:
		return "high"
	}
}

// FormatValue mengubah angka + unit/scale menjadi teks tampilan (gaya Indonesia).
func FormatValue(v *float64, unit, scale string) *string {
	if v == nil {
		return nil
	}
	s := formatNumber(*v)
	u := strings.TrimSpace(unit)
	sc := strings.TrimSpace(scale)
	switch {
	case u == "%":
		s += "%"
	case sc != "" && sc != "1":
		s += sc
	case u != "" && u != "%":
		s += " " + u
	}
	return &s
}

func formatNumber(v float64) string {
	// Bilangan bulat tanpa desimal; selain itu maksimal 4 angka di belakang koma, koma sebagai pemisah.
	if v == float64(int64(v)) && v > -1e12 && v < 1e12 {
		return formatInt(int64(v))
	}
	s := strconv.FormatFloat(v, 'f', -1, 64)
	if i := strings.IndexByte(s, '.'); i >= 0 {
		s = s[:i] + "," + s[i+1:]
	}
	return s
}

func formatInt(n int64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := strconv.FormatInt(n, 10)
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(c)
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}

// ToStore mengubah event mentah TV menjadi baris untuk upsert.
func ToStore(r RawEvent) (store.EconomicEventInput, error) {
	id := strings.TrimSpace(r.ID)
	title := strings.TrimSpace(r.Title)
	country := strings.ToUpper(strings.TrimSpace(r.Country))
	if id == "" || title == "" || len(country) != 2 {
		return store.EconomicEventInput{}, fmt.Errorf("calendar: event tidak lengkap id=%q country=%q title=%q", r.ID, r.Country, r.Title)
	}
	at, err := time.Parse(time.RFC3339Nano, r.Date)
	if err != nil {
		at, err = time.Parse(time.RFC3339, r.Date)
	}
	if err != nil {
		return store.EconomicEventInput{}, fmt.Errorf("calendar: tanggal %q: %w", r.Date, err)
	}
	return store.EconomicEventInput{
		ExternalID:     id,
		Country:        country,
		Title:          title,
		Impact:         ImpactFromImportance(r.Importance),
		ScheduledAt:    at.UTC(),
		Actual:         FormatValue(r.Actual, r.Unit, r.Scale),
		Forecast:       FormatValue(r.Forecast, r.Unit, r.Scale),
		Previous:       FormatValue(r.Previous, r.Unit, r.Scale),
		RelatedSymbols: []string{},
		Source:         "tradingview",
	}, nil
}
