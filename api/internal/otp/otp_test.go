package otp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBirdSendCheck(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer bk_eu1_x" {
			t.Errorf("auth header salah")
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		switch r.URL.Path {
		case "/v1/verify/verifications":
			if body["to"].(map[string]any)["email"] != "a@b.co" {
				t.Errorf("email harus huruf kecil: %v", body)
			}
			w.WriteHeader(201)
			_, _ = w.Write([]byte(`{"id":"vrf_1","status":"pending"}`))
		case "/v1/verify/verifications/check":
			switch body["code"] {
			case "111111":
				_, _ = w.Write([]byte(`{"success":true}`))
			case "222222":
				w.WriteHeader(404)
			default:
				_, _ = w.Write([]byte(`{"success":false,"reason":"incorrect_code","attempts_remaining":2}`))
			}
		}
	}))
	defer srv.Close()
	b := NewBird("bk_eu1_x", srv.URL)
	if err := b.Send(context.Background(), "A@B.co"); err != nil {
		t.Fatal(err)
	}
	if r, err := b.Check(context.Background(), "a@b.co", "111111"); err != nil || !r.OK {
		t.Fatalf("%v %+v", err, r)
	}
	if r, _ := b.Check(context.Background(), "a@b.co", "222222"); r.OK || r.Reason != "not_found" {
		t.Fatalf("%+v", r)
	}
	if r, _ := b.Check(context.Background(), "a@b.co", "333333"); r.OK || r.Message() != "Kode salah. Sisa 2 percobaan." {
		t.Fatalf("%+v %s", r, r.Message())
	}
	if err := (&Bird{}).Send(context.Background(), "a@b.co"); err != ErrUnavailable {
		t.Fatal("tanpa key harus ErrUnavailable")
	}
}
