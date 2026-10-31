package api

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

func (f *fake) SetAvatar(_ context.Context, id, mime string, data []byte) (string, error) {
	f.avatar = map[string]string{"user": id, "mime": mime}
	return "11111111-1111-1111-1111-111111111111", nil
}
func (f *fake) RemoveAvatar(_ context.Context, id string) error { f.avatar = nil; return nil }

func multipartBody(t *testing.T, data []byte) (*bytes.Buffer, string) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("file", "foto.png")
	_, _ = fw.Write(data)
	_ = mw.Close()
	return &buf, mw.FormDataContentType()
}

func TestAvatarUpload(t *testing.T) {
	s, h := newTest(t)
	f := s.Store.(*fake)
	do(h, "POST", "/v1/auth/register", `{"email":"a@example.com","password":"Sandi-lama1","full_name":"Foto"}`)
	ver := do(h, "POST", "/v1/auth/verify", `{"email":"a@example.com","code":"123456"}`)
	var tr TokenResponse
	_ = json.Unmarshal(ver.Body.Bytes(), &tr)

	send := func(data []byte) *httptest.ResponseRecorder {
		body, ct := multipartBody(t, data)
		req := httptest.NewRequest("POST", "/v1/me/avatar", body)
		req.Header.Set("Content-Type", ct)
		req.Header.Set("Authorization", "Bearer "+tr.AccessToken)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		return w
	}
	if w := send([]byte("bukan gambar")); w.Code != http.StatusBadRequest {
		t.Fatalf("teks harus ditolak: %d %s", w.Code, w.Body)
	}
	var img bytes.Buffer
	_ = png.Encode(&img, image.NewRGBA(image.Rect(0, 0, 4, 4)))
	w := send(img.Bytes())
	if w.Code != http.StatusCreated || f.avatar["mime"] != "image/png" {
		t.Fatalf("unggah: %d %s", w.Code, w.Body)
	}
	if w := do(h, "DELETE", "/v1/me/avatar", "", "Authorization", "Bearer "+tr.AccessToken); w.Code != http.StatusNoContent || f.avatar != nil {
		t.Fatalf("hapus: %d", w.Code)
	}
	req := httptest.NewRequest("POST", "/v1/me/avatar", nil)
	rw := httptest.NewRecorder()
	h.ServeHTTP(rw, req)
	if rw.Code != http.StatusUnauthorized {
		t.Fatalf("tanpa login: %d", rw.Code)
	}
}
