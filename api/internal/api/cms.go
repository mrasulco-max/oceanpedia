package api

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// ======================================================================= kategori

var (
	slugRe  = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
	colorRe = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)
	iconRe  = regexp.MustCompile(`^[a-z]{2,16}$`)
)

func optUUID(p *string) *string {
	if p == nil {
		return nil
	}
	v := strings.TrimSpace(*p)
	if v == "" {
		return nil
	}
	return &v
}

func validCategory(in *store.CategoryInput) error {
	in.Name = strings.TrimSpace(in.Name)
	in.Slug = strings.Trim(strings.ToLower(strings.TrimSpace(in.Slug)), "-")
	if in.Slug == "" {
		in.Slug = Slugify(in.Name)
	}
	in.Description = strings.TrimSpace(in.Description)
	in.SEOTitle = strings.TrimSpace(in.SEOTitle)
	in.SEODescription = strings.TrimSpace(in.SEODescription)
	in.ParentID = optUUID(in.ParentID)
	in.EditorID = optUUID(in.EditorID)
	if in.Icon == "" || !iconRe.MatchString(in.Icon) {
		in.Icon = "bars"
	}
	if in.Color == "" {
		in.Color = "#E5ECFF"
	}
	if in.Status == "" {
		in.Status = "active"
	}
	f := map[string]string{}
	if n := utf8.RuneCountInString(in.Name); n < 2 || n > 40 {
		f["name"] = "Nama kategori 2–40 karakter."
	}
	if !slugRe.MatchString(in.Slug) || len(in.Slug) > 40 {
		f["slug"] = "Slug hanya huruf kecil, angka, dan tanda minus (maks. 40)."
	}
	if utf8.RuneCountInString(in.Description) > 160 {
		f["description"] = "Deskripsi maksimal 160 karakter."
	}
	if utf8.RuneCountInString(in.SEOTitle) > 70 {
		f["seo_title"] = "Judul SEO maksimal 70 karakter."
	}
	if utf8.RuneCountInString(in.SEODescription) > 160 {
		f["seo_description"] = "Meta deskripsi maksimal 160 karakter."
	}
	if !colorRe.MatchString(in.Color) {
		f["color"] = "Warna harus format #RRGGBB."
	}
	switch in.Status {
	case "active", "draft", "archived":
	default:
		f["status"] = "Status tidak dikenal."
	}
	if in.ParentID != nil && !uuidRe.MatchString(*in.ParentID) {
		f["parent_id"] = "Induk tidak valid."
	}
	if in.EditorID != nil && !uuidRe.MatchString(*in.EditorID) {
		f["editor_id"] = "Editor tidak valid."
	}
	if in.SortOrder < 0 || in.SortOrder > 999 {
		f["sort_order"] = "Urutan 0–999."
	}
	if len(f) > 0 {
		return httpx.Validation(f)
	}
	return nil
}

// GET /v1/admin/categories
func (s *Server) adminCategories(w http.ResponseWriter, r *http.Request) error {
	cs, err := s.Store.AdminCategories(r.Context())
	if err != nil {
		return err
	}
	tags, err := s.Store.AdminTags(r.Context(), strings.TrimSpace(r.URL.Query().Get("q")), 200)
	if err != nil {
		return err
	}
	all, unused, err := s.Store.TagCounts(r.Context())
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"categories": cs, "tags": tags, "tag_total": all, "tag_unused": unused})
	return nil
}

// POST /v1/admin/categories
func (s *Server) createCategory(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "taxonomy.manage"); err != nil {
		return err
	}
	var in store.CategoryInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validCategory(&in); err != nil {
		return err
	}
	id, err := s.Store.CreateCategory(r.Context(), in, claims(r).Sub)
	if err != nil {
		return err
	}
	s.audit(r, "category.create", id, map[string]any{"name": in.Name, "slug": in.Slug, "status": in.Status})
	httpx.JSON(w, http.StatusCreated, map[string]string{"id": id, "slug": in.Slug})
	return nil
}

// PUT /v1/admin/categories/{id}
func (s *Server) updateCategory(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "taxonomy.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in store.CategoryInput
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := validCategory(&in); err != nil {
		return err
	}
	if in.ParentID != nil && *in.ParentID == id {
		return httpx.Validation(map[string]string{"parent_id": "Kategori tidak bisa menjadi induk dirinya sendiri."})
	}
	if err := s.Store.UpdateCategory(r.Context(), id, in); err != nil {
		return err
	}
	s.audit(r, "category.update", id, map[string]any{"name": in.Name, "slug": in.Slug, "status": in.Status})
	httpx.JSON(w, 200, map[string]string{"id": id, "slug": in.Slug})
	return nil
}

// DELETE /v1/admin/categories/{id}?move_to=&redirect=1
func (s *Server) deleteCategory(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "taxonomy.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	q := r.URL.Query()
	move := q.Get("move_to")
	if move != "" && !uuidRe.MatchString(move) {
		return httpx.Validation(map[string]string{"move_to": "Kategori tujuan tidak valid."})
	}
	n, err := s.Store.DeleteCategory(r.Context(), id, move, q.Get("redirect") == "1")
	if err != nil {
		return err
	}
	s.audit(r, "category.delete", id, map[string]any{"moved_articles": n, "move_to": move, "redirect": q.Get("redirect") == "1"})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// PATCH /v1/admin/categories/{id}/menu {in_menu}
func (s *Server) categoryMenu(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "taxonomy.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		InMenu bool `json:"in_menu"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := s.Store.SetCategoryMenu(r.Context(), id, in.InMenu); err != nil {
		return err
	}
	s.audit(r, "category.menu", id, map[string]any{"in_menu": in.InMenu})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// POST /v1/admin/categories/reorder {ids}
func (s *Server) reorderCategories(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "taxonomy.manage"); err != nil {
		return err
	}
	var in struct {
		IDs []string `json:"ids"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if len(in.IDs) == 0 || len(in.IDs) > 200 {
		return httpx.Validation(map[string]string{"ids": "Urutan kosong."})
	}
	for _, id := range in.IDs {
		if !uuidRe.MatchString(id) {
			return httpx.Validation(map[string]string{"ids": "Id kategori tidak valid."})
		}
	}
	if err := s.Store.ReorderCategories(r.Context(), in.IDs); err != nil {
		return err
	}
	s.audit(r, "category.reorder", "", map[string]any{"count": len(in.IDs)})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// GET /v1/categories/redirect/{slug} — URL kategori lama → slug baru (publik).
func (s *Server) categoryRedirect(w http.ResponseWriter, r *http.Request) error {
	to, err := s.Store.CategoryRedirect(r.Context(), r.PathValue("slug"))
	if err != nil {
		return err
	}
	if to == "" {
		return httpx.NotFound("Tidak ada pengalihan.")
	}
	cacheFor(w, 5*time.Minute)
	httpx.JSON(w, 200, map[string]string{"to": to})
	return nil
}

// ======================================================================= tag

func validTag(slug, name string) (string, string, error) {
	name = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(name), "#"))
	slug = strings.Trim(strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(slug), "#"))), "-")
	if slug == "" {
		slug = Slugify(name)
	}
	f := map[string]string{}
	if n := utf8.RuneCountInString(name); n < 2 || n > 40 {
		f["name"] = "Nama tag 2–40 karakter."
	}
	if !slugRe.MatchString(slug) || len(slug) > 40 {
		f["slug"] = "Slug hanya huruf kecil, angka, dan tanda minus."
	}
	if len(f) > 0 {
		return "", "", httpx.Validation(f)
	}
	return slug, name, nil
}

// POST /v1/admin/tags {name, slug}
func (s *Server) createTag(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "taxonomy.manage"); err != nil {
		return err
	}
	var in struct{ Name, Slug string }
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	slug, name, err := validTag(in.Slug, in.Name)
	if err != nil {
		return err
	}
	id, err := s.Store.CreateTag(r.Context(), slug, name)
	if err != nil {
		return err
	}
	s.audit(r, "tag.create", id, map[string]any{"slug": slug})
	httpx.JSON(w, http.StatusCreated, map[string]string{"id": id, "slug": slug})
	return nil
}

// PUT /v1/admin/tags/{id}
func (s *Server) updateTag(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "taxonomy.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct{ Name, Slug string }
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	slug, name, err := validTag(in.Slug, in.Name)
	if err != nil {
		return err
	}
	if err := s.Store.UpdateTag(r.Context(), id, slug, name); err != nil {
		return err
	}
	s.audit(r, "tag.update", id, map[string]any{"slug": slug})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// DELETE /v1/admin/tags/{id}
func (s *Server) deleteTag(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "taxonomy.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if err := s.Store.DeleteTag(r.Context(), id); err != nil {
		return err
	}
	s.audit(r, "tag.delete", id, nil)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// POST /v1/admin/tags/{id}/merge {into}
func (s *Server) mergeTag(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "taxonomy.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Into string `json:"into"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if !uuidRe.MatchString(in.Into) {
		return httpx.Validation(map[string]string{"into": "Pilih tag tujuan."})
	}
	if err := s.Store.MergeTags(r.Context(), id, in.Into); err != nil {
		return err
	}
	s.audit(r, "tag.merge", id, map[string]any{"into": in.Into})
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ======================================================================= komentar

// ModerationSettings adalah filter otomatis komentar.
type ModerationSettings struct {
	HoldLinks        bool `json:"hold_links"`
	DetectPump       bool `json:"detect_pump"`
	HideAfterReports bool `json:"hide_after_reports"`
	ReportThreshold  int  `json:"report_threshold"`
	HoldNewAccounts  bool `json:"hold_new_accounts"`
}

var defaultModeration = ModerationSettings{HoldLinks: true, DetectPump: true, HideAfterReports: true, ReportThreshold: 3, HoldNewAccounts: true}

func (s *Server) moderation(r *http.Request) ModerationSettings {
	m := defaultModeration
	if ok, err := s.Store.Setting(r.Context(), "moderation", &m); err != nil || !ok {
		return defaultModeration
	}
	if m.ReportThreshold < 1 {
		m.ReportThreshold = 3
	}
	return m
}

var linkRe = regexp.MustCompile(`(?i)(https?://|www\.|\b[a-z0-9-]+\.(com|id|co|net|org|io|xyz|me|link|ly)\b|t\.me/|wa\.me/)`)

// screenComment menentukan komentar baru langsung tampil atau masuk antrian moderasi.
func (s *Server) screenComment(r *http.Request, body string, accountAge time.Duration) (string, string) {
	m := s.moderation(r)
	lower := strings.ToLower(body)
	if m.DetectPump {
		if words, err := s.Store.ModerationWords(r.Context()); err == nil {
			for _, w := range words {
				if strings.Contains(lower, w) {
					return "pending", "Kata terfilter: “" + w + "”"
				}
			}
		}
	}
	if m.HoldLinks && linkRe.MatchString(body) {
		return "pending", "Filter: tautan"
	}
	if m.HoldNewAccounts && accountAge < 24*time.Hour {
		return "pending", "Akun baru (< 24 jam)"
	}
	return "visible", ""
}

// GET /v1/admin/comments?status=queue|visible|hidden|flagged|pending
func (s *Server) adminComments(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "comments.moderate"); err != nil {
		return err
	}
	st := r.URL.Query().Get("status")
	switch st {
	case "":
		st = "queue"
	case "queue", "visible", "hidden", "flagged", "pending":
	default:
		return httpx.BadRequest("Status tidak dikenal.")
	}
	list, err := s.Store.ModComments(r.Context(), st, limitParam(r, 50, 200))
	if err != nil {
		return err
	}
	counts, err := s.Store.ModerationCounts(r.Context())
	if err != nil {
		return err
	}
	words, err := s.Store.ModerationWords(r.Context())
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"data": list, "counts": counts, "settings": s.moderation(r), "words": words})
	return nil
}

// POST /v1/admin/comments/status {ids, status: visible|hidden}
func (s *Server) moderateComments(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "comments.moderate"); err != nil {
		return err
	}
	var in struct {
		IDs    []string `json:"ids"`
		Status string   `json:"status"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if in.Status != "visible" && in.Status != "hidden" {
		return httpx.Validation(map[string]string{"status": "Pilih setujui atau sembunyikan."})
	}
	if len(in.IDs) == 0 || len(in.IDs) > 200 {
		return httpx.Validation(map[string]string{"ids": "Pilih komentar."})
	}
	for _, id := range in.IDs {
		if !uuidRe.MatchString(id) {
			return httpx.Validation(map[string]string{"ids": "Id komentar tidak valid."})
		}
	}
	n, err := s.Store.SetCommentStatus(r.Context(), in.IDs, in.Status, claims(r).Sub)
	if err != nil {
		return err
	}
	action := "comment.approve"
	if in.Status == "hidden" {
		action = "comment.hide"
	}
	s.audit(r, action, strings.Join(in.IDs, ","), map[string]any{"count": n})
	httpx.JSON(w, 200, map[string]int{"updated": n})
	return nil
}

// PUT /v1/admin/moderation {settings}
func (s *Server) setModeration(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "comments.moderate"); err != nil {
		return err
	}
	var in ModerationSettings
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if in.ReportThreshold < 1 || in.ReportThreshold > 50 {
		in.ReportThreshold = 3
	}
	if err := s.Store.SetSetting(r.Context(), "moderation", in, claims(r).Sub); err != nil {
		return err
	}
	s.audit(r, "settings.moderation", "moderation", map[string]any{"settings": in})
	httpx.JSON(w, 200, in)
	return nil
}

// POST /v1/admin/moderation/words {word} · DELETE /v1/admin/moderation/words?word=
func (s *Server) addModWord(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "comments.moderate"); err != nil {
		return err
	}
	var in struct {
		Word string `json:"word"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	word := strings.ToLower(strings.TrimSpace(in.Word))
	if n := utf8.RuneCountInString(word); n < 2 || n > 60 {
		return httpx.Validation(map[string]string{"word": "Kata 2–60 karakter."})
	}
	if err := s.Store.AddModerationWord(r.Context(), word, claims(r).Sub); err != nil {
		return err
	}
	s.audit(r, "comment.word_add", word, nil)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) removeModWord(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "comments.moderate"); err != nil {
		return err
	}
	word := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("word")))
	if word == "" {
		return httpx.Validation(map[string]string{"word": "Kata kosong."})
	}
	if err := s.Store.RemoveModerationWord(r.Context(), word); err != nil {
		return err
	}
	s.audit(r, "comment.word_remove", word, nil)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// POST /v1/comments/{id}/report {reason} — laporan pembaca.
func (s *Server) reportComment(w http.ResponseWriter, r *http.Request) error {
	id := r.PathValue("id")
	if !uuidRe.MatchString(id) {
		return httpx.NotFound("Komentar tidak ditemukan.")
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	reason := strings.TrimSpace(in.Reason)
	if utf8.RuneCountInString(reason) > 200 {
		reason = string([]rune(reason)[:200])
	}
	m := s.moderation(r)
	th := 0
	if m.HideAfterReports {
		th = m.ReportThreshold
	}
	n, hidden, err := s.Store.ReportComment(r.Context(), id, uid(r), reason, th)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"reports": n, "hidden": hidden})
	return nil
}

// ======================================================================= media

var mediaKinds = map[string]bool{"photo": true, "chart": true, "illustration": true, "video": true}
var mediaLicenses = map[string]bool{"none": true, "owned": true, "licensed": true, "editorial": true, "cc": true}

// GET /v1/admin/media/library?filter=&q=
func (s *Server) mediaLibrary(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	f := q.Get("filter")
	if f != "" && f != "unlicensed" && f != "expiring" && !mediaKinds[f] {
		return httpx.BadRequest("Filter tidak dikenal.")
	}
	list, counts, err := s.Store.MediaList(r.Context(), f, strings.TrimSpace(q.Get("q")), limitParam(r, 60, 200))
	if err != nil {
		return err
	}
	base := publicBase(r)
	type item struct {
		store.MediaItem
		URL string `json:"url"`
	}
	out := make([]item, len(list))
	for i, m := range list {
		out[i] = item{m, base + "/v1/media/" + m.ID}
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"data": out, "counts": counts})
	return nil
}

// PATCH /v1/admin/media/{id}
func (s *Server) updateMedia(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "media.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in store.MediaMeta
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Title, in.Source, in.Alt = strings.TrimSpace(in.Title), strings.TrimSpace(in.Source), strings.TrimSpace(in.Alt)
	f := map[string]string{}
	if !mediaKinds[in.Kind] {
		f["kind"] = "Jenis media tidak dikenal."
	}
	if !mediaLicenses[in.License] {
		f["license"] = "Jenis lisensi tidak dikenal."
	}
	if utf8.RuneCountInString(in.Alt) > 125 {
		f["alt"] = "Teks alternatif maksimal 125 karakter."
	}
	if utf8.RuneCountInString(in.Title) > 120 {
		f["title"] = "Judul maksimal 120 karakter."
	}
	if utf8.RuneCountInString(in.Source) > 160 {
		f["source"] = "Sumber maksimal 160 karakter."
	}
	if in.LicenseUntil != nil {
		if v := strings.TrimSpace(*in.LicenseUntil); v == "" {
			in.LicenseUntil = nil
		} else if _, err := time.Parse("2006-01-02", v); err != nil {
			f["license_until"] = "Tanggal tidak valid."
		}
	}
	if in.License == "licensed" && in.Source == "" {
		f["source"] = "Isi sumber/pemegang hak untuk foto berlisensi."
	}
	if len(f) > 0 {
		return httpx.Validation(f)
	}
	if err := s.Store.UpdateMediaMeta(r.Context(), id, in); err != nil {
		return err
	}
	s.audit(r, "media.update", id, map[string]any{"license": in.License, "kind": in.Kind})
	m, err := s.Store.MediaItemByID(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, m)
	return nil
}

// DELETE /v1/admin/media/{id}
func (s *Server) deleteMedia(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "media.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if err := s.Store.DeleteMedia(r.Context(), id); err != nil {
		return err
	}
	s.audit(r, "media.delete", id, nil)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ======================================================================= log aktivitas

// GET /v1/admin/audit?group=&days=&before=
func (s *Server) auditLog(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "audit.read"); err != nil {
		return err
	}
	q := r.URL.Query()
	days, _ := strconv.Atoi(q.Get("days"))
	if days < 1 || days > 730 {
		days = 7
	}
	var ents []string
	if g := q.Get("group"); g != "" {
		e, ok := store.AuditGroups[g]
		if !ok {
			return httpx.BadRequest("Grup tidak dikenal.")
		}
		ents = e
	}
	before, _ := strconv.ParseInt(q.Get("before"), 10, 64)
	list, counts, err := s.Store.AuditLog(r.Context(), days, ents, before, limitParam(r, 50, 200))
	if err != nil {
		return err
	}
	groups := map[string]int{"all": 0}
	for e, n := range counts {
		groups["all"] += n
		for g, es := range store.AuditGroups {
			for _, x := range es {
				if x == e {
					groups[g] += n
				}
			}
		}
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"data": list, "groups": groups, "days": days})
	return nil
}
