package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// snapshot menyimpan versi artikel (best effort) setelah dibuat/diubah/berganti status.
func (s *Server) snapshot(r *http.Request, id, note string) {
	if err := s.Store.SnapshotArticle(context.WithoutCancel(r.Context()), id, claims(r).Sub, note); err != nil {
		s.Log.Warn("simpan versi artikel gagal", "id", id, "err", err)
	}
}

// ======================================================================= dashboard, laporan, cari, notifikasi staf

// GET /v1/admin/dashboard
func (s *Server) dashboard(w http.ResponseWriter, r *http.Request) error {
	d, err := s.Store.DashboardStats(r.Context())
	if err != nil {
		return err
	}
	review, err := s.Store.AdminArticles(r.Context(), store.AdminArticleFilter{Status: "review", Limit: 6})
	if err != nil {
		return err
	}
	for i := range review {
		review[i].Body = "" // ringkas
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"stats": d, "review": review, "quota_daily": 800})
	return nil
}

// GET /v1/admin/reports
func (s *Server) reports(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "revenue.read"); err != nil {
		return err
	}
	rep, err := s.Store.Reports(r.Context())
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, rep)
	return nil
}

// GET /v1/admin/search?q=
func (s *Server) adminSearch(w http.ResponseWriter, r *http.Request) error {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if utf8.RuneCountInString(q) > 80 {
		return httpx.BadRequest("Kata kunci terlalu panjang.")
	}
	hits, err := s.Store.AdminSearch(r.Context(), q)
	if err != nil {
		return err
	}
	// Pengguna & pendapatan hanya untuk peran yang berhak.
	out := hits[:0]
	for _, h := range hits {
		if h.Kind == "user" && !can(r, "users.read") {
			continue
		}
		out = append(out, h)
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"query": q, "data": out})
	return nil
}

// FeedItem notifikasi panel staf (diturunkan dari keadaan sistem, bukan disimpan).
type FeedItem struct {
	Kind   string    `json:"kind"` // content | market | ads | comments | users | system
	Title  string    `json:"title"`
	Body   string    `json:"body"`
	Action string    `json:"action,omitempty"`
	Href   string    `json:"href,omitempty"`
	Urgent bool      `json:"urgent"`
	At     time.Time `json:"at"`
}

// GET /v1/admin/feed
func (s *Server) adminFeed(w http.ResponseWriter, r *http.Request) error {
	d, err := s.Store.DashboardStats(r.Context())
	if err != nil {
		return err
	}
	now := s.Now()
	items := []FeedItem{}
	review, err := s.Store.AdminArticles(r.Context(), store.AdminArticleFilter{Status: "review", Limit: 10})
	if err != nil {
		return err
	}
	for _, a := range review {
		items = append(items, FeedItem{Kind: "content", Title: a.Title + " menunggu review", Body: a.AuthorName + " mengirim artikel " + a.CategoryName + ".", Action: "Review sekarang", Href: "/admin/tulis?id=" + a.ID, Urgent: true, At: a.UpdatedAt})
	}
	if d.ReportsPending > 0 {
		items = append(items, FeedItem{Kind: "comments", Title: fmt.Sprintf("%d komentar dilaporkan", d.ReportsPending), Body: "Laporan pembaca menunggu moderasi.", Action: "Buka moderasi", Href: "/admin/komentar?tab=reported", Urgent: true, At: now})
	}
	if d.CommentsPending > 0 {
		items = append(items, FeedItem{Kind: "comments", Title: fmt.Sprintf("%d komentar menunggu persetujuan", d.CommentsPending), Body: "Komentar ditahan filter moderasi.", Action: "Buka moderasi", Href: "/admin/komentar", At: now})
	}
	if d.CampaignsReview > 0 && can(r, "ads.manage") {
		items = append(items, FeedItem{Kind: "ads", Title: fmt.Sprintf("%d kampanye iklan menunggu verifikasi", d.CampaignsReview), Body: "Periksa dokumen & materi sebelum tayang.", Action: "Verifikasi", Href: "/admin/iklan", Urgent: true, At: now})
	}
	if d.MarketErrors > 0 {
		items = append(items, FeedItem{Kind: "market", Title: fmt.Sprintf("%d error penyedia data hari ini", d.MarketErrors), Body: fmt.Sprintf("%d panggilan · rata-rata latensi %.0f ms.", d.MarketCalls, d.MarketLatencyMS), Action: "Buka Data Pasar", Href: "/admin/pasar", At: now})
	}
	if d.MarketCalls >= 680 {
		items = append(items, FeedItem{Kind: "system", Title: "Kuota Twelve Data di atas 85%", Body: fmt.Sprintf("%d dari 800 kredit hari ini terpakai.", d.MarketCalls), Href: "/admin/pasar", Urgent: true, At: now})
	}
	if can(r, "audit.read") {
		log, _, err := s.Store.AuditLog(r.Context(), 2, nil, 0, 20)
		if err == nil {
			for _, e := range log {
				who := "Sistem"
				if e.ActorName != nil {
					who = *e.ActorName
				}
				items = append(items, FeedItem{Kind: feedKind(e.Entity), Title: who + " · " + e.Action, Body: auditSummary(e.Data), Href: "/admin/aktivitas", At: e.CreatedAt})
			}
		}
	}
	slices.SortStableFunc(items, func(a, b FeedItem) int { return b.At.Compare(a.At) })
	urgent := 0
	for _, it := range items {
		if it.Urgent {
			urgent++
		}
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"data": items, "urgent": urgent, "stats": d})
	return nil
}

func feedKind(entity string) string {
	switch entity {
	case "article", "category", "tag", "media":
		return "content"
	case "comment", "moderation":
		return "comments"
	case "campaign", "ads", "ad":
		return "ads"
	case "instrument", "market":
		return "market"
	case "user", "role", "rbac", "staff":
		return "users"
	}
	return "system"
}

func auditSummary(raw []byte) string {
	s := string(raw)
	for _, k := range []string{`"title":"`, `"name":"`, `"email":"`} {
		if i := strings.Index(s, k); i >= 0 {
			rest := s[i+len(k):]
			if j := strings.Index(rest, `"`); j > 0 {
				return rest[:j]
			}
		}
	}
	return ""
}

// ======================================================================= versi artikel

// GET /v1/admin/articles/{id}/versions
func (s *Server) articleVersions(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	cur, err := s.Store.AdminArticle(r.Context(), id)
	if err != nil {
		return err
	}
	if !canPublish(r) && !cur.OwnedBy(claims(r).Sub) {
		return httpx.NotFound("Artikel tidak ditemukan.")
	}
	l, err := s.Store.ArticleVersions(r.Context(), id)
	if err != nil {
		return err
	}
	cur.Body = ""
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"article": cur, "data": l})
	return nil
}

// POST /v1/admin/articles/{id}/versions/{vid}/restore
func (s *Server) restoreVersion(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	vid := r.PathValue("vid")
	if !uuidRe.MatchString(vid) {
		return httpx.NotFound("Versi tidak ditemukan.")
	}
	cur, err := s.Store.AdminArticle(r.Context(), id)
	if err != nil {
		return err
	}
	if !canPublish(r) && !cur.OwnedBy(claims(r).Sub) {
		return httpx.NotFound("Artikel tidak ditemukan.")
	}
	if cur.Status == "published" && !canPublish(r) && !can(r, "content.publish_own") {
		return httpx.Forbidden("Memulihkan artikel yang sudah terbit butuh izin terbit.")
	}
	v, err := s.Store.RestoreVersion(r.Context(), id, vid, claims(r).Sub)
	if err != nil {
		return err
	}
	s.audit(r, "article.restore", id, map[string]any{"title": cur.Title, "version": v})
	l, err := s.Store.ArticleVersions(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"restored": v, "data": l})
	return nil
}

// ======================================================================= breaking & live blog

// GET /v1/admin/live
func (s *Server) adminLive(w http.ResponseWriter, r *http.Request) error {
	br, err := s.Store.BreakingList(r.Context())
	if err != nil {
		return err
	}
	var live any
	if b, err := s.Store.CurrentLive(r.Context()); err == nil {
		live = b
	} else if !errors.Is(err, httpx.ErrNotFound) {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"breaking": br, "live": live, "can_breaking": can(r, "content.breaking")})
	return nil
}

// POST /v1/admin/breaking/{id} {hours} — 0 = akhiri, >0 = perpanjang.
func (s *Server) setBreaking(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "content.breaking"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Hours int `json:"hours"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if in.Hours < 0 || in.Hours > 24 {
		return httpx.Validation(map[string]string{"hours": "0–24 jam."})
	}
	if err := s.Store.SetBreaking(r.Context(), id, in.Hours); err != nil {
		return err
	}
	act := "breaking.end"
	if in.Hours > 0 {
		act = "breaking.extend"
	}
	s.audit(r, act, id, map[string]any{"hours": in.Hours})
	return s.adminLive(w, r)
}

// POST /v1/admin/live {title, summary, symbol, closes_at}
func (s *Server) startLive(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "content.breaking"); err != nil {
		return err
	}
	var in struct {
		Title    string     `json:"title"`
		Summary  string     `json:"summary"`
		Symbol   string     `json:"symbol"`
		ClosesAt *time.Time `json:"closes_at"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Title = strings.TrimSpace(in.Title)
	if n := utf8.RuneCountInString(in.Title); n < 4 || n > 200 {
		return httpx.Validation(map[string]string{"title": "Judul 4–200 karakter."})
	}
	in.Symbol = strings.ToUpper(strings.TrimSpace(in.Symbol))
	if in.Symbol != "" {
		if _, err := s.Store.InstrumentBySymbol(r.Context(), in.Symbol); err != nil {
			return httpx.Validation(map[string]string{"symbol": "Simbol tidak dikenal."})
		}
	}
	id, err := s.Store.StartLive(r.Context(), in.Title, strings.TrimSpace(in.Summary), in.Symbol, in.ClosesAt, claims(r).Sub)
	if err != nil {
		return err
	}
	s.audit(r, "live.start", id, map[string]any{"title": in.Title})
	return s.adminLive(w, r)
}

// POST /v1/admin/live/{id}/end
func (s *Server) endLive(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "content.breaking"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if err := s.Store.EndLive(r.Context(), id); err != nil {
		return err
	}
	s.audit(r, "live.end", id, nil)
	return s.adminLive(w, r)
}

var liveKinds = []string{"update", "breaking", "quote"}

// POST /v1/admin/live/{id}/posts {body, kind, symbol, pinned}
func (s *Server) addLivePost(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "content.write"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Body   string `json:"body"`
		Kind   string `json:"kind"`
		Symbol string `json:"symbol"`
		Pinned bool   `json:"pinned"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Body = strings.TrimSpace(in.Body)
	if n := utf8.RuneCountInString(in.Body); n < 1 || n > 2000 {
		return httpx.Validation(map[string]string{"body": "Isi pembaruan 1–2000 karakter."})
	}
	if in.Kind == "" {
		in.Kind = "update"
	}
	if !slices.Contains(liveKinds, in.Kind) {
		return httpx.Validation(map[string]string{"kind": "Jenis pembaruan tidak dikenal."})
	}
	if in.Kind == "breaking" && !can(r, "content.breaking") {
		return httpx.Forbidden("Pembaruan BREAKING butuh izin content.breaking.")
	}
	in.Symbol = strings.ToUpper(strings.TrimSpace(in.Symbol))
	if _, err := s.Store.AddLivePost(r.Context(), id, in.Body, in.Kind, in.Symbol, in.Pinned, claims(r).Sub); err != nil {
		return err
	}
	return s.adminLive(w, r)
}

// PATCH /v1/admin/live/posts/{id} {pinned}
func (s *Server) pinLivePost(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "content.write"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Pinned bool `json:"pinned"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := s.Store.PinLivePost(r.Context(), id, in.Pinned); err != nil {
		return err
	}
	return s.adminLive(w, r)
}

// DELETE /v1/admin/live/posts/{id}
func (s *Server) deleteLivePost(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "content.publish"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if err := s.Store.DeleteLivePost(r.Context(), id); err != nil {
		return err
	}
	s.audit(r, "live.delete_post", id, nil)
	return s.adminLive(w, r)
}

// GET /v1/live — live blog publik (aktif atau terakhir).
func (s *Server) publicLive(w http.ResponseWriter, r *http.Request) error {
	b, err := s.Store.CurrentLive(r.Context())
	if err != nil {
		return err
	}
	cacheFor(w, 15*time.Second)
	httpx.JSON(w, 200, b)
	return nil
}

// ======================================================================= Ocean Short

// GET /v1/shorts
func (s *Server) shorts(w http.ResponseWriter, r *http.Request) error {
	me := uid(r)
	l, err := s.Store.Shorts(r.Context(), false, limitParam(r, 20, 50), me)
	if err != nil {
		return err
	}
	if me == "" {
		cacheFor(w, time.Minute)
	} else {
		w.Header().Set("Cache-Control", "private, no-store")
	}
	httpx.JSON(w, 200, Page[store.Short]{Data: l})
	return nil
}

// POST|DELETE /v1/shorts/{id}/like dan /save — suka / simpan (perlu masuk).
func (s *Server) shortToggle(kind string) func(http.ResponseWriter, *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		id, err := pathID(r)
		if err != nil {
			return err
		}
		on := r.Method == http.MethodPost
		n, err := s.Store.ShortToggle(r.Context(), kind, id, uid(r), on)
		if err != nil {
			return err
		}
		w.Header().Set("Cache-Control", "no-store")
		if kind == "like" {
			httpx.JSON(w, 200, map[string]any{"liked": on, "likes": n})
		} else {
			httpx.JSON(w, 200, map[string]any{"saved": on, "saves": n})
		}
		return nil
	}
}

// POST /v1/shorts/{id}/share {channel} — hitung bagikan (publik).
func (s *Server) shortShare(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	n, err := s.Store.ShortShare(r.Context(), id)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"shares": n})
	return nil
}

// GET /v1/shorts/{id}/comments
func (s *Server) shortComments(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	l, err := s.Store.ShortComments(r.Context(), id, uid(r), limitParam(r, 30, 100))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, Page[store.ShortComment]{Data: l})
	return nil
}

// POST /v1/shorts/{id}/comments {body} — disaring otomatis seperti komentar artikel.
func (s *Server) addShortComment(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Body string `json:"body"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Body = strings.TrimSpace(in.Body)
	if n := utf8.RuneCountInString(in.Body); n < 1 || n > 1000 {
		return httpx.Validation(map[string]string{"body": "Komentar 1–1000 karakter."})
	}
	u, err := s.Store.UserByID(r.Context(), uid(r))
	if err != nil {
		return err
	}
	status, reason := s.screenComment(r, in.Body, s.Now().Sub(u.CreatedAt))
	if status != "visible" && status != "pending" && status != "flagged" && status != "hidden" {
		status = "visible"
	}
	c, err := s.Store.AddShortComment(r.Context(), id, uid(r), in.Body, status, reason)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, c)
	return nil
}

// DELETE /v1/shorts/{id}/comments/{cid} — pemilik atau moderator.
func (s *Server) deleteShortComment(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	cid := r.PathValue("cid")
	if !uuidRe.MatchString(cid) {
		return httpx.NotFound("Komentar tidak ditemukan.")
	}
	mod := claims(r).Role != "" && claims(r).Role != "reader" && acc(r).Has("comments.moderate")
	if err := s.Store.DeleteShortComment(r.Context(), id, cid, uid(r), mod); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// GET /v1/me/shorts/saved
func (s *Server) savedShorts(w http.ResponseWriter, r *http.Request) error {
	l, err := s.Store.SavedShorts(r.Context(), uid(r), limitParam(r, 50, 100))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, Page[store.Short]{Data: l})
	return nil
}

// GET /v1/admin/short-comments?status=
func (s *Server) adminShortComments(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "comments.moderate"); err != nil {
		return err
	}
	st := r.URL.Query().Get("status")
	if st != "" && !slices.Contains([]string{"visible", "hidden", "pending", "flagged"}, st) {
		st = ""
	}
	l, err := s.Store.AdminShortComments(r.Context(), st, limitParam(r, 50, 200))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, Page[store.ShortComment]{Data: l})
	return nil
}

// POST /v1/admin/short-comments/{id}/status {status}
func (s *Server) shortCommentStatus(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "comments.moderate"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Status string `json:"status"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if !slices.Contains([]string{"visible", "hidden"}, in.Status) {
		return httpx.Validation(map[string]string{"status": "Status tidak dikenal."})
	}
	if err := s.Store.SetShortCommentStatus(r.Context(), id, in.Status, claims(r).Sub); err != nil {
		return err
	}
	s.audit(r, "short_comment."+in.Status, id, nil)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// POST /v1/shorts/{id}/view
func (s *Server) shortView(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if err := s.Store.ShortView(r.Context(), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// GET /v1/admin/shorts
func (s *Server) adminShorts(w http.ResponseWriter, r *http.Request) error {
	l, err := s.Store.Shorts(r.Context(), true, 100, "")
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, Page[store.Short]{Data: l})
	return nil
}

// POST /v1/admin/shorts
func (s *Server) createShort(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "content.write"); err != nil {
		return err
	}
	var in store.Short
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Title = strings.TrimSpace(in.Title)
	errs := map[string]string{}
	if n := utf8.RuneCountInString(in.Title); n < 4 || n > 140 {
		errs["title"] = "Judul 4–140 karakter."
	}
	for k, v := range map[string]*string{"video_url": in.VideoURL, "cover_url": in.CoverURL} {
		if v != nil && *v != "" && !strings.HasPrefix(*v, "https://") && !strings.HasPrefix(*v, "/") {
			errs[k] = "Gunakan URL https atau media unggahan."
		}
	}
	if in.Status == "" {
		in.Status = "published"
	}
	if in.Status != "published" && in.Status != "draft" {
		errs["status"] = "Status tidak dikenal."
	}
	if in.Status == "published" && !canRelease(acc(r)) {
		in.Status = "draft"
	}
	if len(errs) > 0 {
		return httpx.Validation(errs)
	}
	id, err := s.Store.CreateShort(r.Context(), in, claims(r).Sub)
	if err != nil {
		return err
	}
	s.audit(r, "short.create", id, map[string]any{"title": in.Title})
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id, "status": in.Status})
	return nil
}

// POST /v1/admin/shorts/{id}/status {status}
func (s *Server) shortStatus(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "content.publish"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	var in struct {
		Status string `json:"status"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if !slices.Contains([]string{"draft", "published", "archived"}, in.Status) {
		return httpx.Validation(map[string]string{"status": "Status tidak dikenal."})
	}
	if err := s.Store.SetShortStatus(r.Context(), id, in.Status); err != nil {
		return err
	}
	s.audit(r, "short."+in.Status, id, nil)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ======================================================================= newsletter

var nlLists = []string{"daily", "crypto", "macro", "weekly", "breaking", "plus"}

// POST /v1/newsletter/subscribe {email, lists}
func (s *Server) nlSubscribe(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email  string   `json:"email"`
		Lists  []string `json:"lists"`
		Source string   `json:"source"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if a, err := mail.ParseAddress(in.Email); err != nil || a.Address != in.Email || len(in.Email) > 200 {
		return httpx.Validation(map[string]string{"email": "Masukkan email yang valid."})
	}
	if len(in.Lists) == 0 {
		in.Lists = []string{"daily"}
	}
	for _, l := range in.Lists {
		if !slices.Contains(nlLists, l) {
			return httpx.Validation(map[string]string{"lists": "Daftar tidak dikenal: " + l})
		}
		if l == "plus" && !hasPlan(r) {
			return httpx.Forbidden("Newsletter pelanggan khusus Ocean Pedia Plus.")
		}
	}
	src := "web"
	if in.Source == "app" {
		src = "app"
	}
	created, err := s.Store.Subscribe(r.Context(), in.Email, uid(r), in.Lists, src)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"subscribed": true, "new": created})
	return nil
}

// POST /v1/newsletter/unsubscribe {token} — atau pengguna masuk tanpa token.
func (s *Server) nlUnsubscribe(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Token string `json:"token"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	email := ""
	if in.Token == "" {
		if uid(r) == "" {
			return httpx.Unauthorized("Masuk atau gunakan tautan berhenti berlangganan di email.")
		}
		u, err := s.Store.UserByID(r.Context(), uid(r))
		if err != nil {
			return err
		}
		email = u.Email
	}
	if err := s.Store.Unsubscribe(r.Context(), in.Token, email); err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"subscribed": false})
	return nil
}

// GET /v1/newsletter/unsubscribe?token= — tautan satu klik di email.
func (s *Server) nlUnsubscribeLink(w http.ResponseWriter, r *http.Request) error {
	tok := r.URL.Query().Get("token")
	status := "ok"
	if len(tok) != 32 || s.Store.Unsubscribe(r.Context(), tok, "") != nil {
		status = "invalid"
	}
	http.Redirect(w, r, s.Cfg.SiteURL+"/newsletter?berhenti="+status, http.StatusFound)
	return nil
}

// GET /v1/admin/newsletter?q=
func (s *Server) adminNewsletter(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "content.publish"); err != nil {
		return err
	}
	st, subs, err := s.Store.NewsletterOverview(r.Context(), strings.TrimSpace(r.URL.Query().Get("q")), limitParam(r, 50, 200))
	if err != nil {
		return err
	}
	issues, err := s.Store.Issues(r.Context())
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"stats": st, "subscribers": subs, "issues": issues, "mail_ready": s.Mail != nil})
	return nil
}

// POST /v1/admin/newsletter/issues {list, subject, intro, article_ids, send}
func (s *Server) createIssue(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "content.publish"); err != nil {
		return err
	}
	var in struct {
		List       string   `json:"list"`
		Subject    string   `json:"subject"`
		Intro      string   `json:"intro"`
		ArticleIDs []string `json:"article_ids"`
		Send       bool     `json:"send"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if in.List == "" {
		in.List = "daily"
	}
	errs := map[string]string{}
	if !slices.Contains(nlLists, in.List) {
		errs["list"] = "Daftar tidak dikenal."
	}
	in.Subject = strings.TrimSpace(in.Subject)
	if n := utf8.RuneCountInString(in.Subject); n < 4 || n > 200 {
		errs["subject"] = "Subjek 4–200 karakter."
	}
	if len(in.ArticleIDs) > 12 {
		errs["article_ids"] = "Maksimal 12 artikel."
	}
	for _, id := range in.ArticleIDs {
		if !uuidRe.MatchString(id) {
			errs["article_ids"] = "Id artikel tidak valid."
		}
	}
	if len(errs) > 0 {
		return httpx.Validation(errs)
	}
	id, err := s.Store.CreateIssue(r.Context(), in.List, in.Subject, strings.TrimSpace(in.Intro), in.ArticleIDs, claims(r).Sub)
	if err != nil {
		return err
	}
	s.audit(r, "newsletter.create", id, map[string]any{"title": in.Subject})
	if in.Send {
		return s.sendIssueID(w, r, id)
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id, "status": "draft"})
	return nil
}

// POST /v1/admin/newsletter/issues/{id}/send
func (s *Server) sendIssue(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "content.publish"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	return s.sendIssueID(w, r, id)
}

func (s *Server) sendIssueID(w http.ResponseWriter, r *http.Request, id string) error {
	is, err := s.Store.Issue(r.Context(), id)
	if err != nil {
		return err
	}
	if is.Status == "sent" {
		return httpx.Conflict("Edisi ini sudah terkirim.")
	}
	if s.Mail == nil {
		return &httpx.Problem{Type: "about:blank", Status: http.StatusServiceUnavailable, Title: "Email belum dikonfigurasi", Detail: "Layanan email transaksional belum aktif."}
	}
	links, err := s.Store.ArticleLinks(r.Context(), is.ArticleIDs)
	if err != nil {
		return err
	}
	rcpt, err := s.Store.IssueRecipients(r.Context(), is.List)
	if err != nil {
		return err
	}
	var txt, html strings.Builder
	txt.WriteString(is.Intro + "\n\n")
	html.WriteString(`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0B0B0F"><h2 style="color:#2F74EB">` + htmlEsc(is.Subject) + `</h2><p>` + htmlEsc(is.Intro) + `</p>`)
	for _, a := range links {
		u := s.Cfg.SiteURL + "/berita/" + a[0]
		fmt.Fprintf(&txt, "• %s\n  %s\n  %s\n\n", a[1], a[2], u)
		html.WriteString(`<div style="padding:14px 0;border-top:1px solid #E3EAF4"><a href="` + u + `" style="font-size:16px;font-weight:bold;color:#0B0B0F;text-decoration:none">` + htmlEsc(a[1]) + `</a><p style="margin:6px 0 0;color:#5F6B7D;font-size:14px">` + htmlEsc(a[2]) + `</p></div>`)
	}
	sent, failed := 0, 0
	for _, rc := range rcpt {
		unsub := s.Cfg.APIPublicURL + "/v1/newsletter/unsubscribe?token=" + rc[1]
		t := txt.String() + "Berhenti berlangganan: " + unsub + "\n"
		h := html.String() + `<p style="font-size:12px;color:#9AA6B8;border-top:1px solid #E3EAF4;padding-top:12px">Kamu menerima email ini karena berlangganan newsletter OceanBird. <a href="` + unsub + `">Berhenti berlangganan</a></p></div>`
		if err := s.Mail.SendMessage(r.Context(), rc[0], is.Subject, t, h); err != nil {
			failed++
			if failed >= 5 && sent == 0 {
				break // layanan email bermasalah: hentikan lebih awal
			}
			continue
		}
		sent++
	}
	if sent == 0 && len(rcpt) > 0 {
		return &httpx.Problem{Type: "about:blank", Status: http.StatusBadGateway, Title: "Newsletter gagal dikirim", Detail: "Layanan email menolak pengiriman. Periksa domain pengirim."}
	}
	if err := s.Store.MarkIssueSent(r.Context(), id, sent, failed); err != nil {
		return err
	}
	s.audit(r, "newsletter.send", id, map[string]any{"title": is.Subject, "sent": sent, "failed": failed})
	httpx.JSON(w, 200, map[string]any{"id": id, "status": "sent", "recipients": sent, "failed": failed})
	return nil
}

// GET /v1/admin/settings — status integrasi (tanpa membuka nilai rahasia).
func (s *Server) adminSettings(w http.ResponseWriter, r *http.Request) error {
	c := s.Cfg
	set := func(v string) bool { return v != "" }
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{
		"env":      c.Env,
		"site_url": c.SiteURL,
		"api_url":  c.APIPublicURL,
		"tax_rate": c.TaxRate,
		"integrations": []map[string]any{
			{"key": "midtrans", "name": "Midtrans (pembayaran)", "ok": s.Pay.Enabled(), "detail": map[bool]string{true: "Produksi", false: "Sandbox"}[c.MidtransProduction], "notify_url": c.APIPublicURL + "/v1/billing/midtrans/notify"},
			{"key": "twelvedata", "name": "Twelve Data (harga pasar)", "ok": set(c.TwelveDataKey), "detail": fmt.Sprintf("Cache harga %s · lewati %s", c.QuoteTTL, strings.Join(c.MarketSkip, ", "))},
			{"key": "gemini", "name": "Gemini (analisis AI)", "ok": set(c.GeminiKey), "detail": strings.Join(c.GeminiModels, ", ")},
			{"key": "email", "name": "Email transaksional (Bird)", "ok": s.Mail != nil, "detail": c.OTPEmailFrom},
			{"key": "otp", "name": "OTP / verifikasi (Bird)", "ok": set(c.BirdKey), "detail": ""},
		},
		"can_manage": can(r, "rbac.manage"),
	})
	return nil
}
