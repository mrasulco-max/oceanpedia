package ai

import (
	"context"
	"fmt"
	"strings"
)

const chatSystem = `Kamu "Aurora AI", asisten AI OceanBird (Ocean Pedia) sekaligus analis pasar keuangan untuk pembaca Indonesia (saham IDX, crypto, forex, komoditas, makro).
Gunakan Bahasa Indonesia yang ringkas, jelas, dan bersahabat. Boleh memakai daftar berpoin pendek bila membantu.
Pakai data pada bagian KONTEKS (berita terbaru OceanBird, harga terkini, indikator teknikal) sebagai sumber utama dan sebutkan angkanya.
Jangan mengarang angka, tanggal, atau berita yang tidak ada di konteks; bila data tidak tersedia, katakan terus terang.
Hubungkan berita dengan pergerakan harga bila relevan. Sebut judul berita yang dipakai sebagai rujukan.
Jangan memberi perintah beli/jual atau target pasti; jelaskan skenario dan risiko. Ini informasi, bukan saran investasi.
Format angka gaya Indonesia (titik ribuan, koma desimal).
Setiap berita di konteks punya URL. Saat merujuk atau diminta tautan/link berita, tulis tautan markdown persis dari konteks, mis. [Judul berita](/berita/slug). Jangan membuat URL yang tidak ada di konteks; bila berita yang diminta tidak ada, katakan terus terang dan tawarkan berita terdekat.
Aplikasi bisa menampilkan chart harga. Ikuti bagian CHART di konteks bila ada; jangan pernah bilang kamu tidak bisa menampilkan atau mengirim chart.
Bila ditanya siapa kamu, jawab bahwa kamu Aurora AI dari OceanBird; jangan menyebut nama model atau perusahaan penyedia AI.
Langsung jawab pertanyaan; jangan menyapa atau memperkenalkan diri lagi kecuali pengguna menyapa lebih dulu.
Untuk pertanyaan level penting, pakai TEKNIKAL HARIAN (MA, RSI, tertinggi/terendah) bila ada di konteks.`

// Chat menjawab percakapan bebas tentang semua berita & pasar, dengan konteks yang disusun server.
// Enabled: kunci Gemini tersedia.
func (s *Service) Enabled() bool { return s != nil && s.G != nil && s.G.Key != "" }

func (s *Service) Chat(ctx context.Context, contextText string, history []Turn) (string, string, error) {
	if s == nil || s.G == nil || s.G.Key == "" {
		return "", "", ErrDisabled
	}
	turns := []Turn{{Role: "user", Text: "KONTEKS (data per " + s.now().In(wib).Format("2 Jan 2006 15:04") + " WIB):\n" + plain(contextText, 24000)}, {Role: "model", Text: "Siap. Saya akan menjawab berdasarkan konteks tersebut."}}
	turns = append(turns, history...)
	return s.G.ChatText(ctx, chatSystem, turns)
}

// Level harga hasil analisis chart.
type Level struct {
	Harga    string `json:"harga"`
	Kekuatan string `json:"kekuatan"` // kuat | sedang | lemah
	Catatan  string `json:"catatan"`
}

// ChartResult analisis gambar chart dari pengguna.
type ChartResult struct {
	Valid      bool     `json:"valid"`
	Instrumen  string   `json:"instrumen"`
	Timeframe  string   `json:"timeframe"`
	Harga      string   `json:"harga_terakhir"`
	Tren       string   `json:"tren"` // naik | turun | sideways
	Ringkasan  string   `json:"ringkasan"`
	Support    []Level  `json:"support"`
	Resistance []Level  `json:"resistance"`
	Pola       []string `json:"pola"`
	Indikator  []string `json:"indikator"`
	Bullish    string   `json:"skenario_bullish"`
	Bearish    string   `json:"skenario_bearish"`
	Invalidasi string   `json:"invalidasi"`
	Risiko     string   `json:"risiko"`
	Keyakinan  string   `json:"keyakinan"` // rendah | sedang | tinggi
	Model      string   `json:"model"`
}

var levelSchema = map[string]any{"type": "OBJECT", "properties": map[string]any{
	"harga":    map[string]any{"type": "STRING", "description": "Level harga persis seperti terbaca di sumbu chart, atau rentang (mis. 10.050–10.100)"},
	"kekuatan": map[string]any{"type": "STRING", "enum": []string{"kuat", "sedang", "lemah"}},
	"catatan":  map[string]any{"type": "STRING", "description": "Alasan singkat (mis. swing low berulang, MA50, gap)"},
}, "required": []string{"harga", "kekuatan", "catatan"}}

var chartSchema = map[string]any{
	"type": "OBJECT",
	"properties": map[string]any{
		"valid":            map[string]any{"type": "BOOLEAN", "description": "false bila gambar bukan chart harga"},
		"instrumen":        map[string]any{"type": "STRING", "description": "Nama/kode instrumen bila terbaca, kosong bila tidak"},
		"timeframe":        map[string]any{"type": "STRING", "description": "Timeframe bila terbaca (mis. 1H, 4H, 1D), kosong bila tidak"},
		"harga_terakhir":   map[string]any{"type": "STRING"},
		"tren":             map[string]any{"type": "STRING", "enum": []string{"naik", "turun", "sideways"}},
		"ringkasan":        map[string]any{"type": "STRING", "description": "2–3 kalimat kondisi chart"},
		"support":          map[string]any{"type": "ARRAY", "items": levelSchema, "description": "Maks. 4, terdekat dulu"},
		"resistance":       map[string]any{"type": "ARRAY", "items": levelSchema, "description": "Maks. 4, terdekat dulu"},
		"pola":             map[string]any{"type": "ARRAY", "items": map[string]any{"type": "STRING"}, "description": "Pola chart/candlestick yang terlihat"},
		"indikator":        map[string]any{"type": "ARRAY", "items": map[string]any{"type": "STRING"}, "description": "Bacaan indikator yang tampak di gambar (MA, RSI, volume, MACD)"},
		"skenario_bullish": map[string]any{"type": "STRING"},
		"skenario_bearish": map[string]any{"type": "STRING"},
		"invalidasi":       map[string]any{"type": "STRING", "description": "Level yang membatalkan skenario utama"},
		"risiko":           map[string]any{"type": "STRING"},
		"keyakinan":        map[string]any{"type": "STRING", "enum": []string{"rendah", "sedang", "tinggi"}},
	},
	"required": []string{"valid", "tren", "ringkasan", "support", "resistance", "pola", "indikator", "skenario_bullish", "skenario_bearish", "invalidasi", "risiko", "keyakinan"},
}

const chartSystem = `Kamu Aurora AI, analis teknikal OceanBird (Ocean Pedia). Kamu menerima gambar chart harga dari pengguna.
Baca chart secara teliti: sumbu harga, candle/garis, indikator yang tampak, dan label instrumen/timeframe.
Tentukan support & resistance terpenting dari swing high/low, area konsolidasi, gap, garis tren, MA, dan angka bulat.
Tulis level harga persis seperti angka pada sumbu chart; jangan mengarang angka yang tidak dapat dibaca—bila ragu, beri rentang.
Bahasa Indonesia ringkas. Bukan saran investasi: jelaskan skenario, bukan perintah beli/jual.
Support harus di bawah harga terakhir dan resistance di atasnya; urutkan dari yang terdekat dengan harga terakhir.
Bila gambar bukan chart harga, set valid=false dan isi ringkasan dengan penjelasan singkat.`

// Chart menganalisis gambar chart (PNG/JPEG/WEBP) dengan catatan opsional dari pengguna.
func (s *Service) Chart(ctx context.Context, mime string, img []byte, note, contextText string) (*ChartResult, error) {
	if s == nil || s.G == nil || s.G.Key == "" {
		return nil, ErrDisabled
	}
	text := "Analisis chart ini: tren, support, resistance, pola, indikator, skenario bullish/bearish, dan level invalidasi."
	if n := strings.TrimSpace(note); n != "" {
		text += "\nCatatan pengguna: " + plain(n, 400)
	}
	if contextText != "" {
		text += "\n\nData pendukung (harga & indikator resmi, gunakan untuk memeriksa angka):\n" + plain(contextText, 3000)
	}
	var out ChartResult
	model, err := s.G.ChatJSON(ctx, chartSystem, []Turn{{Role: "user", Text: text, ImageMime: mime, ImageData: img}}, chartSchema, &out)
	if err != nil {
		return nil, err
	}
	if len(out.Support) > 4 {
		out.Support = out.Support[:4]
	}
	if len(out.Resistance) > 4 {
		out.Resistance = out.Resistance[:4]
	}
	out.Model = model
	return &out, nil
}

// TechLine merangkum indikator sistem untuk konteks AI.
func TechLine(t Tech) string {
	if !t.OK {
		return ""
	}
	return fmt.Sprintf("RSI14 %.1f · SMA20 %s · SMA50 %s · SMA200 %s · kinerja 5 sesi %+.2f%% · 21 sesi %+.2f%% · 63 sesi %+.2f%% · pivot %s (support %s, resistance %s)",
		t.RSI, f(t.SMA20), f(t.SMA50), f(t.SMA200), t.Perf1W, t.Perf1M, t.Perf3M, f(t.Pivot), f(t.S1), f(t.R1))
}
