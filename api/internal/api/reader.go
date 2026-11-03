package api

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// ======================================================================= notifikasi

var notifKinds = map[string]bool{"": true, "breaking": true, "price_alert": true, "topic": true, "account": true, "billing": true}

// GET /v1/me/notifications?kind=
func (s *Server) notifications(w http.ResponseWriter, r *http.Request) error {
	kind := r.URL.Query().Get("kind")
	if kind == "all" {
		kind = ""
	}
	if !notifKinds[kind] {
		return httpx.BadRequest("Jenis notifikasi tidak dikenal.")
	}
	list, counts, unread, err := s.Store.Notifications(r.Context(), uid(r), kind, limitParam(r, 50, 200))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"data": list, "counts": counts, "unread": unread})
	return nil
}

// POST /v1/me/notifications/read {ids?}
func (s *Server) readNotifications(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		IDs []string `json:"ids"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	for _, id := range in.IDs {
		if !uuidRe.MatchString(id) {
			return httpx.Validation(map[string]string{"ids": "Id notifikasi tidak valid."})
		}
	}
	if err := s.Store.MarkNotificationsRead(r.Context(), uid(r), in.IDs); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// notifyPublished mengirim notifikasi artikel yang baru terbit (sekali per artikel, best effort).
func (s *Server) notifyPublished(ctx context.Context, articleID, status string, publishedAt *time.Time) {
	if status != "published" || publishedAt == nil || publishedAt.After(s.Now()) {
		return
	}
	if n, err := s.Store.NotifyArticle(ctx, articleID); err != nil {
		s.Log.Warn("notifikasi artikel gagal", "id", articleID, "err", err)
	} else if n > 0 {
		s.Log.Info("notifikasi artikel terkirim", "id", articleID, "penerima", n)
	}
}

// ======================================================================= price alert

// Evaluasi price alert memakai harga yang baru saja diambil (cache bersama), paling sering sekali
// per menit per simbol per instance — tanpa panggilan kuota tambahan ke penyedia data.
var alertSeen sync.Map // simbol → time.Time

func (s *Server) evaluateAlerts(ctx context.Context, items []QuoteItem) {
	now := s.Now()
	syms := []string{}
	quotes := map[string]QuoteItem{}
	for _, it := range items {
		if it.Quote == nil {
			continue
		}
		if t, ok := alertSeen.Load(it.Instrument.Symbol); ok && now.Sub(t.(time.Time)) < time.Minute {
			continue
		}
		alertSeen.Store(it.Instrument.Symbol, now)
		syms = append(syms, it.Instrument.Symbol)
		quotes[it.Instrument.Symbol] = it
	}
	if len(syms) == 0 {
		return
	}
	jobs, err := s.Store.ActiveAlerts(ctx, syms)
	if err != nil {
		s.Log.Warn("baca price alert gagal", "err", err)
		return
	}
	wib := time.FixedZone("WIB", 7*3600)
	for _, a := range jobs {
		it := quotes[a.Symbol]
		q := it.Quote
		hit := alertHit(a.Condition, a.Threshold, q.Price, q.ChangePercent)
		wasHit := a.LastPrice != nil && alertHit(a.Condition, a.Threshold, *a.LastPrice, q.ChangePercent)
		fire := hit
		switch a.Frequency {
		case "every_time":
			fire = hit && !wasHit // hanya saat menembus
		case "daily":
			fire = hit && (a.TriggeredAt == nil || a.TriggeredAt.In(wib).Format("2006-01-02") != now.In(wib).Format("2006-01-02"))
		}
		if err := s.Store.AlertSeen(ctx, a.ID, q.Price, fire); err != nil {
			s.Log.Warn("simpan price alert gagal", "err", err)
			continue
		}
		if !fire {
			continue
		}
		title, body := alertText(a, it, now.In(wib))
		price, chg := q.Price, q.ChangePercent
		if err := s.Store.Notify(ctx, a.UserID, store.NotifyInput{Kind: "price_alert", Title: title, Body: body, Link: "/market/" + a.Symbol, Symbol: a.Symbol, Price: &price, Change: &chg}); err != nil {
			s.Log.Warn("notifikasi price alert gagal", "err", err)
		}
		if s.Mail != nil && contains(a.Channels, "email") {
			text := body + "\n\nLihat grafik: " + s.Cfg.SiteURL + "/market/" + a.Symbol + "\n\nOceanBird — Berita & data pasar\n"
			if err := s.Mail.SendMessage(ctx, a.Email, title, text, "<p>"+htmlEsc(body)+`</p><p><a href="`+s.Cfg.SiteURL+"/market/"+a.Symbol+`">Lihat grafik</a></p>`); err != nil {
				s.Log.Warn("email price alert gagal", "err", err)
			}
		}
	}
}

func alertHit(cond string, threshold, price, changePct float64) bool {
	switch cond {
	case "price_above":
		return price >= threshold
	case "price_below":
		return price <= threshold
	case "change_pct":
		return math.Abs(changePct) >= math.Abs(threshold)
	}
	return false
}

func alertText(a store.AlertJob, it QuoteItem, at time.Time) (string, string) {
	q := it.Quote
	name := it.Instrument.Symbol
	p := fmtNum(q.Price)
	switch a.Condition {
	case "price_above":
		return fmt.Sprintf("Price alert: %s tembus %s", name, fmtNum(a.Threshold)), fmt.Sprintf("Harga %s %s, di atas target %s pukul %s WIB.", name, p, fmtNum(a.Threshold), at.Format("15:04"))
	case "price_below":
		return fmt.Sprintf("Price alert: %s turun ke %s", name, fmtNum(a.Threshold)), fmt.Sprintf("Harga %s %s, di bawah target %s pukul %s WIB.", name, p, fmtNum(a.Threshold), at.Format("15:04"))
	}
	return fmt.Sprintf("Price alert: %s bergerak %+.2f%%", name, q.ChangePercent), fmt.Sprintf("%s bergerak %+.2f%% hari ini (harga %s) pukul %s WIB.", name, q.ChangePercent, p, at.Format("15:04"))
}

// fmtNum: 67412.5 → "67.412,50"; 10125 → "10.125".
func fmtNum(v float64) string {
	dec := 2
	if v >= 1000 && v == math.Trunc(v) {
		dec = 0
	}
	s := fmt.Sprintf("%.*f", dec, math.Abs(v))
	intPart, frac, _ := strings.Cut(s, ".")
	var b strings.Builder
	for i, c := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(c)
	}
	out := b.String()
	if frac != "" {
		out += "," + frac
	}
	if v < 0 {
		out = "−" + out
	}
	return out
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func htmlEsc(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;").Replace(s)
}

// ======================================================================= iklan

// POST /v1/ads/{id}/impression — dipanggil saat materi iklan tampil di layar.
func (s *Server) adImpression(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if err := s.Store.AdImpression(r.Context(), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// GET /v1/ads/{id}/click — catat klik lalu alihkan ke URL pengiklan.
func (s *Server) adClick(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r)
	if err != nil {
		return err
	}
	to, err := s.Store.AdClick(r.Context(), id)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(to, "https://") {
		to = s.Cfg.SiteURL
	}
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, to, http.StatusFound)
	return nil
}

// ======================================================================= pengingat kalender

// GET /v1/me/reminders
func (s *Server) reminders(w http.ResponseWriter, r *http.Request) error {
	l, err := s.Store.Reminders(r.Context(), uid(r))
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"data": l})
	return nil
}

// PUT/DELETE /v1/me/reminders/{id}
func (s *Server) setReminder(on bool) func(http.ResponseWriter, *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		id, err := pathID(r)
		if err != nil {
			return err
		}
		if err := s.Store.SetReminder(r.Context(), uid(r), id, on); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
}

var remindersAt sync.Map

// dispatchReminders: paling sering sekali per menit per instance.
func (s *Server) dispatchReminders(ctx context.Context) {
	now := s.Now()
	if t, ok := remindersAt.Load("x"); ok && now.Sub(t.(time.Time)) < time.Minute {
		return
	}
	remindersAt.Store("x", now)
	if n, err := s.Store.DispatchReminders(ctx); err != nil {
		s.Log.Warn("pengingat kalender gagal", "err", err)
	} else if n > 0 {
		s.Log.Info("pengingat kalender terkirim", "n", n)
	}
}

// ======================================================================= topik

// GET /v1/topics/{slug} — info topik + artikel terbaru (status ikuti bila masuk).
func (s *Server) topic(w http.ResponseWriter, r *http.Request) error {
	t, err := s.Store.TopicBySlug(r.Context(), r.PathValue("slug"), uid(r))
	if err != nil {
		return err
	}
	l, err := s.Store.Articles(r.Context(), store.ArticleFilter{Tag: t.Slug, Limit: limitParam(r, 20, 50)})
	if err != nil {
		return err
	}
	if uid(r) != "" {
		w.Header().Set("Cache-Control", "private, no-store")
	} else {
		cacheFor(w, 2*time.Minute)
	}
	httpx.JSON(w, 200, map[string]any{"topic": t, "articles": l})
	return nil
}
