package api

import (
	"errors"
	"net/http"
	"net/mail"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// ======================================================================= ikuti kategori & penulis

// PUT|DELETE /v1/me/categories/{slug} dan /v1/me/authors/{slug}
func (s *Server) follow(kind string) func(http.ResponseWriter, *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		slug := strings.ToLower(r.PathValue("slug"))
		if err := s.Store.Follow(r.Context(), kind, uid(r), slug, r.Method == http.MethodPut); err != nil {
			return err
		}
		n, f, err := s.Store.FollowStat(r.Context(), kind, slug, uid(r))
		if err != nil {
			return err
		}
		httpx.JSON(w, 200, map[string]any{"following": f, "followers": n})
		return nil
	}
}

// GET /v1/follows/category/{slug} dan /v1/follows/author/{slug} — jumlah pengikut (+ status bila masuk).
func (s *Server) followStat(kind string) func(http.ResponseWriter, *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		n, f, err := s.Store.FollowStat(r.Context(), kind, strings.ToLower(r.PathValue("slug")), uid(r))
		if err != nil {
			return err
		}
		w.Header().Set("Cache-Control", "private, no-store")
		httpx.JSON(w, 200, map[string]any{"following": f, "followers": n})
		return nil
	}
}

// GET /v1/me/follows
func (s *Server) myFollows(w http.ResponseWriter, r *http.Request) error {
	m, err := s.Store.MyFollows(r.Context(), uid(r))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"categories": m["category"], "authors": m["author"], "topics": m["topic"]})
	return nil
}

// ======================================================================= permintaan iklan (publik)

func cut(s string, n int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > n {
		s = string([]rune(s)[:n])
	}
	return s
}

// POST /v1/ads/inquiries {company, email, budget, message}
func (s *Server) adInquiry(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Company string `json:"company"`
		Email   string `json:"email"`
		Budget  string `json:"budget"`
		Message string `json:"message"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Company, in.Email, in.Budget, in.Message = cut(in.Company, 160), strings.ToLower(cut(in.Email, 200)), cut(in.Budget, 80), cut(in.Message, 2000)
	errs := map[string]string{}
	if utf8.RuneCountInString(in.Company) < 2 {
		errs["company"] = "Isi nama perusahaan."
	}
	if a, err := mail.ParseAddress(in.Email); err != nil || a.Address != in.Email {
		errs["email"] = "Email kerja tidak valid."
	}
	if len(errs) > 0 {
		return httpx.Validation(errs)
	}
	if !s.allowAsk(r.Context(), "adinq:"+httpx.ClientIP(r)) {
		return &httpx.Problem{Type: "about:blank", Title: "Terlalu banyak permintaan", Status: 429, Detail: "Coba lagi nanti atau email corpcom@jalaexplorer.com."}
	}
	id, err := s.Store.AddAdInquiry(r.Context(), in.Company, in.Email, in.Budget, in.Message, uid(r))
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id, "status": "new"})
	return nil
}

// ======================================================================= verifikasi Student

// GET /v1/me/student
func (s *Server) studentStatus(w http.ResponseWriter, r *http.Request) error {
	st, ok, err := s.Store.StudentStatus(r.Context(), uid(r))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"status": st, "verified": ok})
	return nil
}

// POST /v1/me/student {campus_email, student_id}
func (s *Server) studentApply(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		CampusEmail string `json:"campus_email"`
		StudentID   string `json:"student_id"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.CampusEmail, in.StudentID = strings.ToLower(cut(in.CampusEmail, 200)), cut(in.StudentID, 40)
	errs := map[string]string{}
	a, err := mail.ParseAddress(in.CampusEmail)
	if err != nil || a.Address != in.CampusEmail {
		errs["campus_email"] = "Email kampus tidak valid."
	} else if d := in.CampusEmail[strings.LastIndex(in.CampusEmail, "@")+1:]; !(strings.HasSuffix(d, ".ac.id") || strings.HasSuffix(d, ".edu") || strings.Contains(d, ".edu.")) {
		errs["campus_email"] = "Gunakan email kampus (berakhiran .ac.id atau .edu)."
	}
	if utf8.RuneCountInString(in.StudentID) < 3 {
		errs["student_id"] = "Isi NIM / nomor induk mahasiswa."
	}
	if len(errs) > 0 {
		return httpx.Validation(errs)
	}
	if _, ok, err := s.Store.StudentStatus(r.Context(), uid(r)); err == nil && ok {
		httpx.JSON(w, 200, map[string]any{"status": "approved", "verified": true})
		return nil
	}
	id, err := s.Store.AddStudentVerification(r.Context(), uid(r), in.CampusEmail, in.StudentID)
	if errors.Is(err, store.ErrDuplicate) {
		return &httpx.Problem{Type: "about:blank", Title: "Pengajuan sedang diperiksa", Status: 409, Detail: "Pengajuan verifikasi Student kamu masih diperiksa tim kami (maks. 2 hari kerja)."}
	}
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id, "status": "pending", "verified": false})
	return nil
}

// ======================================================================= permintaan data pribadi (UU PDP)

// POST /v1/me/privacy-requests {kind, detail}
func (s *Server) privacyRequest(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Kind   string `json:"kind"`
		Detail string `json:"detail"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if in.Kind == "" {
		in.Kind = "export"
	}
	if !slices.Contains([]string{"export", "delete", "correction", "other"}, in.Kind) {
		return httpx.Validation(map[string]string{"kind": "Jenis permintaan tidak dikenal."})
	}
	id, err := s.Store.AddPrivacyRequest(r.Context(), uid(r), in.Kind, cut(in.Detail, 2000))
	if errors.Is(err, store.ErrDuplicate) {
		return &httpx.Problem{Type: "about:blank", Title: "Permintaan sudah tercatat", Status: 409, Detail: "Permintaan serupa sedang diproses (maks. 30 hari)."}
	}
	if err != nil {
		return err
	}
	s.audit2(r, uid(r), "privacy.request", map[string]any{"kind": in.Kind})
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id, "status": "pending"})
	return nil
}

// ======================================================================= admin: semua permintaan

// GET /v1/admin/requests?kind=ad|student|privacy
func (s *Server) adminRequests(w http.ResponseWriter, r *http.Request) error {
	kind := r.URL.Query().Get("kind")
	switch kind {
	case "ad":
		if err := need(r, "ads.manage"); err != nil {
			return err
		}
	case "student", "privacy":
		if err := need(r, "users.read"); err != nil {
			return err
		}
	case "":
		if err := need(r, "users.read"); err != nil {
			return err
		}
	default:
		kind = ""
	}
	l, err := s.Store.Requests(r.Context(), kind, limitParam(r, 100, 300))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, Page[store.Request]{Data: l})
	return nil
}

// POST /v1/admin/requests/{kind}/{id} {status, note}
func (s *Server) adminRequestStatus(w http.ResponseWriter, r *http.Request) error {
	kind := r.PathValue("kind")
	perm := "users.ban"
	if kind == "ad" {
		perm = "ads.manage"
	}
	if err := need(r, perm); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	valid := map[string][]string{"ad": {"new", "contacted", "won", "lost"}, "student": {"approved", "rejected"}, "privacy": {"done", "rejected"}}
	if !slices.Contains(valid[kind], in.Status) {
		return httpx.Validation(map[string]string{"status": "Status tidak dikenal."})
	}
	user, err := s.Store.SetRequestStatus(r.Context(), kind, id, in.Status, claims(r).Sub, cut(in.Note, 500))
	if err != nil {
		return err
	}
	s.audit(r, "request."+kind+"."+in.Status, id, nil)
	if user != "" {
		msgs := map[string][2]string{
			"student/approved": {"Verifikasi Student disetujui", "Paket Ocean Pedia Plus Student kini bisa kamu langganan."},
			"student/rejected": {"Verifikasi Student belum disetujui", "Periksa kembali email kampus & NIM, lalu ajukan ulang."},
			"privacy/done":     {"Permintaan data pribadi selesai", "Permintaan data pribadimu sudah diproses. Cek email untuk detailnya."},
			"privacy/rejected": {"Permintaan data pribadi ditolak", "Hubungi help@jalaexplorer.com untuk informasi lebih lanjut."},
		}
		if m, ok := msgs[kind+"/"+in.Status]; ok {
			link := "/plus"
			if kind == "privacy" {
				link = "/legal"
			}
			if err := s.Store.Notify(r.Context(), user, store.NotifyInput{Kind: "account", Title: m[0], Body: m[1], Link: link}); err != nil {
				s.Log.Warn("notifikasi permintaan gagal", "err", err)
			}
		}
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// GET /v1/stats/public — angka ringkas untuk media kit / halaman Pasang iklan.
func (s *Server) publicStats(w http.ResponseWriter, r *http.Request) error {
	m, err := s.Store.PublicStats(r.Context())
	if err != nil {
		return err
	}
	cacheFor(w, 10*time.Minute)
	httpx.JSON(w, 200, m)
	return nil
}

// POST /v1/admin/articles/{id}/assign {user_id} — tugaskan editor; editor menerima notifikasi.
func (s *Server) assignArticle(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "content.publish"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		UserID string `json:"user_id"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if !uuidRe.MatchString(in.UserID) {
		return httpx.Validation(map[string]string{"user_id": "Pilih anggota tim."})
	}
	title, err := s.Store.AssignArticle(r.Context(), id, in.UserID)
	if err != nil {
		return err
	}
	s.audit(r, "article.assign", id, map[string]any{"to": in.UserID})
	if err := s.Store.Notify(r.Context(), in.UserID, store.NotifyInput{Kind: "account", Title: "Tugas review artikel", Body: title, Link: "/admin/konten?id=" + id}); err != nil {
		s.Log.Warn("notifikasi tugas gagal", "err", err)
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
