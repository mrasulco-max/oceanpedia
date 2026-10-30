// Package ai menghasilkan Analisis AI (ringkasan berita & pasar) dengan Gemini API.
// API key hanya dipakai di server.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Gemini memanggil generateContent; bila model utama sibuk/tidak tersedia, model berikutnya dicoba.
type Gemini struct {
	Key     string
	Models  []string
	BaseURL string
	HTTP    *http.Client
}

func NewGemini(key string, models []string) *Gemini {
	if len(models) == 0 {
		models = []string{"gemini-3.8-flash", "gemini-flash-latest", "gemini-flash-lite-latest"}
	}
	return &Gemini{Key: key, Models: models, BaseURL: "https://generativelanguage.googleapis.com/v1beta", HTTP: &http.Client{Timeout: 40 * time.Second}}
}

// Error dari Gemini API.
type Error struct {
	Code    int
	Message string
}

func (e *Error) Error() string { return fmt.Sprintf("gemini %d: %s", e.Code, e.Message) }

// retryable: kuota/sibuk/model tidak tersedia → coba model lain.
func retryable(err error) bool {
	var e *Error
	if errors.As(err, &e) {
		return e.Code == 404 || e.Code == 429 || e.Code >= 500
	}
	return !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded)
}

// JSON meminta keluaran JSON sesuai schema dan mengurainya ke out. Mengembalikan nama model yang menjawab.
func (g *Gemini) JSON(ctx context.Context, system, prompt string, schema map[string]any, out any) (string, error) {
	cfg := map[string]any{"temperature": 0.3, "responseMimeType": "application/json", "responseSchema": schema}
	return g.generate(ctx, system, prompt, cfg, func(text string) error {
		if err := json.Unmarshal([]byte(text), out); err != nil {
			return fmt.Errorf("gemini: JSON tidak valid: %w", err)
		}
		return nil
	})
}

// Text menghasilkan jawaban teks biasa.
func (g *Gemini) Text(ctx context.Context, system, prompt string) (string, string, error) {
	var ans string
	model, err := g.generate(ctx, system, prompt, map[string]any{"temperature": 0.4}, func(t string) error {
		ans = strings.TrimSpace(t)
		if ans == "" {
			return &Error{Code: 500, Message: "jawaban kosong"}
		}
		return nil
	})
	return ans, model, err
}

func (g *Gemini) generate(ctx context.Context, system, prompt string, cfg map[string]any, parse func(string) error) (string, error) {
	body := map[string]any{
		"systemInstruction": map[string]any{"parts": []map[string]string{{"text": system}}},
		"contents":          []map[string]any{{"role": "user", "parts": []map[string]string{{"text": prompt}}}},
		"generationConfig":  cfg,
	}
	b, _ := json.Marshal(body)
	var last error
	for _, m := range g.Models {
		text, err := g.call(ctx, m, b)
		if err == nil {
			if err = parse(text); err == nil {
				return m, nil
			}
		}
		last = err
		if !retryable(err) {
			break
		}
	}
	return "", last
}

func (g *Gemini) call(ctx context.Context, model string, body []byte) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.BaseURL+"/models/"+model+":generateContent", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", g.Key)
	res, err := g.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	var r struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text    string `json:"text"`
					Thought bool   `json:"thought"`
				} `json:"parts"`
			} `json:"content"`
			FinishReason string `json:"finishReason"`
		} `json:"candidates"`
		Error *struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&r); err != nil {
		return "", &Error{Code: res.StatusCode, Message: "respons tidak valid"}
	}
	if r.Error != nil {
		return "", &Error{Code: r.Error.Code, Message: r.Error.Message}
	}
	if res.StatusCode != http.StatusOK || len(r.Candidates) == 0 {
		return "", &Error{Code: max(res.StatusCode, 500), Message: "tanpa kandidat"}
	}
	var sb strings.Builder
	for _, p := range r.Candidates[0].Content.Parts {
		if !p.Thought {
			sb.WriteString(p.Text)
		}
	}
	return sb.String(), nil
}
