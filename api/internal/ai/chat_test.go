package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestChatTurnsAndChartImage(t *testing.T) {
	var last map[string]any
	reply := `{"candidates":[{"content":{"parts":[{"text":"Jawaban."}]}}]}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		last = nil
		_ = json.Unmarshal(b, &last)
		_, _ = w.Write([]byte(reply))
	}))
	defer srv.Close()
	s := &Service{G: &Gemini{Key: "k", Models: []string{"m"}, BaseURL: srv.URL, HTTP: srv.Client()}}
	ans, _, err := s.Chat(context.Background(), "BBCA 10.125", []Turn{{Role: "user", Text: "Halo"}, {Role: "model", Text: "Hai"}, {Role: "user", Text: "BBCA?"}})
	if err != nil || ans != "Jawaban." {
		t.Fatalf("chat: %q %v", ans, err)
	}
	if c := last["contents"].([]any); len(c) != 5 || c[3].(map[string]any)["role"] != "model" {
		t.Fatalf("giliran salah: %v", last["contents"])
	}
	reply = `{"candidates":[{"content":{"parts":[{"text":"{\"valid\":true,\"tren\":\"naik\",\"ringkasan\":\"x\",\"support\":[{\"harga\":\"100\",\"kekuatan\":\"kuat\",\"catatan\":\"swing\"},{\"harga\":\"99\",\"kekuatan\":\"lemah\",\"catatan\":\"a\"},{\"harga\":\"98\",\"kekuatan\":\"lemah\",\"catatan\":\"a\"},{\"harga\":\"97\",\"kekuatan\":\"lemah\",\"catatan\":\"a\"},{\"harga\":\"96\",\"kekuatan\":\"lemah\",\"catatan\":\"a\"}],\"resistance\":[],\"pola\":[],\"indikator\":[],\"skenario_bullish\":\"b\",\"skenario_bearish\":\"c\",\"invalidasi\":\"d\",\"risiko\":\"e\",\"keyakinan\":\"sedang\"}"}]}}]}`
	res, err := s.Chart(context.Background(), "image/png", []byte{0x89, 'P', 'N', 'G'}, "1H", "")
	if err != nil || !res.Valid || len(res.Support) != 4 || res.Model != "m" {
		t.Fatalf("chart: %+v %v", res, err)
	}
	parts := last["contents"].([]any)[0].(map[string]any)["parts"].([]any)
	if _, ok := parts[0].(map[string]any)["inlineData"]; !ok {
		t.Fatalf("gambar tidak dikirim inline: %v", parts)
	}
}
