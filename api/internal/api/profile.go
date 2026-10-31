package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/mrasulco-max/oceanpedia/api/internal/auth"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// Batas price alert aktif untuk akun gratis (Plus: tanpa batas).
const freeAlertLimit = 3

// GET /v1/me/profile — profil, preferensi, ringkasan aktivitas, dan topik yang diikuti.
func (s *Server) profile(w http.ResponseWriter, r *http.Request) error {
	p, err := s.Store.Profile(r.Context(), uid(r))
	if err != nil {
		return err
	}
	limit := freeAlertLimit
	if p.Plan != nil {
		limit = 0 // tanpa batas
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"profile": p, "alert_limit": limit})
	return nil
}

// Preferensi yang boleh disimpan: kunci → nilai string yang diizinkan (nil = boolean).
var prefSchema = map[string][]string{
	"breaking": nil, "morning_digest": nil, "high_impact": nil, "promo": nil, "price_alert": nil, "topics_notif": nil,
	"comment_replies": nil, "reduce_motion": nil, "autoplay_video": nil,
	"theme":         {"light", "dark", "system"},
	"font_size":     {"small", "medium", "large"},
	"quiet_hours":   {"off", "21-06", "22-06", "23-07"},
	"language":      {"id", "en"},
	"timezone":      {"Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"},
	"number_format": {"id", "en", "space"},
}

func validPrefs(raw json.RawMessage) (json.RawMessage, error) {
	if len(bytes.TrimSpace(raw)) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, errors.New("Preferensi harus berupa objek.")
	}
	for k, v := range m {
		allowed, ok := prefSchema[k]
		if !ok {
			return nil, errors.New("Preferensi tidak dikenal: " + k)
		}
		if allowed == nil {
			if _, isBool := v.(bool); !isBool {
				return nil, errors.New("Preferensi " + k + " harus true/false.")
			}
			continue
		}
		str, _ := v.(string)
		okv := false
		for _, a := range allowed {
			okv = okv || a == str
		}
		if !okv {
			return nil, errors.New("Nilai preferensi " + k + " tidak valid.")
		}
	}
	out, _ := json.Marshal(m)
	return out, nil
}

// PATCH /v1/me {full_name?, display_name?, phone?, preferences?}
func (s *Server) updateMe(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		FullName    *string         `json:"full_name"`
		DisplayName *string         `json:"display_name"`
		Phone       *string         `json:"phone"`
		Preferences json.RawMessage `json:"preferences"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	errs := map[string]string{}
	up := store.ProfileUpdate{}
	if in.FullName != nil {
		v := strings.TrimSpace(*in.FullName)
		if n := utf8.RuneCountInString(v); n < 2 || n > 100 {
			errs["full_name"] = "Nama 2–100 karakter."
		}
		up.FullName = &v
	}
	if in.DisplayName != nil {
		v := strings.TrimSpace(*in.DisplayName)
		if utf8.RuneCountInString(v) > 40 {
			errs["display_name"] = "Nama tampilan maks. 40 karakter."
		}
		up.DisplayName = &v
	}
	if in.Phone != nil {
		p, ok := normalizePhone(*in.Phone)
		if !ok {
			errs["phone"] = "Nomor HP tidak valid (contoh: 812 3456 7890)."
		}
		up.Phone = &p
	}
	prefs, err := validPrefs(in.Preferences)
	if err != nil {
		errs["preferences"] = err.Error()
	}
	up.Preferences = prefs
	if len(errs) > 0 {
		return httpx.Validation(errs)
	}
	if err := s.Store.UpdateProfile(r.Context(), uid(r), up); err != nil {
		return err
	}
	return s.profile(w, r)
}

// POST /v1/me/password {current_password, new_password} — ganti sandi, keluarkan perangkat lain, terbitkan sesi baru.
func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	u, err := s.Store.UserByID(r.Context(), uid(r))
	if err != nil {
		return err
	}
	if u.PasswordHash == "" || !auth.CheckPassword(u.PasswordHash, in.Current) {
		return httpx.Validation(map[string]string{"current_password": "Kata sandi lama salah."})
	}
	if err := auth.ValidateNewPassword(in.New); err != nil {
		return httpx.Validation(map[string]string{"new_password": err.Error()})
	}
	if in.New == in.Current {
		return httpx.Validation(map[string]string{"new_password": "Kata sandi baru harus berbeda dari yang lama."})
	}
	hash, err := auth.HashPassword(in.New)
	if err != nil {
		return err
	}
	if err := s.Store.SetPassword(r.Context(), u.ID, hash); err != nil {
		return err
	}
	if err := s.Store.RevokeUserTokens(r.Context(), u.ID); err != nil {
		return err
	}
	return s.issue(w, r, u, http.StatusOK)
}

// GET /v1/me/sessions — perangkat yang sedang masuk. Header X-Session-Hash (sha256 hex refresh token) menandai perangkat ini.
func (s *Server) sessions(w http.ResponseWriter, r *http.Request) error {
	list, err := s.Store.Sessions(r.Context(), uid(r))
	if err != nil {
		return err
	}
	cur := strings.ToLower(r.Header.Get("X-Session-Hash"))
	for i := range list {
		list[i].Current = cur != "" && hex.EncodeToString(list[i].Hash) == cur
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, Page[store.Session]{Data: list})
	return nil
}

// DELETE /v1/me/sessions/{id} — keluarkan satu perangkat.
func (s *Server) revokeSession(w http.ResponseWriter, r *http.Request) error {
	if err := s.Store.RevokeSession(r.Context(), uid(r), r.PathValue("id")); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// PUT /v1/me/topics/{slug} — ikuti topik.
func (s *Server) followTopic(w http.ResponseWriter, r *http.Request) error {
	if err := s.Store.FollowTopic(r.Context(), uid(r), r.PathValue("slug")); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// DELETE /v1/me/topics/{slug} — berhenti mengikuti topik.
func (s *Server) unfollowTopic(w http.ResponseWriter, r *http.Request) error {
	if err := s.Store.UnfollowTopic(r.Context(), uid(r), r.PathValue("slug")); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// sessionHash: helper uji/BFF — sha256 hex dari refresh token.
func sessionHash(rt string) string { h := sha256.Sum256([]byte(rt)); return hex.EncodeToString(h[:]) }
