package ai

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/market"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// Analysis adalah hasil Analisis AI untuk satu artikel atau satu instrumen.
type Analysis struct {
	Inti        string    `json:"inti"`
	Poin        []string  `json:"poin"`
	Sentimen    string    `json:"sentimen"` // positif | netral | negatif
	Skor        int       `json:"skor"`     // 0 (sangat negatif) – 100 (sangat positif)
	Aset        []Aset    `json:"aset"`
	Pantau      []Pantau  `json:"pantau"`
	Pertanyaan  []string  `json:"pertanyaan"`
	Sumber      string    `json:"sumber"` // judul artikel / nama instrumen yang dianalisis
	GeneratedAt time.Time `json:"generated_at"`
	Model       string    `json:"model"`
}

type Aset struct {
	Simbol  string `json:"simbol"`
	Catatan string `json:"catatan"`
	Dampak  string `json:"dampak"` // positif | netral | negatif
}

type Pantau struct {
	Judul string `json:"judul"`
	Nilai string `json:"nilai"`
}

// Service menyimpan hasil di cache bersama (tabel market_cache) agar tiap analisis
// hanya dibuat sekali per periode dan dibagi semua pengunjung.
type Service struct {
	G         *Gemini
	KV        market.KV
	MarketTTL time.Duration // umur analisis pasar (default 10 menit)
	Now       func() time.Time
}

// ErrDisabled: GEMINI_API_KEY belum diatur.
var ErrDisabled = errors.New("analisis AI belum aktif")

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

const system = `Kamu analis pasar keuangan Ocean Pedia untuk pembaca Indonesia.
Tulis dalam Bahasa Indonesia yang ringkas, netral, dan mudah dipahami.
Gunakan HANYA fakta dan angka dari data yang diberikan; jangan mengarang angka, tanggal, atau peristiwa.
Bila data tidak cukup, katakan secukupnya tanpa menebak.
Jangan memberi rekomendasi beli/jual; ini informasi, bukan saran investasi.
Format angka gaya Indonesia (titik pemisah ribuan, koma desimal).`

var schema = map[string]any{
	"type": "OBJECT",
	"properties": map[string]any{
		"inti":     map[string]any{"type": "STRING", "description": "Inti dalam 1 kalimat (maks. 30 kata)"},
		"poin":     map[string]any{"type": "ARRAY", "items": map[string]any{"type": "STRING"}, "description": "3–4 poin ringkas"},
		"sentimen": map[string]any{"type": "STRING", "enum": []string{"positif", "netral", "negatif"}},
		"skor":     map[string]any{"type": "INTEGER", "description": "0 sangat negatif, 50 netral, 100 sangat positif"},
		"aset": map[string]any{"type": "ARRAY", "items": map[string]any{
			"type": "OBJECT",
			"properties": map[string]any{
				"simbol":  map[string]any{"type": "STRING"},
				"catatan": map[string]any{"type": "STRING", "description": "maks. 10 kata"},
				"dampak":  map[string]any{"type": "STRING", "enum": []string{"positif", "netral", "negatif"}},
			},
			"required": []string{"simbol", "catatan", "dampak"},
		}},
		"pantau": map[string]any{"type": "ARRAY", "items": map[string]any{
			"type": "OBJECT",
			"properties": map[string]any{
				"judul": map[string]any{"type": "STRING"},
				"nilai": map[string]any{"type": "STRING", "description": "angka/waktu singkat"},
			},
			"required": []string{"judul", "nilai"},
		}},
		"pertanyaan": map[string]any{"type": "ARRAY", "items": map[string]any{"type": "STRING"}, "description": "3 pertanyaan lanjutan singkat (maks. 6 kata)"},
	},
	"required": []string{"inti", "poin", "sentimen", "skor", "aset", "pantau", "pertanyaan"},
}

func (s *Service) cached(ctx context.Context, key string, ttl time.Duration) (*Analysis, *Analysis) {
	body, errText, at, found, err := s.KV.MarketCacheGet(ctx, key)
	if err != nil || !found || errText != "" || len(body) == 0 {
		return nil, nil
	}
	var a Analysis
	if json.Unmarshal(body, &a) != nil {
		return nil, nil
	}
	if s.now().Sub(at) < ttl {
		return &a, nil
	}
	return nil, &a
}

func (s *Service) store(ctx context.Context, key string, a *Analysis) {
	if b, err := json.Marshal(a); err == nil {
		_ = s.KV.MarketCachePut(ctx, key, b, "")
	}
}

func (s *Service) run(ctx context.Context, key string, ttl time.Duration, prompt, sumber string, post func(*Analysis)) (*Analysis, error) {
	if s == nil || s.G == nil || s.G.Key == "" {
		return nil, ErrDisabled
	}
	fresh, stale := s.cached(ctx, key, ttl)
	if fresh != nil {
		return fresh, nil
	}
	var a Analysis
	model, err := s.G.JSON(ctx, system, prompt, schema, &a)
	if err != nil {
		if stale != nil {
			return stale, nil // Gemini sibuk: sajikan analisis terakhir
		}
		return nil, err
	}
	a.Sumber, a.Model, a.GeneratedAt = sumber, model, s.now().UTC()
	a.normalize()
	if post != nil {
		post(&a)
	}
	s.store(ctx, key, &a)
	return &a, nil
}

func (a *Analysis) normalize() {
	a.Skor = max(0, min(100, a.Skor))
	switch a.Sentimen {
	case "positif", "netral", "negatif":
	default:
		a.Sentimen = "netral"
	}
	if len(a.Poin) > 4 {
		a.Poin = a.Poin[:4]
	}
	if len(a.Aset) > 4 {
		a.Aset = a.Aset[:4]
	}
	if len(a.Pantau) > 4 {
		a.Pantau = a.Pantau[:4]
	}
	if len(a.Pertanyaan) > 3 {
		a.Pertanyaan = a.Pertanyaan[:3]
	}
	for i := range a.Aset {
		a.Aset[i].Simbol = strings.ToUpper(strings.TrimSpace(a.Aset[i].Simbol))
	}
}

var tags = regexp.MustCompile(`<[^>]+>`)

func plain(s string, n int) string {
	s = strings.Join(strings.Fields(tags.ReplaceAllString(s, " ")), " ")
	if r := []rune(s); len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}

func hash(parts ...string) string {
	h := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(h[:6])
}

// Article menganalisis satu artikel (dibuat sekali per versi isi artikel).
func (s *Service) Article(ctx context.Context, a store.Article, symbols []string) (*Analysis, error) {
	key := "ai:a:" + a.Slug + ":" + hash(a.Title, a.Body)
	prompt := fmt.Sprintf(`Analisis berita berikut untuk pembaca pasar.
Judul: %s
Kategori: %s
Terbit: %s
Simbol terkait (pakai untuk daftar aset, maks. 3; boleh tambah aset lain HANYA bila disebut di berita): %s
Isi:
%s

Isi "pantau" dengan hal yang perlu dipantau yang DISEBUT di berita (peristiwa, level, tanggal); kosongkan bila tidak ada.`,
		a.Title, a.Category.Name, a.PublishedAt.Format("2 Jan 2006 15:04 MST"), strings.Join(symbols, ", "), plain(a.Body, 9000))
	return s.run(ctx, key, 30*24*time.Hour, prompt, a.Title, nil)
}

// Market menganalisis kondisi terkini satu instrumen dari harga live, indikator teknikal, dan berita terbaru.
func (s *Service) Market(ctx context.Context, in store.Instrument, q *market.Quote, candles []market.Candle, news []store.ArticleCard) (*Analysis, error) {
	ttl := s.MarketTTL
	if ttl == 0 {
		ttl = 10 * time.Minute
	}
	t := Technicals(candles)
	var sb strings.Builder
	fmt.Fprintf(&sb, "Instrumen: %s (%s, %s, mata uang %s)\nWaktu analisis: %s WIB\n", in.Symbol, in.Name, in.Exchange, in.Currency, s.now().In(wib).Format("2 Jan 2006 15:04"))
	if q != nil {
		fmt.Fprintf(&sb, "Harga terkini: %s (perubahan %s; %+.2f%%), pembukaan %s, tertinggi %s, terendah %s, penutupan sebelumnya %s, rentang 52 minggu %s – %s, sumber %s\n",
			f(q.Price), f(q.Change), q.ChangePercent, f(q.Open), f(q.High), f(q.Low), f(q.PrevClose), f(q.Week52Low), f(q.Week52High), q.Source)
	} else {
		sb.WriteString("Harga terkini: tidak tersedia\n")
	}
	if t.OK {
		fmt.Fprintf(&sb, "Teknikal harian: RSI14 %.1f, SMA20 %s, SMA50 %s, SMA200 %s, kinerja 5 sesi %+.2f%%, 21 sesi %+.2f%%, 63 sesi %+.2f%%, pivot %s, support %s, resistance %s\n",
			t.RSI, f(t.SMA20), f(t.SMA50), f(t.SMA200), t.Perf1W, t.Perf1M, t.Perf3M, f(t.Pivot), f(t.S1), f(t.R1))
	}
	sb.WriteString("Berita terbaru terkait:\n")
	n := 0
	for _, a := range news {
		if n == 6 {
			break
		}
		fmt.Fprintf(&sb, "- [%s] %s — %s\n", a.PublishedAt.In(wib).Format("2 Jan 15:04"), a.Title, plain(a.Excerpt, 220))
		n++
	}
	if n == 0 {
		sb.WriteString("- (tidak ada)\n")
	}
	sb.WriteString(`
Buat ringkasan kondisi terkini instrumen ini: "inti" 1 kalimat tentang pergerakan & penyebab yang didukung data,
"poin" 3 poin (harga/teknikal/berita), "aset" berisi instrumen ini dan maks. 2 aset lain yang disebut di berita,
"pantau" boleh kosong (level support/resistance ditambahkan sistem).`)
	return s.run(ctx, "ai:m:"+in.Symbol, ttl, sb.String(), in.Name, func(a *Analysis) {
		if t.OK {
			lv := []Pantau{{Judul: "Support / resistance " + in.Symbol, Nilai: f(t.S1) + " / " + f(t.R1)}, {Judul: "RSI 14 harian", Nilai: strings.Replace(fmt.Sprintf("%.1f", t.RSI), ".", ",", 1)}}
			for _, p := range a.Pantau { // level teknikal sudah ditambahkan sistem
				j := strings.ToLower(p.Judul)
				if !strings.Contains(j, "support") && !strings.Contains(j, "resistance") && !strings.Contains(j, "rsi") {
					lv = append(lv, p)
				}
			}
			a.Pantau = lv
			if len(a.Pantau) > 4 {
				a.Pantau = a.Pantau[:4]
			}
		}
	})
}

// Ask menjawab pertanyaan pembaca berdasarkan konteks (artikel atau data pasar).
func (s *Service) Ask(ctx context.Context, contextText, question string) (string, string, error) {
	if s == nil || s.G == nil || s.G.Key == "" {
		return "", "", ErrDisabled
	}
	key := "ai:q:" + hash(contextText, strings.ToLower(strings.TrimSpace(question)))
	if body, _, at, found, err := s.KV.MarketCacheGet(ctx, key); err == nil && found && len(body) > 0 && s.now().Sub(at) < time.Hour {
		var c struct{ A, M string }
		if json.Unmarshal(body, &c) == nil && c.A != "" {
			return c.A, c.M, nil
		}
	}
	prompt := fmt.Sprintf("Konteks:\n%s\n\nPertanyaan pembaca: %s\n\nJawab maks. 120 kata, teks biasa tanpa markdown.", plain(contextText, 9000), plain(question, 300))
	ans, model, err := s.G.Text(ctx, system, prompt)
	if err != nil {
		return "", "", err
	}
	if b, err := json.Marshal(struct{ A, M string }{ans, model}); err == nil {
		_ = s.KV.MarketCachePut(ctx, key, b, "")
	}
	return ans, model, nil
}

var wib = time.FixedZone("WIB", 7*3600)

// f memformat angka gaya Indonesia dengan desimal sesuai besaran.
func f(v float64) string {
	dec := 2
	switch a := math.Abs(v); {
	case a >= 1000:
		dec = 0
	case a < 10:
		dec = 4
	}
	s := fmt.Sprintf("%.*f", dec, math.Abs(v))
	intPart, frac, _ := strings.Cut(s, ".")
	var b strings.Builder
	for i, c := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(c)
	}
	out := b.String()
	if frac != "" {
		out += "," + frac
	}
	if v < 0 {
		out = "−" + out
	}
	return out
}
