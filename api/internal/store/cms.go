package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
)

// ======================================================================= kategori

// AdminCategory adalah kategori lengkap untuk panel redaksi.
type AdminCategory struct {
	ID             string    `json:"id"`
	Slug           string    `json:"slug"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Icon           string    `json:"icon"`
	ParentID       *string   `json:"parent_id"`
	ParentName     *string   `json:"parent_name"`
	SortOrder      int       `json:"sort_order"`
	Status         string    `json:"status"`
	InMenu         bool      `json:"in_menu"`
	Followable     bool      `json:"followable"`
	Color          string    `json:"color"`
	SEOTitle       string    `json:"seo_title"`
	SEODescription string    `json:"seo_description"`
	EditorID       *string   `json:"editor_id"`
	EditorName     *string   `json:"editor_name"`
	Articles       int       `json:"articles"`
	Published      int       `json:"published"`
	Drafts         int       `json:"drafts"`
	Views          int64     `json:"views"`
	Followers      int       `json:"followers"`
	CreatedAt      time.Time `json:"created_at"`
	CreatedByName  *string   `json:"created_by_name"`
}

// CategoryInput adalah isian form kategori.
type CategoryInput struct {
	Slug           string  `json:"slug"`
	Name           string  `json:"name"`
	Description    string  `json:"description"`
	Icon           string  `json:"icon"`
	ParentID       *string `json:"parent_id"`
	SortOrder      int     `json:"sort_order"`
	Status         string  `json:"status"`
	InMenu         bool    `json:"in_menu"`
	Followable     bool    `json:"followable"`
	Color          string  `json:"color"`
	SEOTitle       string  `json:"seo_title"`
	SEODescription string  `json:"seo_description"`
	EditorID       *string `json:"editor_id"`
}

const qAdminCategories = `
SELECT c.id, c.slug, c.name, c.description, c.icon, c.parent_id, pc.name, c.sort_order, c.status, c.in_menu, c.followable,
       c.color, c.seo_title, c.seo_description, c.editor_id, eu.full_name,
       count(a.id)::int,
       count(a.id) FILTER (WHERE a.status = 'published')::int,
       count(a.id) FILTER (WHERE a.status IN ('draft', 'review'))::int,
       coalesce(sum(a.view_count), 0)::bigint,
       (SELECT count(*) FROM user_topics ut JOIN tags t ON t.id = ut.tag_id WHERE t.slug = c.slug)::int,
       c.created_at, cu.full_name
FROM categories c
LEFT JOIN categories pc ON pc.id = c.parent_id
LEFT JOIN users eu ON eu.id = c.editor_id
LEFT JOIN users cu ON cu.id = c.created_by
LEFT JOIN articles a ON a.category_id = c.id
GROUP BY c.id, pc.name, eu.full_name, cu.full_name
ORDER BY c.parent_id NULLS FIRST, c.sort_order, c.name`

// AdminCategories mengembalikan semua kategori (aktif, draf, arsip) dengan statistiknya.
func (p *PG) AdminCategories(ctx context.Context) ([]AdminCategory, error) {
	rows, err := p.DB.QueryContext(ctx, qAdminCategories)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminCategory{}
	for rows.Next() {
		var c AdminCategory
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.ParentID, &c.ParentName, &c.SortOrder, &c.Status, &c.InMenu,
			&c.Followable, &c.Color, &c.SEOTitle, &c.SEODescription, &c.EditorID, &c.EditorName, &c.Articles, &c.Published, &c.Drafts,
			&c.Views, &c.Followers, &c.CreatedAt, &c.CreatedByName); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func catErr(err error) error {
	switch {
	case pgCode(err, "23505"):
		return httpx.Validation(map[string]string{"slug": "Slug sudah dipakai kategori lain."})
	case pgCode(err, "23503"):
		return httpx.Validation(map[string]string{"parent_id": "Induk atau editor tidak dikenal."})
	case pgCode(err, "23514"):
		return httpx.Validation(map[string]string{"slug": "Isian tidak valid (cek slug, warna, panjang SEO)."})
	}
	return err
}

const qCreateCategory = `INSERT INTO categories (slug, name, description, icon, parent_id, sort_order, status, in_menu, followable, color,
  seo_title, seo_description, editor_id, created_by)
VALUES ($1, $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10, $11, $12, $13::uuid, nullif($14, '')::uuid) RETURNING id`

// CreateCategory membuat kategori baru.
func (p *PG) CreateCategory(ctx context.Context, in CategoryInput, by string) (string, error) {
	var id string
	err := p.DB.QueryRowContext(ctx, qCreateCategory, in.Slug, in.Name, in.Description, in.Icon, in.ParentID, in.SortOrder, in.Status, in.InMenu,
		in.Followable, in.Color, in.SEOTitle, in.SEODescription, in.EditorID, by).Scan(&id)
	return id, catErr(err)
}

const qUpdateCategory = `UPDATE categories SET slug = $2, name = $3, description = $4, icon = $5, parent_id = $6::uuid, sort_order = $7,
  status = $8, in_menu = $9, followable = $10, color = $11, seo_title = $12, seo_description = $13, editor_id = $14::uuid
WHERE id = $1::uuid`

// UpdateCategory mengubah kategori.
func (p *PG) UpdateCategory(ctx context.Context, id string, in CategoryInput) error {
	res, err := p.DB.ExecContext(ctx, qUpdateCategory, id, in.Slug, in.Name, in.Description, in.Icon, in.ParentID, in.SortOrder, in.Status,
		in.InMenu, in.Followable, in.Color, in.SEOTitle, in.SEODescription, in.EditorID)
	if err != nil {
		return catErr(err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

const qCatSlug = `SELECT slug FROM categories WHERE id = $1::uuid`
const qMoveArticles = `UPDATE articles SET category_id = $2::uuid WHERE category_id = $1::uuid`
const qCatRedirect = `INSERT INTO category_redirects (from_slug, to_category) VALUES ($1, $2::uuid)
ON CONFLICT (from_slug) DO UPDATE SET to_category = EXCLUDED.to_category`
const qRepointRedirects = `UPDATE category_redirects SET to_category = $2::uuid WHERE to_category = $1::uuid`
const qCountCatArticles = `SELECT count(*)::int FROM articles WHERE category_id = $1::uuid`
const qDeleteCategory = `DELETE FROM categories WHERE id = $1::uuid`

// DeleteCategory menghapus kategori; artikelnya dipindah ke moveTo (wajib bila ada artikel),
// dan URL lama bisa dialihkan ke kategori tujuan.
func (p *PG) DeleteCategory(ctx context.Context, id, moveTo string, redirect bool) (int, error) {
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback() //nolint:errcheck
	var slug string
	if err := tx.QueryRowContext(ctx, qCatSlug, id).Scan(&slug); err != nil {
		return 0, notFound(err)
	}
	var n int
	if err := tx.QueryRowContext(ctx, qCountCatArticles, id).Scan(&n); err != nil {
		return 0, err
	}
	if moveTo == "" && (n > 0 || redirect) {
		return 0, httpx.Validation(map[string]string{"move_to": fmt.Sprintf("Kategori ini punya %d artikel. Pilih kategori tujuan.", n)})
	}
	if moveTo != "" {
		if moveTo == id {
			return 0, httpx.Validation(map[string]string{"move_to": "Pilih kategori tujuan yang lain."})
		}
		if _, err := tx.ExecContext(ctx, qMoveArticles, id, moveTo); err != nil {
			return 0, catErr(err)
		}
		if _, err := tx.ExecContext(ctx, qRepointRedirects, id, moveTo); err != nil {
			return 0, err
		}
		if redirect {
			if _, err := tx.ExecContext(ctx, qCatRedirect, slug, moveTo); err != nil {
				return 0, err
			}
		}
	}
	if _, err := tx.ExecContext(ctx, qDeleteCategory, id); err != nil {
		return 0, catErr(err)
	}
	return n, tx.Commit()
}

const qCategoryMenu = `UPDATE categories SET in_menu = $2 WHERE id = $1::uuid`

// SetCategoryMenu menampilkan/menyembunyikan kategori dari menu navigasi.
func (p *PG) SetCategoryMenu(ctx context.Context, id string, on bool) error {
	res, err := p.DB.ExecContext(ctx, qCategoryMenu, id, on)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

const qReorder = `UPDATE categories c SET sort_order = o.ord FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, ord) WHERE c.id = o.id`

// ReorderCategories menyimpan urutan menu (urutan id = urutan tampil).
func (p *PG) ReorderCategories(ctx context.Context, ids []string) error {
	_, err := p.DB.ExecContext(ctx, qReorder, pgTextArray(ids))
	return err
}

const qCategoryRedirect = `SELECT c.slug FROM category_redirects r JOIN categories c ON c.id = r.to_category WHERE r.from_slug = $1`

// CategoryRedirect mengembalikan slug tujuan untuk URL kategori lama ("" bila tidak ada).
func (p *PG) CategoryRedirect(ctx context.Context, slug string) (string, error) {
	var to string
	err := p.DB.QueryRowContext(ctx, qCategoryRedirect, slug).Scan(&to)
	if err != nil && notFound(err) == httpx.ErrNotFound {
		return "", nil
	}
	return to, err
}

// ======================================================================= tag

// AdminTag adalah tag dengan pemakaiannya.
type AdminTag struct {
	ID           string  `json:"id"`
	Slug         string  `json:"slug"`
	Name         string  `json:"name"`
	Articles     int     `json:"articles"`
	Followers    int     `json:"followers"`
	MainCategory *string `json:"main_category"`
}

const qAdminTags = `
SELECT t.id, t.slug, t.name,
       (SELECT count(*) FROM article_tags at WHERE at.tag_id = t.id)::int AS n,
       (SELECT count(*) FROM user_topics ut WHERE ut.tag_id = t.id)::int,
       (SELECT c.name FROM article_tags at JOIN articles a ON a.id = at.article_id JOIN categories c ON c.id = a.category_id
         WHERE at.tag_id = t.id GROUP BY c.name ORDER BY count(*) DESC LIMIT 1)
FROM tags t
WHERE $1::text = '' OR t.slug ILIKE '%' || $1::text || '%' OR t.name ILIKE '%' || $1::text || '%'
ORDER BY n DESC, t.name
LIMIT $2::int`

// AdminTags mengembalikan tag (terbanyak dipakai dulu).
func (p *PG) AdminTags(ctx context.Context, q string, limit int) ([]AdminTag, error) {
	rows, err := p.DB.QueryContext(ctx, qAdminTags, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminTag{}
	for rows.Next() {
		var t AdminTag
		if err := rows.Scan(&t.ID, &t.Slug, &t.Name, &t.Articles, &t.Followers, &t.MainCategory); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

const qTagCounts = `SELECT count(*)::int, count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM article_tags at WHERE at.tag_id = t.id))::int FROM tags t`

// TagCounts: jumlah tag & tag tanpa artikel.
func (p *PG) TagCounts(ctx context.Context) (int, int, error) {
	var all, unused int
	err := p.DB.QueryRowContext(ctx, qTagCounts).Scan(&all, &unused)
	return all, unused, err
}

func tagErr(err error) error {
	if pgCode(err, "23505") {
		return httpx.Validation(map[string]string{"slug": "Tag dengan slug itu sudah ada."})
	}
	if pgCode(err, "23514") {
		return httpx.Validation(map[string]string{"slug": "Slug hanya huruf kecil, angka, dan tanda minus."})
	}
	return err
}

// CreateTag membuat tag.
func (p *PG) CreateTag(ctx context.Context, slug, name string) (string, error) {
	var id string
	err := p.DB.QueryRowContext(ctx, `INSERT INTO tags (slug, name) VALUES ($1, $2) RETURNING id`, slug, name).Scan(&id)
	return id, tagErr(err)
}

// UpdateTag mengganti nama/slug tag.
func (p *PG) UpdateTag(ctx context.Context, id, slug, name string) error {
	res, err := p.DB.ExecContext(ctx, `UPDATE tags SET slug = $2, name = $3 WHERE id = $1::uuid`, id, slug, name)
	if err != nil {
		return tagErr(err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

// DeleteTag menghapus tag (relasi artikel & pengikut ikut terhapus).
func (p *PG) DeleteTag(ctx context.Context, id string) error {
	res, err := p.DB.ExecContext(ctx, `DELETE FROM tags WHERE id = $1::uuid`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

// MergeTags memindahkan artikel & pengikut tag from ke into, lalu menghapus from.
func (p *PG) MergeTags(ctx context.Context, from, into string) error {
	if from == into {
		return httpx.Validation(map[string]string{"into": "Pilih tag tujuan yang berbeda."})
	}
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	for _, q := range []string{
		`INSERT INTO article_tags (article_id, tag_id) SELECT article_id, $2::uuid FROM article_tags WHERE tag_id = $1::uuid ON CONFLICT DO NOTHING`,
		`INSERT INTO user_topics (user_id, tag_id) SELECT user_id, $2::uuid FROM user_topics WHERE tag_id = $1::uuid ON CONFLICT DO NOTHING`,
	} {
		if _, err := tx.ExecContext(ctx, q, from, into); err != nil {
			if pgCode(err, "23503") {
				return httpx.Validation(map[string]string{"into": "Tag tujuan tidak ditemukan."})
			}
			return err
		}
	}
	res, err := tx.ExecContext(ctx, `DELETE FROM tags WHERE id = $1::uuid`, from)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return tx.Commit()
}

// ======================================================================= komentar

// ModComment adalah komentar di antrian moderasi.
type ModComment struct {
	ID           string     `json:"id"`
	Body         string     `json:"body"`
	Status       string     `json:"status"`
	FlagReason   string     `json:"flag_reason"`
	CreatedAt    time.Time  `json:"created_at"`
	UserID       string     `json:"user_id"`
	UserName     string     `json:"user_name"`
	UserBlocked  bool       `json:"user_blocked"`
	ArticleTitle string     `json:"article_title"`
	ArticleSlug  string     `json:"article_slug"`
	Reports      int        `json:"reports"`
	ModeratedAt  *time.Time `json:"moderated_at"`
	ModeratedBy  *string    `json:"moderated_by_name"`
}

// ModCounts adalah ringkasan moderasi.
type ModCounts struct {
	Pending       int `json:"pending"`
	Flagged       int `json:"flagged"`
	Visible       int `json:"visible"`
	Hidden        int `json:"hidden"`
	ApprovedToday int `json:"approved_today"`
	BlockedWeek   int `json:"blocked_week"`
}

const qModComments = `
SELECT cm.id, cm.body, cm.status, cm.flag_reason, cm.created_at, u.id, u.full_name, u.blocked_at IS NOT NULL,
       a.title, a.slug, (SELECT count(*) FROM comment_reports r WHERE r.comment_id = cm.id)::int AS reports,
       cm.moderated_at, mu.full_name
FROM comments cm
JOIN users u ON u.id = cm.user_id
JOIN articles a ON a.id = cm.article_id
LEFT JOIN users mu ON mu.id = cm.moderated_by
WHERE ($1::text = 'queue' AND cm.status IN ('pending', 'flagged')) OR cm.status = $1::text
ORDER BY reports DESC, cm.created_at DESC
LIMIT $2`

// ModComments mengembalikan komentar menurut status ("queue" = menunggu + dilaporkan).
func (p *PG) ModComments(ctx context.Context, status string, limit int) ([]ModComment, error) {
	rows, err := p.DB.QueryContext(ctx, qModComments, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ModComment{}
	for rows.Next() {
		var c ModComment
		if err := rows.Scan(&c.ID, &c.Body, &c.Status, &c.FlagReason, &c.CreatedAt, &c.UserID, &c.UserName, &c.UserBlocked,
			&c.ArticleTitle, &c.ArticleSlug, &c.Reports, &c.ModeratedAt, &c.ModeratedBy); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

const qModCounts = `
SELECT count(*) FILTER (WHERE status = 'pending')::int,
       count(*) FILTER (WHERE status = 'flagged')::int,
       count(*) FILTER (WHERE status = 'visible')::int,
       count(*) FILTER (WHERE status = 'hidden')::int,
       count(*) FILTER (WHERE status = 'visible' AND moderated_at > date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')::int,
       (SELECT count(*) FROM users WHERE blocked_at > now() - interval '7 days')::int
FROM comments`

// ModerationCounts mengembalikan ringkasan antrian.
func (p *PG) ModerationCounts(ctx context.Context) (ModCounts, error) {
	var c ModCounts
	err := p.DB.QueryRowContext(ctx, qModCounts).Scan(&c.Pending, &c.Flagged, &c.Visible, &c.Hidden, &c.ApprovedToday, &c.BlockedWeek)
	return c, err
}

const qSetCommentStatus = `UPDATE comments SET status = $2, moderated_by = nullif($3, '')::uuid, moderated_at = now()
WHERE id = ANY($1::uuid[])`

// SetCommentStatus menyetujui/menyembunyikan beberapa komentar sekaligus.
func (p *PG) SetCommentStatus(ctx context.Context, ids []string, status, by string) (int, error) {
	res, err := p.DB.ExecContext(ctx, qSetCommentStatus, pgTextArray(ids), status, by)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

const qReport = `INSERT INTO comment_reports (comment_id, user_id, reason) SELECT c.id, $2::uuid, $3 FROM comments c
WHERE c.id = $1::uuid AND c.user_id <> $2::uuid ON CONFLICT DO NOTHING`
const qReportCount = `SELECT count(*)::int FROM comment_reports WHERE comment_id = $1::uuid`
const qFlagIfReported = `UPDATE comments SET status = 'flagged', flag_reason = 'Dilaporkan ' || $2::text || ' pembaca'
WHERE id = $1::uuid AND status = 'visible'`

// ReportComment mencatat laporan pembaca; mengembalikan jumlah laporan & apakah komentar disembunyikan.
func (p *PG) ReportComment(ctx context.Context, id, userID, reason string, threshold int) (int, bool, error) {
	if _, err := p.DB.ExecContext(ctx, qReport, id, userID, reason); err != nil {
		return 0, false, err
	}
	var n int
	if err := p.DB.QueryRowContext(ctx, qReportCount, id).Scan(&n); err != nil {
		return 0, false, err
	}
	hidden := false
	if threshold > 0 && n >= threshold {
		res, err := p.DB.ExecContext(ctx, qFlagIfReported, id, fmt.Sprint(n))
		if err != nil {
			return n, false, err
		}
		k, _ := res.RowsAffected()
		hidden = k > 0
	}
	return n, hidden, nil
}

// ModerationWords mengembalikan kata terlarang.
func (p *PG) ModerationWords(ctx context.Context) ([]string, error) {
	rows, err := p.DB.QueryContext(ctx, `SELECT word FROM moderation_words ORDER BY word`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var w string
		if err := rows.Scan(&w); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// AddModerationWord menambah kata terlarang.
func (p *PG) AddModerationWord(ctx context.Context, word, by string) error {
	_, err := p.DB.ExecContext(ctx, `INSERT INTO moderation_words (word, created_by) VALUES ($1, nullif($2, '')::uuid) ON CONFLICT DO NOTHING`, word, by)
	if pgCode(err, "23514") {
		return httpx.Validation(map[string]string{"word": "Kata 2–60 karakter."})
	}
	return err
}

// RemoveModerationWord menghapus kata terlarang.
func (p *PG) RemoveModerationWord(ctx context.Context, word string) error {
	_, err := p.DB.ExecContext(ctx, `DELETE FROM moderation_words WHERE word = $1`, word)
	return err
}

// Setting membaca pengaturan JSON (ke dst). ok=false bila belum ada.
func (p *PG) Setting(ctx context.Context, key string, dst any) (bool, error) {
	var raw string
	err := p.DB.QueryRowContext(ctx, `SELECT value::text FROM app_settings WHERE key = $1`, key).Scan(&raw)
	if notFound(err) == httpx.ErrNotFound {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal([]byte(raw), dst)
}

// SetSetting menyimpan pengaturan JSON.
func (p *PG) SetSetting(ctx context.Context, key string, v any, by string) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = p.DB.ExecContext(ctx, `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1, $2::jsonb, nullif($3, '')::uuid, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`, key, string(b), by)
	return err
}

// ======================================================================= media

// MediaItem adalah metadata media (tanpa isi berkas).
type MediaItem struct {
	ID           string     `json:"id"`
	Mime         string     `json:"mime"`
	Size         int        `json:"size"`
	Title        string     `json:"title"`
	Kind         string     `json:"kind"`
	Source       string     `json:"source"`
	License      string     `json:"license"`
	LicenseUntil *string    `json:"license_until"`
	Alt          string     `json:"alt"`
	FileName     string     `json:"file_name"`
	Width        *int       `json:"width"`
	Height       *int       `json:"height"`
	UploadedBy   *string    `json:"uploaded_by_name"`
	CreatedAt    time.Time  `json:"created_at"`
	UsedIn       int        `json:"used_in"`
	UsedTitle    *string    `json:"used_title"`
	AvatarOf     *string    `json:"avatar_of"`
	ExpiresSoon  bool       `json:"expires_soon"`
	Expired      bool       `json:"expired"`
	UpdatedAt    *time.Time `json:"-"`
}

// MediaCounts adalah ringkasan pustaka.
type MediaCounts struct {
	All       int `json:"all"`
	Unlicense int `json:"unlicensed"`
	Expiring  int `json:"expiring"`
	Video     int `json:"video"`
}

const mediaCols = `m.id, m.mime, m.size, m.title, m.kind, m.source, m.license, to_char(m.license_until, 'YYYY-MM-DD'), m.alt, m.file_name,
  m.width, m.height, u.full_name, m.created_at,
  (SELECT count(*) FROM articles a WHERE a.cover_url LIKE '%' || m.id::text || '%' OR a.body LIKE '%' || m.id::text || '%')::int,
  (SELECT a.title FROM articles a WHERE a.cover_url LIKE '%' || m.id::text || '%' OR a.body LIKE '%' || m.id::text || '%' ORDER BY a.updated_at DESC LIMIT 1),
  (SELECT au.full_name FROM users au WHERE au.avatar_media_id = m.id LIMIT 1),
  m.license_until IS NOT NULL AND m.license_until BETWEEN current_date AND current_date + 30,
  m.license_until IS NOT NULL AND m.license_until < current_date`

const qMediaList = `SELECT ` + mediaCols + ` FROM media m LEFT JOIN users u ON u.id = m.uploaded_by
WHERE NOT EXISTS (SELECT 1 FROM users au WHERE au.avatar_media_id = m.id)
  AND ($1::text = '' OR ($1 = 'unlicensed' AND m.license = 'none') OR ($1 = 'expiring' AND m.license_until IS NOT NULL AND m.license_until <= current_date + 30) OR m.kind = $1::text)
  AND ($2::text = '' OR m.title ILIKE '%' || $2::text || '%' OR m.file_name ILIKE '%' || $2::text || '%' OR m.alt ILIKE '%' || $2::text || '%')
ORDER BY m.created_at DESC LIMIT $3`
const qMediaItem = `SELECT ` + mediaCols + ` FROM media m LEFT JOIN users u ON u.id = m.uploaded_by WHERE m.id = $1::uuid`
const qMediaCounts = `SELECT count(*)::int, count(*) FILTER (WHERE license = 'none')::int,
  count(*) FILTER (WHERE license_until IS NOT NULL AND license_until <= current_date + 30)::int, count(*) FILTER (WHERE kind = 'video')::int
FROM media m WHERE NOT EXISTS (SELECT 1 FROM users au WHERE au.avatar_media_id = m.id)`

func scanMedia(s scanner) (MediaItem, error) {
	var m MediaItem
	err := s.Scan(&m.ID, &m.Mime, &m.Size, &m.Title, &m.Kind, &m.Source, &m.License, &m.LicenseUntil, &m.Alt, &m.FileName, &m.Width, &m.Height,
		&m.UploadedBy, &m.CreatedAt, &m.UsedIn, &m.UsedTitle, &m.AvatarOf, &m.ExpiresSoon, &m.Expired)
	return m, notFound(err)
}

// MediaList mengembalikan pustaka media (tanpa foto profil pengguna).
func (p *PG) MediaList(ctx context.Context, filter, q string, limit int) ([]MediaItem, MediaCounts, error) {
	var c MediaCounts
	if err := p.DB.QueryRowContext(ctx, qMediaCounts).Scan(&c.All, &c.Unlicense, &c.Expiring, &c.Video); err != nil {
		return nil, c, err
	}
	rows, err := p.DB.QueryContext(ctx, qMediaList, filter, q, limit)
	if err != nil {
		return nil, c, err
	}
	defer rows.Close()
	out := []MediaItem{}
	for rows.Next() {
		m, err := scanMedia(rows)
		if err != nil {
			return nil, c, err
		}
		out = append(out, m)
	}
	return out, c, rows.Err()
}

// MediaItemByID mengembalikan metadata satu media.
func (p *PG) MediaItemByID(ctx context.Context, id string) (MediaItem, error) {
	return scanMedia(p.DB.QueryRowContext(ctx, qMediaItem, id))
}

// MediaMeta adalah isian detail media.
type MediaMeta struct {
	Title        string  `json:"title"`
	Kind         string  `json:"kind"`
	Source       string  `json:"source"`
	License      string  `json:"license"`
	LicenseUntil *string `json:"license_until"`
	Alt          string  `json:"alt"`
}

// UpdateMediaMeta menyimpan judul, jenis, lisensi, dan teks alternatif.
func (p *PG) UpdateMediaMeta(ctx context.Context, id string, m MediaMeta) error {
	res, err := p.DB.ExecContext(ctx, `UPDATE media SET title = $2, kind = $3, source = $4, license = $5, license_until = $6::date, alt = $7 WHERE id = $1::uuid`,
		id, m.Title, m.Kind, m.Source, m.License, m.LicenseUntil, m.Alt)
	if pgCode(err, "23514") {
		return httpx.Validation(map[string]string{"alt": "Periksa isian (teks alternatif maks. 125 karakter, jenis & lisensi valid)."})
	}
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

// SetMediaFile menyimpan nama berkas & ukuran gambar setelah unggah.
func (p *PG) SetMediaFile(ctx context.Context, id, name, kind string, w, h int) error {
	_, err := p.DB.ExecContext(ctx, `UPDATE media SET file_name = left($2, 200), title = CASE WHEN title = '' THEN left($3, 120) ELSE title END,
  kind = $4, width = nullif($5, 0), height = nullif($6, 0) WHERE id = $1::uuid`, id, name, strings.TrimSuffix(name, fileExt(name)), kind, w, h)
	return err
}

func fileExt(n string) string {
	if i := strings.LastIndexByte(n, '.'); i > 0 {
		return n[i:]
	}
	return ""
}

// DeleteMedia menghapus media yang tidak dipakai artikel atau foto profil.
func (p *PG) DeleteMedia(ctx context.Context, id string) error {
	m, err := p.MediaItemByID(ctx, id)
	if err != nil {
		return err
	}
	if m.UsedIn > 0 || m.AvatarOf != nil {
		return httpx.Conflict("Media masih dipakai artikel/foto profil. Ganti dulu di artikelnya sebelum menghapus.")
	}
	_, err = p.DB.ExecContext(ctx, `DELETE FROM media WHERE id = $1::uuid`, id)
	return err
}

// ======================================================================= log aktivitas

// AuditEntry adalah satu baris log aktivitas.
type AuditEntry struct {
	ID        int64           `json:"id"`
	ActorID   *string         `json:"actor_id"`
	ActorName *string         `json:"actor_name"`
	ActorRole *string         `json:"actor_role"`
	Action    string          `json:"action"`
	Entity    string          `json:"entity"`
	EntityID  *string         `json:"entity_id"`
	Data      json.RawMessage `json:"data"`
	IP        *string         `json:"ip"`
	UserAgent *string         `json:"user_agent"`
	CreatedAt time.Time       `json:"created_at"`
}

// AuditGroups memetakan grup filter ke entitas log.
var AuditGroups = map[string][]string{
	"content": {"article", "category", "tag", "media", "comment"},
	"access":  {"rbac", "staff", "users", "auth"},
	"ads":     {"ads"},
	"system":  {"market", "settings", "system"},
}

const qAudit2 = `
SELECT l.id, l.actor_id, u.full_name, r.name, l.action, l.entity, l.entity_id, l.data::text, l.ip, l.user_agent, l.created_at
FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id LEFT JOIN roles r ON r.key = u.role
WHERE l.created_at > now() - make_interval(days => $1::int)
  AND (cardinality($2::text[]) = 0 OR l.entity = ANY($2::text[]))
  AND ($3::bigint = 0 OR l.id < $3::bigint)
ORDER BY l.id DESC LIMIT $4`
const qAuditCounts = `SELECT entity, count(*)::int FROM audit_log WHERE created_at > now() - make_interval(days => $1::int) GROUP BY entity`

// AuditLog mengembalikan log terbaru (keyset berdasarkan id) dan jumlah per entitas.
func (p *PG) AuditLog(ctx context.Context, days int, entities []string, before int64, limit int) ([]AuditEntry, map[string]int, error) {
	counts := map[string]int{}
	rows, err := p.DB.QueryContext(ctx, qAuditCounts, days)
	if err != nil {
		return nil, nil, err
	}
	for rows.Next() {
		var e string
		var n int
		if err := rows.Scan(&e, &n); err != nil {
			rows.Close()
			return nil, nil, err
		}
		counts[e] = n
	}
	rows.Close()
	rows, err = p.DB.QueryContext(ctx, qAudit2, days, pgTextArray(entities), before, limit)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	out := []AuditEntry{}
	for rows.Next() {
		var a AuditEntry
		var data string
		if err := rows.Scan(&a.ID, &a.ActorID, &a.ActorName, &a.ActorRole, &a.Action, &a.Entity, &a.EntityID, &data, &a.IP, &a.UserAgent, &a.CreatedAt); err != nil {
			return nil, nil, err
		}
		a.Data = json.RawMessage(data)
		out = append(out, a)
	}
	return out, counts, rows.Err()
}

func cmsQueries() map[string]string {
	return map[string]string{
		"admin_categories": qAdminCategories, "create_category": qCreateCategory, "update_category": qUpdateCategory, "cat_slug": qCatSlug,
		"move_articles": qMoveArticles, "cat_redirect": qCatRedirect, "repoint_redirects": qRepointRedirects, "count_cat_articles": qCountCatArticles,
		"delete_category": qDeleteCategory, "reorder": qReorder, "category_menu": qCategoryMenu, "category_redirect": qCategoryRedirect, "admin_tags": qAdminTags, "tag_counts": qTagCounts,
		"mod_comments": qModComments, "mod_counts": qModCounts, "set_comment_status": qSetCommentStatus, "report": qReport,
		"report_count": qReportCount, "flag_if_reported": qFlagIfReported, "media_list": qMediaList, "media_item": qMediaItem,
		"media_counts": qMediaCounts, "audit_list": qAudit2, "audit_counts": qAuditCounts,
	}
}
