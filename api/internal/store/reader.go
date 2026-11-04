package store

import (
	"context"
	"database/sql"
	"errors"

	"encoding/json"
	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"time"
)

// ======================================================================= notifikasi

// Notification adalah notifikasi dalam aplikasi untuk pembaca.
type Notification struct {
	ID        string     `json:"id"`
	Kind      string     `json:"kind"` // breaking | price_alert | topic | account | reply | billing
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Link      string     `json:"link"`
	Symbol    string     `json:"symbol,omitempty"`
	Price     *float64   `json:"price,omitempty"`
	Change    *float64   `json:"change,omitempty"`
	ReadAt    *time.Time `json:"read_at"`
	CreatedAt time.Time  `json:"created_at"`
}

// NotifyInput adalah isi notifikasi baru.
type NotifyInput struct {
	Kind   string   `json:"kind"`
	Title  string   `json:"title"`
	Body   string   `json:"body"`
	Link   string   `json:"link,omitempty"`
	Symbol string   `json:"symbol,omitempty"`
	Price  *float64 `json:"price,omitempty"`
	Change *float64 `json:"change,omitempty"`
}

// template lama "moderation_warning" (peringatan moderator) dipetakan ke jenis "account".
const qNotifications = `SELECT n.id, CASE WHEN n.template = 'moderation_warning' THEN 'account' ELSE n.template END,
  coalesce(n.payload->>'title', ''), coalesce(n.payload->>'body', ''), coalesce(n.payload->>'link', ''), coalesce(n.payload->>'symbol', ''),
  (n.payload->>'price')::float8, (n.payload->>'change')::float8, n.read_at, n.created_at
FROM notifications n
WHERE n.user_id = $1::uuid AND n.channel = 'in_app'
  AND ($2::text = '' OR n.template = $2::text OR ($2::text = 'account' AND n.template = 'moderation_warning'))
ORDER BY n.created_at DESC LIMIT $3`
const qNotifCounts = `SELECT CASE WHEN template = 'moderation_warning' THEN 'account' ELSE template END, count(*)::int, count(*) FILTER (WHERE read_at IS NULL)::int
FROM notifications WHERE user_id = $1::uuid AND channel = 'in_app' GROUP BY 1`

// Notifications mengembalikan notifikasi pengguna (terbaru dulu), jumlah per jenis & belum dibaca.
func (p *PG) Notifications(ctx context.Context, uid, kind string, limit int) ([]Notification, map[string]int, int, error) {
	rows, err := p.DB.QueryContext(ctx, qNotifications, uid, kind, limit)
	if err != nil {
		return nil, nil, 0, err
	}
	out := []Notification{}
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.Kind, &n.Title, &n.Body, &n.Link, &n.Symbol, &n.Price, &n.Change, &n.ReadAt, &n.CreatedAt); err != nil {
			rows.Close()
			return nil, nil, 0, err
		}
		out = append(out, n)
	}
	rows.Close()
	counts := map[string]int{}
	unread := 0
	cr, err := p.DB.QueryContext(ctx, qNotifCounts, uid)
	if err != nil {
		return nil, nil, 0, err
	}
	defer cr.Close()
	for cr.Next() {
		var k string
		var n, u int
		if err := cr.Scan(&k, &n, &u); err != nil {
			return nil, nil, 0, err
		}
		counts[k] = n
		unread += u
	}
	return out, counts, unread, cr.Err()
}

const qReadNotifs = `UPDATE notifications SET read_at = now() WHERE user_id = $1::uuid AND read_at IS NULL AND (cardinality($2::uuid[]) = 0 OR id = ANY($2::uuid[]))`

// MarkNotificationsRead menandai notifikasi dibaca (ids kosong = semua).
func (p *PG) MarkNotificationsRead(ctx context.Context, uid string, ids []string) error {
	_, err := p.DB.ExecContext(ctx, qReadNotifs, uid, pgTextArray(ids))
	return err
}

const qNotify = `INSERT INTO notifications (user_id, channel, template, payload, status, sent_at) VALUES ($1::uuid, 'in_app', $2::text, $3::jsonb, 'sent', now())`

// Notify membuat satu notifikasi dalam aplikasi.
func (p *PG) Notify(ctx context.Context, uid string, n NotifyInput) error {
	b, _ := json.Marshal(n)
	_, err := p.DB.ExecContext(ctx, qNotify, uid, n.Kind, string(b))
	return err
}

// Penerima notifikasi artikel: pengikut tag artikel; breaking juga ke semua pembaca yang tidak mematikan notifikasi breaking.
// Hanya sekali per artikel (article_notified).
const qNotifyArticle = `
WITH first AS (
  INSERT INTO article_notified (article_id) VALUES ($1::uuid) ON CONFLICT DO NOTHING RETURNING article_id
), art AS (
  SELECT a.id, a.slug, a.title, a.excerpt, a.is_breaking FROM articles a JOIN first f ON f.article_id = a.id
  WHERE a.status = 'published' AND a.published_at <= now()
), topic AS (
  SELECT DISTINCT ON (x.user_id) x.user_id, x.tag FROM (
    SELECT ut.user_id, 'Topik ' || t.name AS tag
    FROM art JOIN article_tags at ON at.article_id = art.id JOIN user_topics ut ON ut.tag_id = at.tag_id JOIN tags t ON t.id = at.tag_id
    UNION ALL
    SELECT ua.user_id, 'Penulis ' || au.name FROM art JOIN articles a2 ON a2.id = art.id JOIN user_authors ua ON ua.author_id = a2.author_id JOIN authors au ON au.id = a2.author_id
    UNION ALL
    SELECT uc.user_id, 'Kategori ' || c.name FROM art JOIN articles a3 ON a3.id = art.id JOIN user_categories uc ON uc.category_id = a3.category_id JOIN categories c ON c.id = a3.category_id
  ) x JOIN users ux ON ux.id = x.user_id
  WHERE ux.deleted_at IS NULL AND coalesce((ux.preferences->>'topics_notif')::boolean, true)
  ORDER BY x.user_id
), breaking AS (
  SELECT u.id AS user_id FROM users u, art
  WHERE art.is_breaking AND u.deleted_at IS NULL AND coalesce((u.preferences->>'breaking')::boolean, true)
), rcpt AS (
  SELECT user_id, NULL::text AS tag FROM breaking
  UNION ALL SELECT user_id, tag FROM topic WHERE user_id NOT IN (SELECT user_id FROM breaking)
), ins AS (
  INSERT INTO notifications (user_id, channel, template, payload, status, sent_at)
  SELECT r.user_id, 'in_app', CASE WHEN r.tag IS NULL THEN 'breaking' ELSE 'topic' END,
    jsonb_build_object('title', CASE WHEN r.tag IS NULL THEN 'BREAKING: ' || art.title ELSE r.tag || ': artikel baru' END,
      'body', CASE WHEN r.tag IS NULL THEN art.excerpt ELSE art.title END, 'link', '/berita/' || art.slug),
    'sent', now()
  FROM rcpt r, art
  RETURNING 1
)
UPDATE article_notified SET recipients = (SELECT count(*) FROM ins) WHERE article_id IN (SELECT article_id FROM first) RETURNING recipients`

// NotifyArticle mengirim notifikasi artikel terbit (sekali per artikel). Mengembalikan jumlah penerima.
func (p *PG) NotifyArticle(ctx context.Context, articleID string) (int, error) {
	var n int
	err := p.DB.QueryRowContext(ctx, qNotifyArticle, articleID).Scan(&n)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil // sudah pernah dikirim
	}
	return n, err
}

// ======================================================================= price alert

// AlertJob adalah alert aktif untuk dievaluasi.
type AlertJob struct {
	ID          string
	UserID      string
	Email       string
	Symbol      string
	Condition   string
	Threshold   float64
	Frequency   string
	Channels    []string
	LastPrice   *float64
	TriggeredAt *time.Time
	// Preferensi pengguna: notifikasi price alert (bawaan aktif) & jam tenang ("off" | "21-06" | ...).
	NotifyOn   bool
	QuietHours string
}

const qAlertJobs = `SELECT a.id, a.user_id, u.email, a.symbol, a.condition, a.threshold::float8, a.frequency, array_to_json(a.channels)::text,
  a.last_price::float8, a.triggered_at,
  coalesce((u.preferences->>'price_alert')::boolean, true), coalesce(u.preferences->>'quiet_hours', 'off')
FROM price_alerts a JOIN users u ON u.id = a.user_id
WHERE a.active AND a.threshold IS NOT NULL AND a.symbol = ANY($1::text[]) AND u.deleted_at IS NULL
  AND a.condition IN ('price_above', 'price_below', 'change_pct') AND (a.expires_at IS NULL OR a.expires_at > now())`

// ActiveAlerts mengembalikan alert aktif untuk simbol tertentu.
func (p *PG) ActiveAlerts(ctx context.Context, symbols []string) ([]AlertJob, error) {
	rows, err := p.DB.QueryContext(ctx, qAlertJobs, pgTextArray(symbols))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AlertJob{}
	for rows.Next() {
		var a AlertJob
		if err := rows.Scan(&a.ID, &a.UserID, &a.Email, &a.Symbol, &a.Condition, &a.Threshold, &a.Frequency, jsonArr{&a.Channels}, &a.LastPrice, &a.TriggeredAt, &a.NotifyOn, &a.QuietHours); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

const qAlertSeen = `UPDATE price_alerts SET last_price = $2 WHERE id = $1::uuid`
const qAlertFired = `UPDATE price_alerts SET last_price = $2, triggered_at = now(), active = CASE WHEN frequency = 'once' THEN false ELSE active END WHERE id = $1::uuid`

// AlertSeen menyimpan harga terakhir yang dievaluasi; fired = alert terpicu.
func (p *PG) AlertSeen(ctx context.Context, id string, price float64, fired bool) error {
	q := qAlertSeen
	if fired {
		q = qAlertFired
	}
	_, err := p.DB.ExecContext(ctx, q, id, price)
	return err
}

// ======================================================================= iklan

const qAdImpression = `UPDATE ad_campaigns SET impressions = impressions + 1 WHERE id = $1::uuid AND status = 'live'`
const qAdClick = `UPDATE ad_campaigns SET clicks = clicks + 1 WHERE id = $1::uuid RETURNING coalesce(target_url, '')`

// AdImpression menambah impresi kampanye tayang.
func (p *PG) AdImpression(ctx context.Context, id string) error {
	_, err := p.DB.ExecContext(ctx, qAdImpression, id)
	return err
}

// AdClick menambah klik dan mengembalikan URL tujuan.
func (p *PG) AdClick(ctx context.Context, id string) (string, error) {
	var u string
	err := p.DB.QueryRowContext(ctx, qAdClick, id).Scan(&u)
	return u, notFound(err)
}

// ======================================================================= pengingat kalender

const qReminders = `SELECT event_id::text FROM event_reminders r JOIN economic_events e ON e.id = r.event_id
WHERE r.user_id = $1::uuid AND e.scheduled_at > now() - interval '7 days'`
const qRemindOn = `INSERT INTO event_reminders (user_id, event_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`
const qRemindOff = `DELETE FROM event_reminders WHERE user_id = $1::uuid AND event_id = $2::uuid`

// Reminders mengembalikan id event yang diingatkan pengguna (7 hari terakhir ke depan).
func (p *PG) Reminders(ctx context.Context, uid string) ([]string, error) {
	rows, err := p.DB.QueryContext(ctx, qReminders, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// SetReminder menyalakan/mematikan pengingat event.
func (p *PG) SetReminder(ctx context.Context, uid, eventID string, on bool) error {
	q := qRemindOff
	if on {
		q = qRemindOn
	}
	_, err := p.DB.ExecContext(ctx, q, uid, eventID)
	if pgCode(err, "23503") {
		return httpx.ErrNotFound
	}
	return err
}

// Kirim pengingat yang jatuh tempo (rilis dalam 15 menit) — atomik, sekali per pengguna/event.
const qDueReminders = `
WITH due AS (
  UPDATE event_reminders r SET notified_at = now()
  FROM economic_events e
  WHERE e.id = r.event_id AND r.notified_at IS NULL AND e.scheduled_at BETWEEN now() - interval '5 minutes' AND now() + interval '15 minutes'
  RETURNING r.user_id, e.title, e.country, e.scheduled_at, e.forecast
)
INSERT INTO notifications (user_id, channel, template, payload, status, sent_at)
SELECT user_id, 'in_app', 'topic',
  jsonb_build_object('title', 'Segera rilis: ' || title, 'body', 'Rilis ' || country || ' pukul ' || to_char(scheduled_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') || ' WIB' || coalesce(' · perkiraan ' || forecast, ''), 'link', '/kalender'),
  'sent', now()
FROM due RETURNING 1`

// Rilis data berdampak tinggi (preferensi "high_impact", bawaan aktif): sekali per event, 15 menit sebelum
// rilis, kecuali pengguna sudah memasang pengingat untuk event itu.
const qDueHighImpact = `
WITH ev AS (
  UPDATE economic_events e SET high_notified_at = now()
  WHERE e.high_notified_at IS NULL AND e.impact = 'high' AND e.scheduled_at BETWEEN now() - interval '5 minutes' AND now() + interval '15 minutes'
  RETURNING e.id, e.title, e.country, e.scheduled_at, e.forecast
)
INSERT INTO notifications (user_id, channel, template, payload, status, sent_at)
SELECT u.id, 'in_app', 'topic',
  jsonb_build_object('title', 'Data berdampak tinggi: ' || ev.title, 'body', 'Rilis ' || ev.country || ' pukul ' || to_char(ev.scheduled_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') || ' WIB' || coalesce(' · perkiraan ' || ev.forecast, ''), 'link', '/kalender'),
  'sent', now()
FROM ev CROSS JOIN users u
WHERE u.deleted_at IS NULL AND coalesce((u.preferences->>'high_impact')::boolean, true)
  AND NOT EXISTS (SELECT 1 FROM event_reminders r WHERE r.user_id = u.id AND r.event_id = ev.id)
RETURNING 1`

// DispatchReminders mengirim pengingat kalender yang jatuh tempo dan notifikasi rilis berdampak tinggi;
// mengembalikan jumlah notifikasi.
func (p *PG) DispatchReminders(ctx context.Context) (int, error) {
	n := 0
	for _, q := range []string{qDueReminders, qDueHighImpact} {
		rows, err := p.DB.QueryContext(ctx, q)
		if err != nil {
			return n, err
		}
		for rows.Next() {
			n++
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return n, err
		}
	}
	return n, nil
}

// ======================================================================= topik (tag)

// Topic: ringkasan halaman topik publik.
type Topic struct {
	Slug      string   `json:"slug"`
	Name      string   `json:"name"`
	Articles  int      `json:"article_count"`
	Followers int      `json:"followers"`
	Following bool     `json:"following"`
	Symbols   []string `json:"symbols"`
	Related   []Tag    `json:"related"`
}

const qTopic = `SELECT t.slug, t.name,
  (SELECT count(*) FROM article_tags at JOIN articles a ON a.id = at.article_id WHERE at.tag_id = t.id AND a.status = 'published' AND a.published_at <= now())::int,
  (SELECT count(*) FROM user_topics ut WHERE ut.tag_id = t.id)::int,
  EXISTS (SELECT 1 FROM user_topics ut WHERE ut.tag_id = t.id AND ut.user_id = NULLIF($2::text, '')::uuid),
  coalesce((SELECT json_agg(x.symbol) FROM (SELECT ai.symbol FROM article_tags at JOIN article_instruments ai ON ai.article_id = at.article_id
     WHERE at.tag_id = t.id GROUP BY ai.symbol ORDER BY count(*) DESC, ai.symbol LIMIT 4) x), '[]')::text,
  coalesce((SELECT json_agg(json_build_object('slug', x.slug, 'name', x.name)) FROM (SELECT t2.slug, t2.name FROM article_tags a1
     JOIN article_tags a2 ON a2.article_id = a1.article_id AND a2.tag_id <> a1.tag_id JOIN tags t2 ON t2.id = a2.tag_id
     WHERE a1.tag_id = t.id GROUP BY t2.slug, t2.name ORDER BY count(*) DESC, t2.slug LIMIT 5) x), '[]')::text
FROM tags t WHERE t.slug = $1::text`

// TopicBySlug mengembalikan topik; uid boleh kosong (tamu).
func (p *PG) TopicBySlug(ctx context.Context, slug, uid string) (Topic, error) {
	var t Topic
	var syms, rel string
	err := p.DB.QueryRowContext(ctx, qTopic, slug, uid).Scan(&t.Slug, &t.Name, &t.Articles, &t.Followers, &t.Following, &syms, &rel)
	if errors.Is(err, sql.ErrNoRows) {
		return t, httpx.ErrNotFound
	}
	if err != nil {
		return t, err
	}
	t.Symbols, t.Related = []string{}, []Tag{}
	_ = json.Unmarshal([]byte(syms), &t.Symbols)
	_ = json.Unmarshal([]byte(rel), &t.Related)
	return t, nil
}

func readerQueries() map[string]string {
	return map[string]string{
		"notifications": qNotifications, "notif_counts": qNotifCounts, "read_notifs": qReadNotifs, "notify": qNotify,
		"notify_article": qNotifyArticle, "alert_jobs": qAlertJobs, "alert_seen": qAlertSeen, "alert_fired": qAlertFired,
		"ad_impression": qAdImpression, "reminders": qReminders, "remind_on": qRemindOn, "remind_off": qRemindOff, "due_reminders": qDueReminders, "due_high_impact": qDueHighImpact, "ad_click": qAdClick, "topic": qTopic,
	}
}
