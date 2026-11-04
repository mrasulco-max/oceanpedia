package api

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/market"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// Tambahan Aurora AI (percakapan): tautan berita yang dirujuk & chart harga yang diminta pengguna.

// chatRefs: bahan dari konteks yang boleh dirujuk jawaban.
type chatRefs struct {
	Articles map[string]store.ArticleCard // semua berita di konteks (slug → kartu)
	Matched  []store.ArticleCard          // berita yang cocok dengan kata kunci / instrumen pertanyaan
	Focus    []store.Instrument           // instrumen yang disebut
}

// chatLink: kartu tautan berita di bawah jawaban.
type chatLink struct {
	Title       string    `json:"title"`
	URL         string    `json:"url"`
	Category    string    `json:"category"`
	PublishedAt time.Time `json:"published_at"`
	CoverURL    *string   `json:"cover_url,omitempty"`
}

// chatChart: data candle untuk chart di aplikasi.
type chatChart struct {
	Symbol    string          `json:"symbol"`
	Name      string          `json:"name"`
	Currency  string          `json:"currency"`
	Interval  string          `json:"interval"`
	Label     string          `json:"label"`
	URL       string          `json:"url"`
	Candles   []market.Candle `json:"candles"`
	Last      float64         `json:"last"`
	ChangePct float64         `json:"change_pct"`
}

var (
	reChartWord = regexp.MustCompile(`(?i)\b(chart|charts|grafik|grafiknya|chartnya|candle|candlestick|kandel|diagram harga|pergerakan harga|tampilkan harga|lihat harga)\b`)
	reLinkWord  = regexp.MustCompile(`(?i)\b(link|links|linknya|tautan|tautannya|url|alamat|baca|artikel|berita|beritanya|sumber)\b`)
	// Tautan markdown ke berita: [judul](/berita/slug) atau URL absolut ke /berita/slug.
	reMdLink = regexp.MustCompile(`\[([^\]\n]{1,200})\]\(((?:https?://[^\s)/]+)?/berita/([a-z0-9-]+))\)`)
	reBare   = regexp.MustCompile(`(?:https?://[^\s)/]+)?/berita/([a-z0-9-]+)`)
)

func chartIntent(q string) bool { return reChartWord.MatchString(q) }
func wantsLinks(q string) bool  { return reLinkWord.MatchString(q) }

// chartSpec membaca timeframe & rentang yang diminta: interval Twelve Data, jumlah candle, label.
func chartSpec(q string) (string, int, string) {
	u := " " + strings.ToUpper(q) + " "
	has := func(ws ...string) bool {
		for _, w := range ws {
			if strings.Contains(u, w) {
				return true
			}
		}
		return false
	}
	switch {
	case has(" 30M ", " 30 MENIT", "30MIN"):
		return "30min", 96, "30 menit"
	case has(" 15M ", " 15 MENIT", "15MIN"):
		return "15min", 96, "15 menit"
	case has(" 5M ", " 5 MENIT", " 5MIN"):
		return "5min", 120, "5 menit"
	case has(" 1M ", " 1 MENIT", " 1MIN"):
		return "1min", 120, "1 menit"
	case has(" 4H ", " 4 JAM", " 4JAM"):
		return "4h", 90, "4 jam"
	case has(" 1H ", " 1 JAM", "PER JAM", "HOURLY", "INTRADAY", "HARI INI", "24 JAM"):
		return "1h", 48, "1 jam"
	case has("BULANAN", "MONTHLY", " 1MO "):
		return "1month", 60, "bulanan"
	case has("MINGGUAN", "WEEKLY", " 1W "):
		return "1week", 104, "mingguan"
	}
	n, label := 90, "harian · 3 bulan"
	switch {
	case has("5 TAHUN"):
		return "1week", 260, "mingguan · 5 tahun"
	case has("1 TAHUN", "SETAHUN", "12 BULAN", "YTD"):
		n, label = 365, "harian · 1 tahun"
	case has("6 BULAN", "ENAM BULAN"):
		n, label = 180, "harian · 6 bulan"
	case has("3 BULAN", "TIGA BULAN"):
		n, label = 90, "harian · 3 bulan"
	case has("1 BULAN", "SEBULAN", "30 HARI"):
		n, label = 30, "harian · 1 bulan"
	case has("1 MINGGU", "SEMINGGU", "MINGGU INI", "7 HARI"):
		return "1h", 168, "1 jam · 7 hari"
	}
	return "1day", n, label
}

// chatCharts: bila pengguna meminta chart, ambil candle instrumen yang disebut (maks. 2).
func (s *Server) chatCharts(ctx context.Context, q string, focus []store.Instrument) []chatChart {
	out := []chatChart{}
	if !chartIntent(q) || len(focus) == 0 {
		return out
	}
	interval, n, label := chartSpec(q)
	for i, in := range focus {
		if i >= 2 {
			break
		}
		cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
		cs, err := s.Market.Candles(cctx, in.ProviderSymbol, interval, n)
		cancel()
		if err != nil || len(cs) < 2 {
			s.Log.Warn("chart Aurora AI gagal", "symbol", in.Symbol, "interval", interval, "err", err)
			continue
		}
		first, last := cs[0].Close, cs[len(cs)-1].Close
		pct := 0.0
		if first != 0 {
			pct = (last - first) / first * 100
		}
		out = append(out, chatChart{Symbol: in.Symbol, Name: in.Name, Currency: in.Currency, Interval: interval, Label: label, URL: "/market/" + in.Symbol, Candles: cs, Last: last, ChangePct: pct})
	}
	return out
}

// chartsContext memberi tahu model chart apa yang sudah tampil di aplikasi (agar tidak bilang "tidak bisa").
func chartsContext(cs []chatChart, asked bool) string {
	if len(cs) == 0 {
		if asked {
			return "\nCHART: pengguna meminta chart, tetapi instrumennya tidak dikenali atau datanya tidak tersedia. Minta pengguna menyebut instrumen yang tersedia di daftar HARGA TERKINI (mis. BTC, emas, ETH, USD/IDR).\n"
		}
		return ""
	}
	var sb strings.Builder
	sb.WriteString("\nCHART YANG SUDAH DITAMPILKAN DI APLIKASI DI BAWAH JAWABANMU:\n")
	for _, c := range cs {
		hi, lo := c.Candles[0].High, c.Candles[0].Low
		for _, k := range c.Candles {
			if k.High > hi {
				hi = k.High
			}
			if k.Low < lo {
				lo = k.Low
			}
		}
		fmt.Fprintf(&sb, "- %s (%s), %s, %d candle: awal %s → akhir %s (%+.2f%%), tertinggi %s, terendah %s\n", c.Symbol, c.Name, c.Label, len(c.Candles), fmtNum(c.Candles[0].Close), fmtNum(c.Last), c.ChangePct, fmtNum(hi), fmtNum(lo))
	}
	sb.WriteString("Katakan chart sudah ditampilkan di bawah, lalu jelaskan singkat pergerakannya memakai angka di atas.\n")
	return sb.String()
}

// chatLinks merapikan tautan berita di jawaban (hanya slug yang benar-benar ada di konteks) dan
// menyusun kartu tautan: berita yang dirujuk jawaban, atau—bila pengguna meminta tautan—berita yang paling cocok.
func chatLinks(ans string, refs chatRefs, asked bool) (string, []chatLink) {
	links := []chatLink{}
	added := map[string]bool{}
	add := func(a store.ArticleCard) {
		if added[a.Slug] || len(links) >= 5 {
			return
		}
		added[a.Slug] = true
		links = append(links, chatLink{Title: a.Title, URL: "/berita/" + a.Slug, Category: a.Category.Name, PublishedAt: a.PublishedAt, CoverURL: a.CoverURL})
	}
	// Tautan markdown: buang yang tidak dikenal, samakan ke path relatif (domain aktif dipakai di aplikasi).
	ans = reMdLink.ReplaceAllStringFunc(ans, func(m string) string {
		sm := reMdLink.FindStringSubmatch(m)
		a, ok := refs.Articles[sm[3]]
		if !ok {
			return sm[1]
		}
		add(a)
		return "[" + sm[1] + "](/berita/" + sm[3] + ")"
	})
	// URL polos /berita/slug → tautan bila dikenal.
	ans = replaceOutsideMd(ans, func(seg string) string {
		return reBare.ReplaceAllStringFunc(seg, func(m string) string {
			slug := reBare.FindStringSubmatch(m)[1]
			a, ok := refs.Articles[slug]
			if !ok {
				return m
			}
			add(a)
			return "[" + a.Title + "](/berita/" + slug + ")"
		})
	})
	// Judul berita yang disebut apa adanya.
	for slug, a := range refs.Articles {
		if len([]rune(a.Title)) >= 20 && strings.Contains(ans, a.Title) && !added[slug] {
			add(a)
		}
	}
	if asked {
		for _, a := range refs.Matched {
			add(a)
		}
	}
	return ans, links
}

// replaceOutsideMd menerapkan fn hanya pada teks di luar tautan markdown [..](..).
func replaceOutsideMd(s string, fn func(string) string) string {
	idx := reMdLink.FindAllStringIndex(s, -1)
	if len(idx) == 0 {
		return fn(s)
	}
	var sb strings.Builder
	prev := 0
	for _, ix := range idx {
		sb.WriteString(fn(s[prev:ix[0]]))
		sb.WriteString(s[ix[0]:ix[1]])
		prev = ix[1]
	}
	sb.WriteString(fn(s[prev:]))
	return sb.String()
}
