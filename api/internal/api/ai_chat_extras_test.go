package api

import (
	"strings"
	"testing"

	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

func TestChartIntentAndSpec(t *testing.T) {
	for _, q := range []string{"tampilkan chart BTC", "Grafik emas 1 tahun dong", "kirim chartnya", "lihat candlestick ETH 4H"} {
		if !chartIntent(q) {
			t.Errorf("chartIntent(%q) = false", q)
		}
	}
	if chartIntent("berita emas hari ini") {
		t.Error("chartIntent tanpa kata chart harus false")
	}
	cases := map[string]string{"chart btc 4h": "4h", "grafik emas 1 jam": "1h", "chart eth mingguan": "1week", "chart btc 1 tahun": "1day", "chart btc": "1day", "chart xau 15 menit": "15min", "chart btc 24 jam": "1h", "chart emas 5 menit": "5min"}
	for q, want := range cases {
		if got, _, _ := chartSpec(q); got != want {
			t.Errorf("chartSpec(%q) = %s, mau %s", q, got, want)
		}
	}
	if _, n, _ := chartSpec("chart btc 1 tahun"); n != 365 {
		t.Errorf("1 tahun = %d candle", n)
	}
}

func TestChatLinks(t *testing.T) {
	a := store.ArticleCard{Slug: "emas-naik-tajam", Title: "Emas naik tajam setelah data inflasi AS"}
	b := store.ArticleCard{Slug: "btc-tembus-80-ribu", Title: "Bitcoin tembus 80 ribu dolar"}
	refs := chatRefs{Articles: map[string]store.ArticleCard{a.Slug: a, b.Slug: b}, Matched: []store.ArticleCard{b}}

	ans, links := chatLinks("Baca [Emas naik](https://contoh.app/berita/emas-naik-tajam) dan [palsu](/berita/tidak-ada). Juga /berita/btc-tembus-80-ribu", refs, false)
	if !strings.Contains(ans, "[Emas naik](/berita/emas-naik-tajam)") {
		t.Errorf("tautan dikenal harus jadi relatif: %s", ans)
	}
	if strings.Contains(ans, "tidak-ada") || !strings.Contains(ans, "palsu") {
		t.Errorf("tautan tak dikenal harus dibuang, teks tetap: %s", ans)
	}
	if !strings.Contains(ans, "[Bitcoin tembus 80 ribu dolar](/berita/btc-tembus-80-ribu)") {
		t.Errorf("URL polos dikenal harus jadi tautan: %s", ans)
	}
	if len(links) != 2 || links[0].URL != "/berita/emas-naik-tajam" {
		t.Errorf("links = %+v", links)
	}

	_, links = chatLinks("Tidak ada rujukan.", refs, true)
	if len(links) != 1 || links[0].URL != "/berita/btc-tembus-80-ribu" {
		t.Errorf("diminta tautan → berita cocok: %+v", links)
	}
}
