package api

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/mrasulco-max/oceanpedia/api/internal/auth"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// Peran redaksi yang boleh membuka panel admin.
var staffRoles = map[string]bool{"author": true, "editor": true, "admin": true}

// canPublish: hanya editor & admin yang boleh menerbitkan; penulis mengirim ke review.
func canPublish(role string) bool { return role == "editor" || role == "admin" }

func requireStaff(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, ok := auth.FromContext(r.Context())
		if !ok {
			httpx.Error(w, r, httpx.Unauthorized("Silakan masuk terlebih dahulu."))
			return
		}
		if !staffRoles[c.Role] {
			httpx.Error(w, r, httpx.Forbidden("Akun ini tidak punya akses ke panel redaksi."))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func claims(r *http.Request) auth.Claims { c, _ := auth.FromContext(r.Context()); return c }

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func pathID(r *http.Request) (string, error) {
	id := r.PathValue("id")
	if !uuidRe.MatchString(id) {
		return "", httpx.NotFound("Artikel tidak ditemukan.")
	}
	return id, nil
}

var fold = map[rune]rune{
	'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
	'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ñ': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ù': 'u',
	'ú': 'u', 'û': 'u', 'ü': 'u', 'ý': 'y', 'ÿ': 'y',
}

// Slugify mengubah judul menjadi slug URL (huruf kecil, ASCII, dipisah tanda hubung, maks. 80 karakter).
func Slugify(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		if f, ok := fold[r]; ok {
			r = f // é → e, ñ → n, dst.
		}
		switch {
		case r < unicode.MaxASCII && (unicode.IsLetter(r) || unicode.IsDigit(r)):
			b.WriteRune(r)
			dash = false
		case !dash && b.Len() > 0:
			b.WriteByte('-')
			dash = true
		}
		if b.Len() >= 80 {
			break
		}
	}
	out := strings.Trim(b.String(), "-")
	if len(out) > 80 {
		out = strings.Trim(out[:80], "-")
	}
	if out == "" {
		out = "artikel"
	}
	return out
}

// readingMinutes: ±200 kata per menit, minimal 1.
func readingMinutes(body string) int {
	n := len(strings.Fields(body))
	m := (n + 199) / 200
	if m < 1 {
		m = 1
	}
	return m
}

// articleReq adalah body JSON form "Tulis artikel".
type articleReq struct {
	Title      string   `json:"title"`
	Excerpt    string   `json:"excerpt"`
	Body       string   `json:"body"`
	Category   string   `json:"category"`
	CoverURL   *string  `json:"cover_url"`
	IsPremium  bool     `json:"is_premium"`
	IsBreaking bool     `json:"is_breaking"`
	Symbols    []string `json:"symbols"`
	// Action: "draft" (simpan), "review" (kirim ke editor), "publish" (terbitkan; editor/admin).
	Action    string     `json:"action"`
	PublishAt *time.Time `json:"publish_at"`
}

// decideStatus menerjemahkan aksi + peran menjadi status & waktu terbit.
func decideStatus(role, action string, publishAt *time.Time, now time.Time) (string, *time.Time, error) {
	switch action {
	case "", "draft":
		return "draft", nil, nil
	case "review":
		return "review", nil, nil
	case "publish":
		if !canPublish(role) {
			return "", nil, httpx.Forbidden("Penulis tidak bisa menerbitkan langsung. Kirim ke review agar diperiksa editor.")
		}
		t := now
		if publishAt != nil && publishAt.After(now) {
			t = *publishAt // terjadwal: tampil otomatis saat waktunya tiba
		}
		return "published", &t, nil
	default:
		return "", nil, httpx.BadRequest("Aksi tidak dikenal: " + action)
	}
}

func (s *Server) validateArticle(in *articleReq, role, status string) error {
	in.Title = strings.TrimSpace(in.Title)
	in.Excerpt = strings.TrimSpace(in.Excerpt)
	in.Body = strings.TrimSpace(strings.ReplaceAll(in.Body, "\r\n", "\n"))
	in.Category = strings.TrimSpace(in.Category)
	f := map[string]string{}
	if n := len([]rune(in.Title)); n < 8 || n > 200 {
		f["title"] = "Judul 8–200 karakter."
	}
	if len([]rune(in.Excerpt)) > 400 {
		f["excerpt"] = "Dek maksimal 400 karakter."
	}
	if in.Category == "" {
		f["category"] = "Pilih kategori."
	}
	if status != "draft" && len([]rune(in.Body)) < 50 {
		f["body"] = "Isi artikel minimal 50 karakter sebelum dikirim."
	}
	if status != "draft" && in.Excerpt == "" {
		f["excerpt"] = "Isi dek (ringkasan) sebelum dikirim."
	}
	if in.IsBreaking && !canPublish(role) {
		f["is_breaking"] = "Hanya editor/admin yang bisa menandai BREAKING."
	}
	if in.CoverURL != nil {
		u := strings.TrimSpace(*in.CoverURL)
		if u == "" {
			in.CoverURL = nil
		} else if !strings.HasPrefix(u, "https://") && !strings.HasPrefix(u, "/") {
			f["cover_url"] = "URL foto harus https."
		}
	}
	seen := map[string]bool{}
	syms := []string{}
	for _, x := range in.Symbols {
		x = strings.ToUpper(strings.TrimSpace(x))
		if x != "" && !seen[x] {
			seen[x] = true
			syms = append(syms, x)
		}
	}
	if len(syms) > 10 {
		f["symbols"] = "Maksimal 10 ticker."
	}
	in.Symbols = syms
	if len(f) > 0 {
		return httpx.Validation(f)
	}
	return nil
}

func (in articleReq) toInput(status string, publishedAt *time.Time) store.ArticleInput {
	return store.ArticleInput{
		Title: in.Title, Excerpt: in.Excerpt, Body: in.Body, CategorySlug: in.Category, CoverURL: in.CoverURL,
		IsPremium: in.IsPremium, IsBreaking: in.IsBreaking, Symbols: in.Symbols, Status: status, PublishedAt: publishedAt,
		ReadingMinutes: readingMinutes(in.Body),
	}
}

// GET /v1/admin/articles?status=&q=&mine=1
func (s *Server) adminArticles(w http.ResponseWriter, r *http.Request) error {
	c := claims(r)
	q := r.URL.Query()
	f := store.AdminArticleFilter{Status: q.Get("status"), Query: strings.TrimSpace(q.Get("q")), Limit: limitParam(r, 50, 100)}
	switch f.Status {
	case "", "draft", "review", "scheduled", "published", "archived", "revision", "breaking":
	default:
		return httpx.BadRequest("Status tidak dikenal.")
	}
	// Penulis hanya melihat artikelnya sendiri.
	if q.Get("mine") == "1" || !canPublish(c.Role) {
		f.Mine = c.Sub
	}
	list, err := s.Store.AdminArticles(r.Context(), f)
	if err != nil {
		return err
	}
	counts, err := s.Store.AdminCounts(r.Context())
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"data": list, "counts": counts})
	return nil
}

// GET /v1/admin/articles/{id}
func (s *Server) adminArticle(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	a, err := s.Store.AdminArticle(r.Context(), id)
	if err != nil {
		return err
	}
	c := claims(r)
	if !canPublish(c.Role) && !a.OwnedBy(c.Sub) {
		return httpx.NotFound("Artikel tidak ditemukan.")
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, a)
	return nil
}

// POST /v1/admin/articles
func (s *Server) createArticle(w http.ResponseWriter, r *http.Request) error {
	c := claims(r)
	var in articleReq
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	status, at, err := decideStatus(c.Role, in.Action, in.PublishAt, s.Now())
	if err != nil {
		return err
	}
	if err := s.validateArticle(&in, c.Role, status); err != nil {
		return err
	}
	u, err := s.Store.UserByID(r.Context(), c.Sub)
	if err != nil {
		return err
	}
	base := Slugify(in.Title)
	slugFn := func(i int) string {
		if i == 0 {
			return base
		}
		return fmt.Sprintf("%s-%d", base, i+1)
	}
	a, err := s.Store.CreateArticle(r.Context(), c.Sub, Slugify(u.FullName), in.toInput(status, at), slugFn)
	if err != nil {
		return err
	}
	s.audit(r, "article."+actionVerb(status), a.ID, map[string]any{"title": a.Title, "status": a.Status})
	httpx.JSON(w, http.StatusCreated, a)
	return nil
}

// PUT /v1/admin/articles/{id}
func (s *Server) updateArticle(w http.ResponseWriter, r *http.Request) error {
	c := claims(r)
	id, err := pathID(r)
	if err != nil {
		return err
	}
	cur, err := s.Store.AdminArticle(r.Context(), id)
	if err != nil {
		return err
	}
	if !canPublish(c.Role) {
		if !cur.OwnedBy(c.Sub) {
			return httpx.NotFound("Artikel tidak ditemukan.")
		}
		if cur.Status != "draft" && cur.Status != "review" {
			return httpx.Forbidden("Artikel yang sudah terbit hanya bisa diubah editor.")
		}
	}
	var in articleReq
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	status, at, err := decideStatus(c.Role, in.Action, in.PublishAt, s.Now())
	if err != nil {
		return err
	}
	// Mengedit artikel yang sudah terbit tanpa aksi "publish" mempertahankan waktu terbit aslinya.
	if status == "published" && cur.Status == "published" && cur.PublishedAt != nil && in.PublishAt == nil {
		at = cur.PublishedAt
	}
	if err := s.validateArticle(&in, c.Role, status); err != nil {
		return err
	}
	a, err := s.Store.UpdateArticle(r.Context(), id, in.toInput(status, at))
	if err != nil {
		return err
	}
	s.audit(r, "article."+actionVerb(status), a.ID, map[string]any{"title": a.Title, "status": a.Status})
	httpx.JSON(w, 200, a)
	return nil
}

// POST /v1/admin/articles/{id}/status  {action: publish|reject|archive|unpublish, note, publish_at}
func (s *Server) articleStatus(w http.ResponseWriter, r *http.Request) error {
	c := claims(r)
	if !canPublish(c.Role) {
		return httpx.Forbidden("Hanya editor/admin yang bisa mengubah status terbit.")
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Action    string     `json:"action"`
		Note      string     `json:"note"`
		PublishAt *time.Time `json:"publish_at"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	cur, err := s.Store.AdminArticle(r.Context(), id)
	if err != nil {
		return err
	}
	var (
		status string
		at     *time.Time
	)
	switch in.Action {
	case "publish":
		if len([]rune(cur.Body)) < 50 || cur.Excerpt == "" {
			return httpx.Validation(map[string]string{"body": "Lengkapi dek dan isi artikel sebelum terbit."})
		}
		status, at, _ = decideStatus(c.Role, "publish", in.PublishAt, s.Now())
	case "reject", "unpublish":
		status = "draft"
	case "archive":
		status, at = "archived", cur.PublishedAt
	default:
		return httpx.BadRequest("Aksi tidak dikenal: " + in.Action)
	}
	if err := s.Store.SetArticleStatus(r.Context(), id, status, at, strings.TrimSpace(in.Note)); err != nil {
		return err
	}
	s.audit(r, "article."+in.Action, id, map[string]any{"title": cur.Title, "note": in.Note})
	a, err := s.Store.AdminArticle(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, a)
	return nil
}

const maxUpload = 4 << 20

var allowedMime = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true, "image/gif": true}

// POST /v1/admin/media (multipart/form-data, field "file")
// readImage membaca field multipart "file" dan memastikan isinya foto yang diizinkan.
func readImage(w http.ResponseWriter, r *http.Request) ([]byte, string, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload+64<<10)
	f, _, err := r.FormFile("file")
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return nil, "", httpx.BadRequest("Ukuran foto maksimal 4 MB.")
		}
		return nil, "", httpx.BadRequest("Sertakan berkas foto pada field \"file\".")
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxUpload+1))
	if err != nil {
		return nil, "", err
	}
	if len(data) == 0 || len(data) > maxUpload {
		return nil, "", httpx.BadRequest("Ukuran foto maksimal 4 MB.")
	}
	mime := http.DetectContentType(data)
	if !allowedMime[mime] {
		return nil, "", httpx.BadRequest("Format foto harus JPG, PNG, WebP, atau GIF.")
	}
	return data, mime, nil
}

func (s *Server) uploadMedia(w http.ResponseWriter, r *http.Request) error {
	data, mime, err := readImage(w, r)
	if err != nil {
		return err
	}
	id, err := s.Store.CreateMedia(r.Context(), claims(r).Sub, mime, data)
	if err != nil {
		return err
	}
	url := publicBase(r) + "/v1/media/" + id
	s.audit(r, "media.upload", id, map[string]any{"mime": mime, "size": len(data)})
	httpx.JSON(w, http.StatusCreated, map[string]string{"id": id, "url": url})
	return nil
}

// GET /v1/media/{id} — publik, cache permanen (konten tidak pernah berubah untuk ID yang sama).
func (s *Server) media(w http.ResponseWriter, r *http.Request) error {
	id := r.PathValue("id")
	if !uuidRe.MatchString(id) {
		return httpx.NotFound("Media tidak ditemukan.")
	}
	mime, data, err := s.Store.Media(r.Context(), id)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("Content-Length", fmt.Sprint(len(data)))
	w.WriteHeader(200)
	_, err = w.Write(data)
	return err
}

// publicBase menebak URL publik API dari permintaan (di balik proxy Vercel memakai X-Forwarded-*).
func publicBase(r *http.Request) string {
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		proto = "http"
		if r.TLS != nil {
			proto = "https"
		}
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	return proto + "://" + host
}

func actionVerb(status string) string {
	switch status {
	case "review":
		return "submit"
	case "published":
		return "publish"
	default:
		return "save"
	}
}

func (s *Server) audit(r *http.Request, action, id string, data map[string]any) {
	entity := strings.SplitN(action, ".", 2)[0]
	if err := s.Store.Audit(r.Context(), claims(r).Sub, action, entity, id, data); err != nil {
		s.Log.Warn("audit gagal", "action", action, "err", err)
	}
}
