package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
)

// ======================================================================= riwayat versi

// Version adalah satu snapshot artikel.
type Version struct {
	ID         string    `json:"id"`
	Version    int       `json:"version"`
	Title      string    `json:"title"`
	Excerpt    string    `json:"excerpt"`
	Body       string    `json:"body"`
	Status     string    `json:"status"`
	Symbols    []string  `json:"symbols"`
	Note       string    `json:"note"`
	EditorName string    `json:"editor_name"`
	CreatedAt  time.Time `json:"created_at"`
}

const qSnapshot = `
WITH a AS (
  UPDATE articles SET breaking_until = CASE WHEN is_breaking THEN coalesce(breaking_until, now() + interval '6 hours') ELSE NULL END
  WHERE id = $1::uuid RETURNING id, title, excerpt, body, status
), last AS (
  SELECT v.title, v.excerpt, v.body, v.status, v.symbols FROM article_versions v WHERE v.article_id = $1::uuid ORDER BY v.version DESC LIMIT 1
), syms AS (
  SELECT coalesce(array_agg(symbol ORDER BY symbol), '{}') AS s FROM article_instruments WHERE article_id = $1::uuid
)
INSERT INTO article_versions (article_id, version, title, excerpt, body, status, symbols, note, editor_id)
SELECT a.id, coalesce((SELECT max(version) FROM article_versions WHERE article_id = a.id), 0) + 1, a.title, a.excerpt, a.body, a.status, syms.s, $3::text, NULLIF($2::text, '')::uuid
FROM a, syms
WHERE NOT EXISTS (SELECT 1 FROM last WHERE last.title = a.title AND last.excerpt = a.excerpt AND last.body = a.body AND last.status = a.status AND last.symbols = syms.s)
RETURNING version`

// SnapshotArticle menyimpan versi baru bila isi berubah (dan menata masa tayang breaking).
func (p *PG) SnapshotArticle(ctx context.Context, id, editorID, note string) error {
	var v int
	err := p.DB.QueryRowContext(ctx, qSnapshot, id, editorID, note).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	return err
}

const qVersions = `SELECT v.id, v.version, v.title, v.excerpt, v.body, v.status, v.symbols::text, v.note, coalesce(u.full_name, 'Otomatis'), v.created_at
FROM article_versions v LEFT JOIN users u ON u.id = v.editor_id WHERE v.article_id = $1::uuid ORDER BY v.version DESC LIMIT 100`

// ArticleVersions: riwayat versi terbaru dulu.
func (p *PG) ArticleVersions(ctx context.Context, id string) ([]Version, error) {
	rows, err := p.DB.QueryContext(ctx, qVersions, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Version{}
	for rows.Next() {
		var v Version
		var syms string
		if err := rows.Scan(&v.ID, &v.Version, &v.Title, &v.Excerpt, &v.Body, &v.Status, &syms, &v.Note, &v.EditorName, &v.CreatedAt); err != nil {
			return nil, err
		}
		v.Symbols = parseTextArray(syms)
		out = append(out, v)
	}
	return out, rows.Err()
}

const qRestoreVersion = `UPDATE articles a SET title = v.title, excerpt = v.excerpt, body = v.body, cover_alt = v.title
FROM article_versions v WHERE v.id = $2::uuid AND v.article_id = $1::uuid AND a.id = v.article_id RETURNING v.version, v.symbols::text`

// RestoreVersion mengembalikan judul/ringkasan/isi/ticker ke versi tertentu (status tidak berubah).
func (p *PG) RestoreVersion(ctx context.Context, articleID, versionID, editorID string) (int, error) {
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback() //nolint:errcheck
	var v int
	var syms string
	if err := tx.QueryRowContext(ctx, qRestoreVersion, articleID, versionID).Scan(&v, &syms); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, httpx.ErrNotFound
		}
		return 0, err
	}
	if err := setSymbols(ctx, tx, articleID, parseTextArray(syms)); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return v, p.SnapshotArticle(ctx, articleID, editorID, "Pulihkan v"+itoa(v))
}

// parseTextArray: '{A,B}' → [A B] (simbol tanpa koma/kutip).
func parseTextArray(s string) []string {
	s = strings.Trim(s, "{}")
	if s == "" {
		return []string{}
	}
	out := strings.Split(s, ",")
	for i := range out {
		out[i] = strings.Trim(out[i], `"`)
	}
	return out
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}

// ======================================================================= breaking & live blog

// BreakingItem: artikel breaking (aktif & riwayat).
type BreakingItem struct {
	ID          string     `json:"id"`
	Slug        string     `json:"slug"`
	Title       string     `json:"title"`
	Category    string     `json:"category"`
	Views       int64      `json:"views"`
	PublishedAt *time.Time `json:"published_at"`
	Until       *time.Time `json:"breaking_until"`
	Active      bool       `json:"active"`
	Author      string     `json:"author"`
}

const qBreaking = `SELECT a.id, a.slug, a.title, c.name, a.view_count, a.published_at, a.breaking_until,
  (a.is_breaking AND a.status = 'published' AND (a.breaking_until IS NULL OR a.breaking_until > now())), au.name
FROM articles a JOIN categories c ON c.id = a.category_id JOIN authors au ON au.id = a.author_id
WHERE (a.is_breaking OR a.breaking_until IS NOT NULL) AND a.status IN ('published', 'scheduled') AND coalesce(a.published_at, a.created_at) > now() - interval '30 days'
ORDER BY 8 DESC, a.published_at DESC NULLS LAST LIMIT 30`

// BreakingList: breaking aktif dulu, lalu riwayat 30 hari.
func (p *PG) BreakingList(ctx context.Context) ([]BreakingItem, error) {
	rows, err := p.DB.QueryContext(ctx, qBreaking)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BreakingItem{}
	for rows.Next() {
		var b BreakingItem
		if err := rows.Scan(&b.ID, &b.Slug, &b.Title, &b.Category, &b.Views, &b.PublishedAt, &b.Until, &b.Active, &b.Author); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

const qBreakingExtend = `UPDATE articles SET is_breaking = true, breaking_until = greatest(coalesce(breaking_until, now()), now()) + make_interval(hours => $2::int) WHERE id = $1::uuid AND status = 'published'`
const qBreakingEnd = `UPDATE articles SET is_breaking = false, breaking_until = least(coalesce(breaking_until, now()), now()) WHERE id = $1::uuid`

// SetBreaking memperpanjang (hours > 0) atau mengakhiri (hours = 0) breaking.
func (p *PG) SetBreaking(ctx context.Context, id string, hours int) error {
	q, args := qBreakingEnd, []any{id}
	if hours > 0 {
		q, args = qBreakingExtend, []any{id, hours}
	}
	r, err := p.DB.ExecContext(ctx, q, args...)
	if err != nil {
		return err
	}
	if n, _ := r.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

// LiveBlog beserta pembaruannya.
type LiveBlog struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Summary   string     `json:"summary"`
	Symbol    *string    `json:"symbol"`
	Status    string     `json:"status"`
	ClosesAt  *time.Time `json:"closes_at"`
	CreatedAt time.Time  `json:"created_at"`
	EndedAt   *time.Time `json:"ended_at"`
	Posts     []LivePost `json:"posts"`
}

// LivePost satu pembaruan live blog.
type LivePost struct {
	ID        string    `json:"id"`
	Body      string    `json:"body"`
	Kind      string    `json:"kind"`
	Symbol    *string   `json:"symbol"`
	Pinned    bool      `json:"pinned"`
	Author    string    `json:"author"`
	CreatedAt time.Time `json:"created_at"`
}

const qLiveCurrent = `SELECT id, title, summary, symbol, CASE WHEN status = 'live' AND closes_at IS NOT NULL AND closes_at < now() THEN 'ended' ELSE status END,
  closes_at, created_at, ended_at FROM live_blogs ORDER BY (status = 'live' AND (closes_at IS NULL OR closes_at > now())) DESC, created_at DESC LIMIT 1`
const qLivePosts = `SELECT p.id, p.body, p.kind, p.symbol, p.pinned, coalesce(u.full_name, 'Redaksi'), p.created_at
FROM live_posts p LEFT JOIN users u ON u.id = p.author_id WHERE p.blog_id = $1::uuid ORDER BY p.pinned DESC, p.created_at DESC LIMIT 200`

// CurrentLive: live blog aktif (atau terakhir). ErrNotFound bila belum pernah ada.
func (p *PG) CurrentLive(ctx context.Context) (LiveBlog, error) {
	var b LiveBlog
	err := p.DB.QueryRowContext(ctx, qLiveCurrent).Scan(&b.ID, &b.Title, &b.Summary, &b.Symbol, &b.Status, &b.ClosesAt, &b.CreatedAt, &b.EndedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return b, httpx.ErrNotFound
	}
	if err != nil {
		return b, err
	}
	rows, err := p.DB.QueryContext(ctx, qLivePosts, b.ID)
	if err != nil {
		return b, err
	}
	defer rows.Close()
	b.Posts = []LivePost{}
	for rows.Next() {
		var lp LivePost
		if err := rows.Scan(&lp.ID, &lp.Body, &lp.Kind, &lp.Symbol, &lp.Pinned, &lp.Author, &lp.CreatedAt); err != nil {
			return b, err
		}
		b.Posts = append(b.Posts, lp)
	}
	return b, rows.Err()
}

const qLiveEndAll = `UPDATE live_blogs SET status = 'ended', ended_at = now() WHERE status = 'live'`
const qLiveCreate = `INSERT INTO live_blogs (title, summary, symbol, closes_at, created_by) VALUES ($1::text, $2::text, NULLIF($3::text, ''), $4::timestamptz, NULLIF($5::text, '')::uuid) RETURNING id`

// StartLive menutup live blog lama lalu membuka yang baru.
func (p *PG) StartLive(ctx context.Context, title, summary, symbol string, closes *time.Time, uid string) (string, error) {
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback() //nolint:errcheck
	if _, err := tx.ExecContext(ctx, qLiveEndAll); err != nil {
		return "", err
	}
	var id string
	if err := tx.QueryRowContext(ctx, qLiveCreate, title, summary, symbol, closes, uid).Scan(&id); err != nil {
		return "", err
	}
	return id, tx.Commit()
}

const qLiveEnd = `UPDATE live_blogs SET status = 'ended', ended_at = now() WHERE id = $1::uuid AND status = 'live'`

// EndLive menutup live blog.
func (p *PG) EndLive(ctx context.Context, id string) error {
	r, err := p.DB.ExecContext(ctx, qLiveEnd, id)
	if err != nil {
		return err
	}
	if n, _ := r.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

const qLivePost = `INSERT INTO live_posts (blog_id, body, kind, symbol, pinned, author_id)
SELECT b.id, $2::text, $3::text, NULLIF($4::text, ''), $5::bool, NULLIF($6::text, '')::uuid FROM live_blogs b WHERE b.id = $1::uuid AND b.status = 'live' RETURNING id`

// AddLivePost menambah pembaruan ke live blog yang masih berjalan.
func (p *PG) AddLivePost(ctx context.Context, blogID, body, kind, symbol string, pinned bool, uid string) (string, error) {
	var id string
	err := p.DB.QueryRowContext(ctx, qLivePost, blogID, body, kind, symbol, pinned, uid).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", httpx.Conflict("Live blog sudah ditutup.")
	}
	return id, err
}

const qLivePin = `UPDATE live_posts SET pinned = $2::bool WHERE id = $1::uuid`
const qLiveDel = `DELETE FROM live_posts WHERE id = $1::uuid`

// PinLivePost menyematkan/melepas sematan.
func (p *PG) PinLivePost(ctx context.Context, id string, pinned bool) error {
	return affected(p.DB.ExecContext(ctx, qLivePin, id, pinned))
}

// DeleteLivePost menghapus pembaruan.
func (p *PG) DeleteLivePost(ctx context.Context, id string) error {
	return affected(p.DB.ExecContext(ctx, qLiveDel, id))
}

func affected(r sql.Result, err error) error {
	if err != nil {
		return err
	}
	if n, _ := r.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

// ======================================================================= Ocean Short

// Short: video singkat.
type Short struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Caption   string    `json:"caption"`
	VideoURL  *string   `json:"video_url"`
	CoverURL  *string   `json:"cover_url"`
	Symbol    *string   `json:"symbol"`
	Category  *string   `json:"category"`
	Status    string    `json:"status"`
	Views     int64     `json:"views"`
	Duration  int       `json:"duration_s"`
	CreatedAt time.Time `json:"created_at"`
	Likes     int64     `json:"likes"`
	Comments  int64     `json:"comments"`
	Saves     int64     `json:"saves"`
	Shares    int64     `json:"shares"`
	Liked     bool      `json:"liked"`
	Saved     bool      `json:"saved"`
}

const shortCols = `s.id, s.title, s.caption, s.video_url, s.cover_url, s.symbol, s.category, s.status, s.views, s.duration_s, s.created_at,
  (SELECT count(*) FROM short_likes l WHERE l.short_id = s.id),
  (SELECT count(*) FROM short_comments c WHERE c.short_id = s.id AND c.status = 'visible'),
  (SELECT count(*) FROM short_saves v WHERE v.short_id = s.id),
  s.shares,
  EXISTS (SELECT 1 FROM short_likes l WHERE l.short_id = s.id AND l.user_id = NULLIF($3::text, '')::uuid),
  EXISTS (SELECT 1 FROM short_saves v WHERE v.short_id = s.id AND v.user_id = NULLIF($3::text, '')::uuid)`

const qShorts = `SELECT ` + shortCols + ` FROM shorts s
WHERE ($1::bool OR s.status = 'published') ORDER BY s.created_at DESC LIMIT $2::int`

const qSavedShorts = `SELECT ` + shortCols + ` FROM short_saves sv JOIN shorts s ON s.id = sv.short_id
WHERE sv.user_id = NULLIF($3::text, '')::uuid AND ($1::bool OR s.status = 'published') ORDER BY sv.created_at DESC LIMIT $2::int`

func scanShorts(rows *sql.Rows) ([]Short, error) {
	defer rows.Close()
	out := []Short{}
	for rows.Next() {
		var s Short
		if err := rows.Scan(&s.ID, &s.Title, &s.Caption, &s.VideoURL, &s.CoverURL, &s.Symbol, &s.Category, &s.Status, &s.Views, &s.Duration, &s.CreatedAt, &s.Likes, &s.Comments, &s.Saves, &s.Shares, &s.Liked, &s.Saved); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// SavedShorts: short yang disimpan pengguna (terbaru dulu).
func (p *PG) SavedShorts(ctx context.Context, uid string, limit int) ([]Short, error) {
	rows, err := p.DB.QueryContext(ctx, qSavedShorts, false, limit, uid)
	if err != nil {
		return nil, err
	}
	return scanShorts(rows)
}

// Shorts: daftar terbaru (all = termasuk draf/arsip). uid (opsional) mengisi liked/saved.
func (p *PG) Shorts(ctx context.Context, all bool, limit int, uid string) ([]Short, error) {
	rows, err := p.DB.QueryContext(ctx, qShorts, all, limit, uid)
	if err != nil {
		return nil, err
	}
	return scanShorts(rows)
}

const qShortCreate = `INSERT INTO shorts (title, caption, video_url, cover_url, symbol, category, status, duration_s, created_by)
VALUES ($1::text, $2::text, NULLIF($3::text, ''), NULLIF($4::text, ''), NULLIF($5::text, ''), NULLIF($6::text, ''), $7::text, $8::int, NULLIF($9::text, '')::uuid) RETURNING id`

// CreateShort menyimpan short baru.
func (p *PG) CreateShort(ctx context.Context, s Short, uid string) (string, error) {
	var id string
	str := func(v *string) string {
		if v == nil {
			return ""
		}
		return *v
	}
	err := p.DB.QueryRowContext(ctx, qShortCreate, s.Title, s.Caption, str(s.VideoURL), str(s.CoverURL), str(s.Symbol), str(s.Category), s.Status, s.Duration, uid).Scan(&id)
	return id, err
}

const qShortStatus = `UPDATE shorts SET status = $2::text WHERE id = $1::uuid`
const qShortView = `UPDATE shorts SET views = views + 1 WHERE id = $1::uuid AND status = 'published'`

// SetShortStatus mengubah status short.
func (p *PG) SetShortStatus(ctx context.Context, id, status string) error {
	return affected(p.DB.ExecContext(ctx, qShortStatus, id, status))
}

// ShortView menambah hitungan tayang.
func (p *PG) ShortView(ctx context.Context, id string) error {
	return affected(p.DB.ExecContext(ctx, qShortView, id))
}

// ---------------------------------------------------------------- Short: suka, simpan, bagikan, komentar

const qShortLike = `WITH ok AS (SELECT id FROM shorts WHERE id = $1::uuid AND status = 'published'),
ins AS (INSERT INTO short_likes (short_id, user_id) SELECT id, $2::uuid FROM ok WHERE $3::bool ON CONFLICT DO NOTHING RETURNING 1),
del AS (DELETE FROM short_likes WHERE NOT $3::bool AND short_id = $1::uuid AND user_id = $2::uuid AND EXISTS (SELECT 1 FROM ok) RETURNING 1)
SELECT (SELECT count(*) FROM ok), (SELECT count(*) FROM short_likes WHERE short_id = $1::uuid) + (SELECT count(*) FROM ins) - (SELECT count(*) FROM del)`

const qShortSave = `WITH ok AS (SELECT id FROM shorts WHERE id = $1::uuid AND status = 'published'),
ins AS (INSERT INTO short_saves (short_id, user_id) SELECT id, $2::uuid FROM ok WHERE $3::bool ON CONFLICT DO NOTHING RETURNING 1),
del AS (DELETE FROM short_saves WHERE NOT $3::bool AND short_id = $1::uuid AND user_id = $2::uuid AND EXISTS (SELECT 1 FROM ok) RETURNING 1)
SELECT (SELECT count(*) FROM ok), (SELECT count(*) FROM short_saves WHERE short_id = $1::uuid) + (SELECT count(*) FROM ins) - (SELECT count(*) FROM del)`

const qShortShare = `UPDATE shorts SET shares = shares + 1 WHERE id = $1::uuid AND status = 'published' RETURNING shares`

// ShortToggle menyukai/menyimpan (on) atau membatalkan; kind = "like" | "save". Mengembalikan jumlah terbaru.
func (p *PG) ShortToggle(ctx context.Context, kind, id, uid string, on bool) (int64, error) {
	q := qShortLike
	if kind == "save" {
		q = qShortSave
	}
	var found, n int64
	if err := p.DB.QueryRowContext(ctx, q, id, uid, on).Scan(&found, &n); err != nil {
		return 0, err
	}
	if found == 0 {
		return 0, httpx.ErrNotFound
	}
	return n, nil
}

// ShortShare menambah hitungan bagikan.
func (p *PG) ShortShare(ctx context.Context, id string) (int64, error) {
	var n int64
	err := p.DB.QueryRowContext(ctx, qShortShare, id).Scan(&n)
	return n, notFound(err)
}

// ShortComment komentar pada Ocean Short.
type ShortComment struct {
	ID         string    `json:"id"`
	ShortID    string    `json:"short_id"`
	ShortTitle string    `json:"short_title,omitempty"`
	UserName   string    `json:"user_name"`
	UserEmail  string    `json:"user_email,omitempty"`
	Body       string    `json:"body"`
	Status     string    `json:"status"`
	Reason     *string   `json:"flag_reason,omitempty"`
	Mine       bool      `json:"mine"`
	CreatedAt  time.Time `json:"created_at"`
}

const qShortComments = `SELECT c.id, c.short_id, u.full_name, c.body, c.status, COALESCE(c.user_id = NULLIF($3::text, '')::uuid, false), c.created_at
FROM short_comments c JOIN users u ON u.id = c.user_id
WHERE c.short_id = $1::uuid AND c.status = 'visible' ORDER BY c.created_at DESC LIMIT $2::int`

const qShortCommentAdd = `WITH ins AS (
  INSERT INTO short_comments (short_id, user_id, body, status, flag_reason)
  SELECT s.id, $2::uuid, $3::text, $4::text, NULLIF($5::text, '') FROM shorts s WHERE s.id = $1::uuid AND s.status = 'published'
  RETURNING id, short_id, user_id, body, status, created_at
)
SELECT ins.id, ins.short_id, u.full_name, ins.body, ins.status, true, ins.created_at FROM ins JOIN users u ON u.id = ins.user_id`

const qShortCommentDel = `DELETE FROM short_comments WHERE id = $1::uuid AND short_id = $2::uuid AND (user_id = $3::uuid OR $4::bool)`

const qAdminShortComments = `SELECT c.id, c.short_id, s.title, u.full_name, u.email, c.body, c.status, c.flag_reason, c.created_at
FROM short_comments c JOIN users u ON u.id = c.user_id JOIN shorts s ON s.id = c.short_id
WHERE ($1::text = '' OR c.status = $1::text) ORDER BY c.created_at DESC LIMIT $2::int`

const qShortCommentStatus = `UPDATE short_comments SET status = $2::text, moderated_by = NULLIF($3::text, '')::uuid, moderated_at = now() WHERE id = $1::uuid`

func scanShortComments(rows *sql.Rows, admin bool) ([]ShortComment, error) {
	defer rows.Close()
	out := []ShortComment{}
	for rows.Next() {
		var c ShortComment
		var err error
		if admin {
			err = rows.Scan(&c.ID, &c.ShortID, &c.ShortTitle, &c.UserName, &c.UserEmail, &c.Body, &c.Status, &c.Reason, &c.CreatedAt)
		} else {
			err = rows.Scan(&c.ID, &c.ShortID, &c.UserName, &c.Body, &c.Status, &c.Mine, &c.CreatedAt)
		}
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ShortComments: komentar tampil sebuah short (terbaru dulu).
func (p *PG) ShortComments(ctx context.Context, id, uid string, limit int) ([]ShortComment, error) {
	rows, err := p.DB.QueryContext(ctx, qShortComments, id, limit, uid)
	if err != nil {
		return nil, err
	}
	return scanShortComments(rows, false)
}

// AddShortComment menyimpan komentar (status hasil penyaringan otomatis).
func (p *PG) AddShortComment(ctx context.Context, id, uid, body, status, reason string) (ShortComment, error) {
	var c ShortComment
	err := p.DB.QueryRowContext(ctx, qShortCommentAdd, id, uid, body, status, reason).Scan(&c.ID, &c.ShortID, &c.UserName, &c.Body, &c.Status, &c.Mine, &c.CreatedAt)
	return c, notFound(err)
}

// DeleteShortComment menghapus komentar milik sendiri (atau siapa pun bila moderator).
func (p *PG) DeleteShortComment(ctx context.Context, shortID, id, uid string, moderator bool) error {
	return affected(p.DB.ExecContext(ctx, qShortCommentDel, id, shortID, uid, moderator))
}

// AdminShortComments: komentar short terbaru untuk moderasi (status kosong = semua).
func (p *PG) AdminShortComments(ctx context.Context, status string, limit int) ([]ShortComment, error) {
	rows, err := p.DB.QueryContext(ctx, qAdminShortComments, status, limit)
	if err != nil {
		return nil, err
	}
	return scanShortComments(rows, true)
}

// SetShortCommentStatus memoderasi komentar short.
func (p *PG) SetShortCommentStatus(ctx context.Context, id, status, by string) error {
	return affected(p.DB.ExecContext(ctx, qShortCommentStatus, id, status, by))
}

// ======================================================================= newsletter

// Subscriber newsletter.
type Subscriber struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Lists     []string  `json:"lists"`
	Status    string    `json:"status"`
	Source    string    `json:"source"`
	Member    bool      `json:"member"`
	CreatedAt time.Time `json:"created_at"`
	Token     string    `json:"-"`
}

const qSubscribe = `INSERT INTO newsletter_subscribers (email, user_id, lists, source)
VALUES (lower($1::text), NULLIF($2::text, '')::uuid, $3::text[], $4::text)
ON CONFLICT (email) DO UPDATE SET status = 'active', lists = (SELECT array_agg(DISTINCT x) FROM unnest(newsletter_subscribers.lists || EXCLUDED.lists) x),
  user_id = coalesce(newsletter_subscribers.user_id, EXCLUDED.user_id), updated_at = now()
RETURNING (xmax = 0)`

// Subscribe mendaftarkan/mengaktifkan kembali email; true bila pelanggan baru.
func (p *PG) Subscribe(ctx context.Context, email, uid string, lists []string, source string) (bool, error) {
	var created bool
	err := p.DB.QueryRowContext(ctx, qSubscribe, email, uid, pgTextArray(lists), source).Scan(&created)
	return created, err
}

const qUnsubscribe = `UPDATE newsletter_subscribers SET status = 'unsubscribed', updated_at = now() WHERE (token = $1::text AND $1::text <> '') OR (email = lower($2::text) AND $2::text <> '')`

// Unsubscribe berhenti berlangganan via token (tautan email) atau email (pengguna masuk).
func (p *PG) Unsubscribe(ctx context.Context, token, email string) error {
	return affected(p.DB.ExecContext(ctx, qUnsubscribe, token, email))
}

// NewsletterStats ringkasan panel newsletter.
type NewsletterStats struct {
	Active       int `json:"active"`
	New7d        int `json:"new_7d"`
	Unsubscribed int `json:"unsubscribed"`
	Members      int `json:"members"`
}

const qNLStats = `SELECT count(*) FILTER (WHERE status = 'active')::int, count(*) FILTER (WHERE status = 'active' AND created_at > now() - interval '7 days')::int,
  count(*) FILTER (WHERE status = 'unsubscribed')::int, count(*) FILTER (WHERE status = 'active' AND user_id IS NOT NULL)::int FROM newsletter_subscribers`
const qNLSubs = `SELECT id, email, lists::text, status, source, user_id IS NOT NULL, created_at, token FROM newsletter_subscribers
WHERE ($1::text = '' OR email ILIKE '%' || $1::text || '%') ORDER BY created_at DESC LIMIT $2::int`

// NewsletterOverview: statistik + pelanggan terbaru.
func (p *PG) NewsletterOverview(ctx context.Context, q string, limit int) (NewsletterStats, []Subscriber, error) {
	var st NewsletterStats
	if err := p.DB.QueryRowContext(ctx, qNLStats).Scan(&st.Active, &st.New7d, &st.Unsubscribed, &st.Members); err != nil {
		return st, nil, err
	}
	rows, err := p.DB.QueryContext(ctx, qNLSubs, q, limit)
	if err != nil {
		return st, nil, err
	}
	defer rows.Close()
	out := []Subscriber{}
	for rows.Next() {
		var s Subscriber
		var lists string
		if err := rows.Scan(&s.ID, &s.Email, &lists, &s.Status, &s.Source, &s.Member, &s.CreatedAt, &s.Token); err != nil {
			return st, nil, err
		}
		s.Lists = parseTextArray(lists)
		out = append(out, s)
	}
	return st, out, rows.Err()
}

// Issue edisi newsletter.
type Issue struct {
	ID         string     `json:"id"`
	List       string     `json:"list"`
	Subject    string     `json:"subject"`
	Intro      string     `json:"intro"`
	ArticleIDs []string   `json:"article_ids"`
	Status     string     `json:"status"`
	Recipients int        `json:"recipients"`
	Failed     int        `json:"failed"`
	CreatedAt  time.Time  `json:"created_at"`
	SentAt     *time.Time `json:"sent_at"`
}

const qIssues = `SELECT id, list, subject, intro, article_ids::text, status, recipients, failed, created_at, sent_at FROM newsletter_issues ORDER BY created_at DESC LIMIT 30`

// Issues: edisi terbaru.
func (p *PG) Issues(ctx context.Context) ([]Issue, error) {
	rows, err := p.DB.QueryContext(ctx, qIssues)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Issue{}
	for rows.Next() {
		var i Issue
		var ids string
		if err := rows.Scan(&i.ID, &i.List, &i.Subject, &i.Intro, &ids, &i.Status, &i.Recipients, &i.Failed, &i.CreatedAt, &i.SentAt); err != nil {
			return nil, err
		}
		i.ArticleIDs = parseTextArray(ids)
		out = append(out, i)
	}
	return out, rows.Err()
}

const qIssueCreate = `INSERT INTO newsletter_issues (list, subject, intro, article_ids, created_by) VALUES ($1::text, $2::text, $3::text, $4::uuid[], NULLIF($5::text, '')::uuid) RETURNING id`

// CreateIssue menyimpan draf edisi.
func (p *PG) CreateIssue(ctx context.Context, list, subject, intro string, articleIDs []string, uid string) (string, error) {
	var id string
	err := p.DB.QueryRowContext(ctx, qIssueCreate, list, subject, intro, pgTextArray(articleIDs), uid).Scan(&id)
	return id, err
}

const qIssueRecipients = `SELECT email, token FROM newsletter_subscribers WHERE status = 'active' AND $1::text = ANY(lists) ORDER BY created_at LIMIT 5000`
const qIssueSent = `UPDATE newsletter_issues SET status = 'sent', sent_at = now(), recipients = $2::int, failed = $3::int WHERE id = $1::uuid AND status = 'draft'`
const qIssueGet = `SELECT id, list, subject, intro, article_ids::text, status, recipients, failed, created_at, sent_at FROM newsletter_issues WHERE id = $1::uuid`

// Issue membaca satu edisi.
func (p *PG) Issue(ctx context.Context, id string) (Issue, error) {
	var i Issue
	var ids string
	err := p.DB.QueryRowContext(ctx, qIssueGet, id).Scan(&i.ID, &i.List, &i.Subject, &i.Intro, &ids, &i.Status, &i.Recipients, &i.Failed, &i.CreatedAt, &i.SentAt)
	if errors.Is(err, sql.ErrNoRows) {
		return i, httpx.ErrNotFound
	}
	i.ArticleIDs = parseTextArray(ids)
	return i, err
}

// IssueRecipients: email & token berhenti langganan untuk satu daftar.
func (p *PG) IssueRecipients(ctx context.Context, list string) ([][2]string, error) {
	rows, err := p.DB.QueryContext(ctx, qIssueRecipients, list)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := [][2]string{}
	for rows.Next() {
		var e, t string
		if err := rows.Scan(&e, &t); err != nil {
			return nil, err
		}
		out = append(out, [2]string{e, t})
	}
	return out, rows.Err()
}

// MarkIssueSent menandai edisi terkirim (sekali).
func (p *PG) MarkIssueSent(ctx context.Context, id string, sent, failed int) error {
	return affected(p.DB.ExecContext(ctx, qIssueSent, id, sent, failed))
}

const qArticlesByIDs = `SELECT a.slug, a.title, a.excerpt FROM articles a WHERE a.id = ANY($1::uuid[]) AND a.status = 'published' ORDER BY a.published_at DESC`

// ArticleLinks: judul/slug/ringkasan artikel terbit untuk isi newsletter.
func (p *PG) ArticleLinks(ctx context.Context, ids []string) ([][3]string, error) {
	rows, err := p.DB.QueryContext(ctx, qArticlesByIDs, pgTextArray(ids))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := [][3]string{}
	for rows.Next() {
		var a [3]string
		if err := rows.Scan(&a[0], &a[1], &a[2]); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ======================================================================= dashboard & laporan

// Dashboard: angka kesehatan platform hari ini (WIB).
type Dashboard struct {
	Review          int     `json:"review"`
	Scheduled       int     `json:"scheduled"`
	BreakingActive  int     `json:"breaking_active"`
	PublishedToday  int     `json:"published_today"`
	PublishedYday   int     `json:"published_yesterday"`
	ViewsTotal      int64   `json:"views_total"`
	ActiveUsers24h  int     `json:"active_users_24h"`
	NewUsers7d      int     `json:"new_users_7d"`
	Readers         int     `json:"readers"`
	Subscribers     int     `json:"subscribers"`
	ReportsPending  int     `json:"reports_pending"`
	CommentsPending int     `json:"comments_pending"`
	AdImpressions   int64   `json:"ad_impressions"`
	AdClicks        int64   `json:"ad_clicks"`
	CampaignsReview int     `json:"campaigns_review"`
	MarketCalls     int     `json:"market_calls_today"`
	MarketLatencyMS float64 `json:"market_latency_avg_ms"`
	MarketErrors    int     `json:"market_errors_today"`
	RevenueMonth    int64   `json:"revenue_month"`
	NewsletterSubs  int     `json:"newsletter_subscribers"`
}

const qDashboard = `SELECT
  (SELECT count(*) FROM articles WHERE status = 'review')::int,
  (SELECT count(*) FROM articles WHERE status = 'scheduled')::int,
  (SELECT count(*) FROM articles WHERE is_breaking AND status = 'published' AND (breaking_until IS NULL OR breaking_until > now()))::int,
  (SELECT count(*) FROM articles WHERE status = 'published' AND published_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')::int,
  (SELECT count(*) FROM articles WHERE status = 'published' AND published_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') - interval '1 day') AT TIME ZONE 'Asia/Jakarta'
     AND published_at < date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')::int,
  (SELECT coalesce(sum(view_count), 0) FROM articles)::bigint,
  (SELECT count(DISTINCT user_id) FROM refresh_tokens WHERE created_at > now() - interval '24 hours')::int,
  (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days' AND deleted_at IS NULL)::int,
  (SELECT count(*) FROM users WHERE deleted_at IS NULL)::int,
  (SELECT count(DISTINCT user_id) FROM subscriptions WHERE status IN ('active', 'past_due') AND (current_period_end IS NULL OR current_period_end > now()))::int,
  (SELECT count(*) FROM comment_reports r JOIN comments c ON c.id = r.comment_id WHERE c.status <> 'removed')::int,
  (SELECT count(*) FROM comments WHERE status = 'pending')::int,
  (SELECT coalesce(sum(impressions), 0) FROM ad_campaigns)::bigint,
  (SELECT coalesce(sum(clicks), 0) FROM ad_campaigns)::bigint,
  (SELECT count(*) FROM ad_campaigns WHERE status = 'pending')::int,
  (SELECT coalesce(sum(calls), 0) FROM market_usage WHERE day = (now() AT TIME ZONE 'UTC')::date)::int,
  (SELECT coalesce(sum(latency_ms)::float8 / nullif(sum(calls), 0), 0) FROM market_usage WHERE day = (now() AT TIME ZONE 'UTC')::date)::float8,
  (SELECT coalesce(sum(errors), 0) FROM market_usage WHERE day = (now() AT TIME ZONE 'UTC')::date)::int,
  (SELECT coalesce(sum(total), 0) FROM invoices WHERE status = 'paid' AND paid_at >= date_trunc('month', now()))::bigint,
  (SELECT count(*) FROM newsletter_subscribers WHERE status = 'active')::int`

// DashboardStats mengumpulkan angka panel.
func (p *PG) DashboardStats(ctx context.Context) (Dashboard, error) {
	var d Dashboard
	err := p.DB.QueryRowContext(ctx, qDashboard).Scan(&d.Review, &d.Scheduled, &d.BreakingActive, &d.PublishedToday, &d.PublishedYday, &d.ViewsTotal,
		&d.ActiveUsers24h, &d.NewUsers7d, &d.Readers, &d.Subscribers, &d.ReportsPending, &d.CommentsPending, &d.AdImpressions, &d.AdClicks, &d.CampaignsReview,
		&d.MarketCalls, &d.MarketLatencyMS, &d.MarketErrors, &d.RevenueMonth, &d.NewsletterSubs)
	return d, err
}

// Report: laporan 30 hari.
type Report struct {
	Revenue     []DayValue  `json:"revenue"`
	Signups     []DayValue  `json:"signups"`
	Published   []DayValue  `json:"published"`
	ByPlan      []NameValue `json:"by_plan"`
	TopArticles []NameValue `json:"top_articles"`
	TopCampaign []NameValue `json:"top_campaigns"`
	Totals      struct {
		Revenue       int64 `json:"revenue"`
		Invoices      int   `json:"invoices_paid"`
		Open          int   `json:"invoices_open"`
		Subscribers   int   `json:"subscribers"`
		Signups       int   `json:"signups"`
		Published     int   `json:"published"`
		Views         int64 `json:"views"`
		AdImpressions int64 `json:"ad_impressions"`
		AdClicks      int64 `json:"ad_clicks"`
	} `json:"totals"`
}

// DayValue nilai per hari (WIB).
type DayValue struct {
	Day   string `json:"day"`
	Value int64  `json:"value"`
}

// NameValue pasangan label-nilai.
type NameValue struct {
	Name  string `json:"name"`
	Value int64  `json:"value"`
	Extra string `json:"extra,omitempty"`
}

const qRepDays = `WITH d AS (SELECT generate_series((now() AT TIME ZONE 'Asia/Jakarta')::date - 29, (now() AT TIME ZONE 'Asia/Jakarta')::date, interval '1 day')::date AS day)
SELECT to_char(d.day, 'YYYY-MM-DD'),
  coalesce((SELECT sum(total) FROM invoices WHERE status = 'paid' AND (paid_at AT TIME ZONE 'Asia/Jakarta')::date = d.day), 0)::bigint,
  (SELECT count(*) FROM users WHERE deleted_at IS NULL AND (created_at AT TIME ZONE 'Asia/Jakarta')::date = d.day)::bigint,
  (SELECT count(*) FROM articles WHERE status = 'published' AND (published_at AT TIME ZONE 'Asia/Jakarta')::date = d.day)::bigint
FROM d ORDER BY d.day`
const qRepPlans = `SELECT sp.name, count(*)::bigint FROM subscriptions s JOIN subscription_plans sp ON sp.code = s.plan_code
WHERE s.status IN ('active', 'past_due') AND (s.current_period_end IS NULL OR s.current_period_end > now()) GROUP BY sp.name ORDER BY 2 DESC`
const qRepTop = `SELECT a.title, a.view_count, a.slug FROM articles a WHERE a.status = 'published' ORDER BY a.view_count DESC LIMIT 10`
const qRepAds = `SELECT name, impressions, clicks::text FROM ad_campaigns ORDER BY impressions DESC LIMIT 8`
const qRepTotals = `SELECT (SELECT count(*) FROM invoices WHERE status = 'open')::int, (SELECT coalesce(sum(view_count), 0) FROM articles)::bigint,
  (SELECT coalesce(sum(impressions), 0) FROM ad_campaigns)::bigint, (SELECT coalesce(sum(clicks), 0) FROM ad_campaigns)::bigint`

// Reports menyusun laporan 30 hari terakhir.
func (p *PG) Reports(ctx context.Context) (Report, error) {
	var r Report
	r.Revenue, r.Signups, r.Published = []DayValue{}, []DayValue{}, []DayValue{}
	rows, err := p.DB.QueryContext(ctx, qRepDays)
	if err != nil {
		return r, err
	}
	for rows.Next() {
		var day string
		var rev, sig, pub int64
		if err := rows.Scan(&day, &rev, &sig, &pub); err != nil {
			rows.Close()
			return r, err
		}
		r.Revenue = append(r.Revenue, DayValue{day, rev})
		r.Signups = append(r.Signups, DayValue{day, sig})
		r.Published = append(r.Published, DayValue{day, pub})
		r.Totals.Revenue += rev
		r.Totals.Signups += int(sig)
		r.Totals.Published += int(pub)
		if rev > 0 {
			r.Totals.Invoices++
		}
	}
	rows.Close()
	nv := func(q string) ([]NameValue, error) {
		rows, err := p.DB.QueryContext(ctx, q)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []NameValue{}
		for rows.Next() {
			var x NameValue
			var dest = []any{&x.Name, &x.Value}
			cols, _ := rows.Columns()
			if len(cols) > 2 {
				dest = append(dest, &x.Extra)
			}
			if err := rows.Scan(dest...); err != nil {
				return nil, err
			}
			out = append(out, x)
		}
		return out, rows.Err()
	}
	if r.ByPlan, err = nv(qRepPlans); err != nil {
		return r, err
	}
	for _, x := range r.ByPlan {
		r.Totals.Subscribers += int(x.Value)
	}
	if r.TopArticles, err = nv(qRepTop); err != nil {
		return r, err
	}
	if r.TopCampaign, err = nv(qRepAds); err != nil {
		return r, err
	}
	err = p.DB.QueryRowContext(ctx, qRepTotals).Scan(&r.Totals.Open, &r.Totals.Views, &r.Totals.AdImpressions, &r.Totals.AdClicks)
	return r, err
}

// ======================================================================= pencarian admin

// AdminHit hasil pencarian panel admin.
type AdminHit struct {
	Kind  string `json:"kind"` // article | user | symbol
	ID    string `json:"id"`
	Title string `json:"title"`
	Sub   string `json:"sub"`
	Href  string `json:"href"`
}

const qAdminSearch = `
(SELECT 'article', a.id::text, a.title, a.status || ' · ' || c.name, '/admin/tulis?id=' || a.id FROM articles a JOIN categories c ON c.id = a.category_id
  WHERE a.title ILIKE '%' || $1::text || '%' OR a.slug ILIKE '%' || $1::text || '%' ORDER BY a.updated_at DESC LIMIT 15)
UNION ALL
(SELECT 'user', u.id::text, u.full_name, u.email || ' · ' || u.role, '/admin/pengguna?id=' || u.id FROM users u
  WHERE u.deleted_at IS NULL AND (u.email ILIKE '%' || $1::text || '%' OR u.full_name ILIKE '%' || $1::text || '%') ORDER BY u.created_at DESC LIMIT 10)
UNION ALL
(SELECT 'symbol', i.symbol, i.symbol, i.name || ' · ' || i.exchange, '/admin/simbol?s=' || i.symbol FROM instruments i
  WHERE i.symbol ILIKE '%' || $1::text || '%' OR i.name ILIKE '%' || $1::text || '%' ORDER BY i.symbol LIMIT 10)`

// AdminSearch mencari artikel, pengguna, dan simbol.
func (p *PG) AdminSearch(ctx context.Context, q string) ([]AdminHit, error) {
	q = strings.NewReplacer("%", "", "_", "").Replace(strings.TrimSpace(q))
	out := []AdminHit{}
	if q == "" {
		return out, nil
	}
	rows, err := p.DB.QueryContext(ctx, qAdminSearch, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var h AdminHit
		if err := rows.Scan(&h.Kind, &h.ID, &h.Title, &h.Sub, &h.Href); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

func newsroomQueries() map[string]string {
	return map[string]string{
		"snapshot": qSnapshot, "versions": qVersions, "restore_version": qRestoreVersion, "breaking": qBreaking, "breaking_extend": qBreakingExtend, "breaking_end": qBreakingEnd,
		"live_current": qLiveCurrent, "live_posts": qLivePosts, "live_end_all": qLiveEndAll, "live_create": qLiveCreate, "live_end": qLiveEnd, "live_post": qLivePost,
		"live_pin": qLivePin, "live_del": qLiveDel, "shorts": qShorts, "saved_shorts": qSavedShorts, "short_like": qShortLike, "short_save": qShortSave, "short_share": qShortShare, "short_comments": qShortComments, "short_comment_add": qShortCommentAdd, "short_comment_del": qShortCommentDel, "admin_short_comments": qAdminShortComments, "short_comment_status": qShortCommentStatus, "short_create": qShortCreate, "short_status": qShortStatus, "short_view": qShortView,
		"subscribe": qSubscribe, "unsubscribe": qUnsubscribe, "nl_stats": qNLStats, "nl_subs": qNLSubs, "issues": qIssues, "issue_create": qIssueCreate,
		"issue_recipients": qIssueRecipients, "issue_sent": qIssueSent, "issue_get": qIssueGet, "articles_by_ids": qArticlesByIDs,
		"dashboard": qDashboard, "rep_days": qRepDays, "rep_plans": qRepPlans, "rep_top": qRepTop, "rep_ads": qRepAds, "rep_totals": qRepTotals, "admin_search": qAdminSearch,
	}
}
