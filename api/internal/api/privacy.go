package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/auth"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
)

// GET /v1/me/export — unduh semua data pribadi (JSON) secara langsung, tanpa menunggu admin.
func (s *Server) exportMe(w http.ResponseWriter, r *http.Request) error {
	doc, err := s.Store.ExportUser(r.Context(), uid(r))
	if err != nil {
		return err
	}
	s.audit2(r, uid(r), "privacy.export", nil)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="data-oceanbird-`+s.Now().In(jakarta).Format("2006-01-02")+`.json"`)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(doc))
	return nil
}

// POST /v1/me/delete {confirm:"HAPUS", password} — hapus akun sendiri (pembaca).
// Akun staf dihapus lewat admin agar artikel & jejak redaksi tetap terjaga.
func (s *Server) deleteMe(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Confirm  string `json:"confirm"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	u, err := s.Store.UserByID(r.Context(), uid(r))
	if err != nil {
		return err
	}
	if u.Role != "" && u.Role != "reader" {
		return httpx.Forbidden("Akun staf redaksi dihapus oleh admin. Hubungi admin OceanBird.")
	}
	if strings.ToUpper(strings.TrimSpace(in.Confirm)) != "HAPUS" {
		return httpx.Validation(map[string]string{"confirm": "Ketik HAPUS untuk mengonfirmasi."})
	}
	if u.PasswordHash != "" && !auth.CheckPassword(u.PasswordHash, in.Password) {
		return httpx.Validation(map[string]string{"password": "Kata sandi salah."})
	}
	if err := s.Store.DeleteAccount(r.Context(), u.ID); err != nil {
		return err
	}
	s.audit2(r, u.ID, "privacy.delete_self", map[string]any{"at": s.Now().Format(time.RFC3339)})
	httpx.JSON(w, 200, map[string]any{"deleted": true})
	return nil
}
