package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
)

// AdminArticle adalah artikel dari sudut pandang redaksi (semua status).
type AdminArticle struct {
	ID             string     `json:"id"`
	Slug           string     `json:"slug"`
	Title          string     `json:"title"`
	Excerpt        string     `json:"excerpt"`
	Body           string     `json:"body"`
	CoverURL       *string    `json:"cover_url"`
	CategorySlug   string     `json:"category_slug"`
	CategoryName   string     `json:"category_name"`
	AuthorName     string     `json:"author_name"`
	AuthorUserID   *string    `json:"author_user_id"`
	CreatedBy      *string    `json:"created_by"`
	Status         string     `json:"status"`
	IsPremium      bool       `json:"is_premium"`
	IsBreaking     bool       `json:"is_breaking"`
	ReadingMinutes int        `json:"reading_minutes"`
	ViewCount      int64      `json:"view_count"`
	Symbols        []string   `json:"symbols"`
	ReviewNote     string     `json:"review_note"`
	PublishedAt    *time.Time `json:"published_at"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// OwnedBy: artikel dibuat oleh pengguna ini (atau ditulis atas nama profil penulisnya).
func (a AdminArticle) OwnedBy(userID string) bool {
	return (a.CreatedBy != nil && *a.CreatedBy == userID) || (a.AuthorUserID != nil && *a.AuthorUserID == userID)
}

type AdminArticleFilter struct {
	Status string // kosong = semua
	Query  string
	Mine   string // ID pengguna; kosong = semua penulis
	Limit  int
}

// ArticleInput adalah isi form "Tulis artikel".
type ArticleInput struct {
	Title          string
	Excerpt        string
	Body           string
	CategorySlug   string
	CoverURL       *string
	IsPremium      bool
	IsBreaking     bool
	Symbols        []string
	Status         string
	PublishedAt    *time.Time
	ReadingMinutes int
}

// ErrSlugTaken dikembalikan ketika slug bentrok (dipakai untuk mencoba akhiran lain).
var ErrSlugTaken = errors.New("slug sudah dipakai")

const adminCols = `a.id, a.slug, a.title, a.excerpt, a.body, a.cover_url, c.slug, c.name, au.name, au.user_id, a.created_by,
       a.status, a.is_premium, a.is_breaking, a.reading_minutes, a.view_count,
       coalesce((SELECT json_agg(ai.symbol ORDER BY ai.symbol) FROM article_instruments ai WHERE ai.article_id = a.id), '[]')::text,
       a.review_note, a.published_at, a.created_at, a.updated_at`

const adminFrom = `
FROM articles a
JOIN categories c ON c.id = a.category_id
JOIN authors au ON au.id = a.author_id`

func scanAdmin(s scanner) (AdminArticle, error) {
	var (
		a    AdminArticle
		syms string
	)
	err := s.Scan(&a.ID, &a.Slug, &a.Title, &a.Excerpt, &a.Body, &a.CoverURL, &a.CategorySlug, &a.CategoryName, &a.AuthorName,
		&a.AuthorUserID, &a.CreatedBy, &a.Status, &a.IsPremium, &a.IsBreaking, &a.ReadingMinutes, &a.ViewCount, &syms,
		&a.ReviewNote, &a.PublishedAt, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return a, err
	}
	return a, json.Unmarshal([]byte(syms), &a.Symbols)
}

// BuildAdminArticlesQuery menyusun daftar artikel untuk redaksi.
func BuildAdminArticlesQuery(f AdminArticleFilter) (string, []any) {
	var (
		where []string
		args  []any
	)
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "$?", fmt.Sprintf("$%d", len(args))))
	}
	switch f.Status {
	case "":
	case "scheduled":
		where = append(where, "a.status = 'published' AND a.published_at > now()")
	case "published":
		where = append(where, "a.status = 'published' AND a.published_at <= now()")
	case "revision":
		where = append(where, "a.status = 'draft' AND a.review_note <> ''")
	case "breaking":
		where = append(where, "a.is_breaking AND a.status <> 'archived'")
	default:
		add("a.status = $?", f.Status)
	}
	if f.Mine != "" {
		add("(a.created_by = $? OR au.user_id = $?)", f.Mine)
	}
	if f.Query != "" {
		add("a.search @@ websearch_to_tsquery('simple', $?)", f.Query)
	}
	q := "SELECT " + adminCols + adminFrom
	if len(where) > 0 {
		q += "\nWHERE " + strings.Join(where, "\n  AND ")
	}
	args = append(args, f.Limit)
	q += fmt.Sprintf("\nORDER BY a.updated_at DESC, a.id\nLIMIT $%d", len(args))
	return q, args
}

func (p *PG) AdminArticles(ctx context.Context, f AdminArticleFilter) ([]AdminArticle, error) {
	q, args := BuildAdminArticlesQuery(f)
	rows, err := p.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminArticle{}
	for rows.Next() {
		a, err := scanAdmin(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

const qAdminArticle = `SELECT ` + adminCols + adminFrom + `
WHERE a.id = $1`

func (p *PG) AdminArticle(ctx context.Context, id string) (AdminArticle, error) {
	a, err := scanAdmin(p.DB.QueryRowContext(ctx, qAdminArticle, id))
	return a, notFound(err)
}

const qAdminCounts = `SELECT
  count(*) FILTER (WHERE status = 'draft')::int,
  count(*) FILTER (WHERE status = 'draft' AND review_note <> '')::int,
  count(*) FILTER (WHERE is_breaking AND status <> 'archived')::int,
  count(*) FILTER (WHERE status = 'review')::int,
  count(*) FILTER (WHERE status = 'published' AND published_at > now())::int,
  count(*) FILTER (WHERE status = 'published' AND published_at <= now())::int,
  count(*) FILTER (WHERE status = 'archived')::int
FROM articles a
WHERE $1::text = '' OR a.created_by::text = $1::text
   OR a.author_id IN (SELECT id FROM authors WHERE user_id::text = $1::text)`

// AdminCounts menghitung artikel per status untuk tab "Konten" (mine ≠ "" → hanya milik pengguna itu).
func (p *PG) AdminCounts(ctx context.Context, mine string) (map[string]int, error) {
	var d, rev, brk, r, s, pub, arc int
	if err := p.DB.QueryRowContext(ctx, qAdminCounts, mine).Scan(&d, &rev, &brk, &r, &s, &pub, &arc); err != nil {
		return nil, err
	}
	return map[string]int{"draft": d, "revision": rev, "breaking": brk, "review": r, "scheduled": s, "published": pub,
		"archived": arc, "all": d + r + s + pub + arc}, nil
}

const qAuthorForUser = `SELECT id FROM authors WHERE user_id = $1`
const qCreateAuthorForUser = `INSERT INTO authors (user_id, slug, name, title, verified)
SELECT u.id, $2, u.full_name, CASE u.role WHEN 'admin' THEN 'Redaksi' WHEN 'editor' THEN 'Editor' ELSE 'Penulis' END, true
FROM users u WHERE u.id = $1
ON CONFLICT (slug) DO NOTHING
RETURNING id`
const qCategoryID = `SELECT id FROM categories WHERE slug = $1`

// authorForUser mengembalikan profil penulis milik pengguna, membuatnya bila belum ada.
func authorForUser(ctx context.Context, tx *sql.Tx, userID, baseSlug string) (string, error) {
	var id string
	err := tx.QueryRowContext(ctx, qAuthorForUser, userID).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	for i := 0; i < 20; i++ {
		slug := baseSlug
		if i > 0 {
			slug = fmt.Sprintf("%s-%d", baseSlug, i+1)
		}
		err = tx.QueryRowContext(ctx, qCreateAuthorForUser, userID, slug).Scan(&id)
		if err == nil {
			return id, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return "", err
		}
	}
	return "", errors.New("gagal membuat profil penulis")
}

func categoryID(ctx context.Context, tx *sql.Tx, slug string) (string, error) {
	var id string
	if err := tx.QueryRowContext(ctx, qCategoryID, slug).Scan(&id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", httpx.Validation(map[string]string{"category": "Kategori tidak dikenal."})
		}
		return "", err
	}
	return id, nil
}

const qSymbolsKnown = `SELECT count(*)::int FROM instruments WHERE symbol = ANY($1::text[])`
const qClearSymbols = `DELETE FROM article_instruments WHERE article_id = $1`
const qAddSymbols = `INSERT INTO article_instruments (article_id, symbol) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`

func setSymbols(ctx context.Context, tx *sql.Tx, articleID string, syms []string) error {
	if len(syms) > 0 {
		var n int
		if err := tx.QueryRowContext(ctx, qSymbolsKnown, pgTextArray(syms)).Scan(&n); err != nil {
			return err
		}
		if n != len(syms) {
			return httpx.Validation(map[string]string{"symbols": "Ada ticker yang tidak dikenal."})
		}
	}
	if _, err := tx.ExecContext(ctx, qClearSymbols, articleID); err != nil {
		return err
	}
	if len(syms) == 0 {
		return nil
	}
	_, err := tx.ExecContext(ctx, qAddSymbols, articleID, pgTextArray(syms))
	return err
}

const qInsertArticle = `INSERT INTO articles (slug, title, excerpt, body, cover_url, cover_alt, category_id, author_id, status,
  is_premium, is_breaking, reading_minutes, published_at, created_by)
VALUES ($1, $2, $3, $4, $5, $2, $6, $7, $8, $9, $10, $11, $12, $13)
ON CONFLICT (slug) DO NOTHING
RETURNING id`

// CreateArticle menyimpan artikel baru atas nama pengguna. slugFn(i) menghasilkan kandidat slug ke-i.
func (p *PG) CreateArticle(ctx context.Context, userID, authorSlug string, in ArticleInput, slugFn func(i int) string) (AdminArticle, error) {
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return AdminArticle{}, err
	}
	defer tx.Rollback() //nolint:errcheck
	catID, err := categoryID(ctx, tx, in.CategorySlug)
	if err != nil {
		return AdminArticle{}, err
	}
	authorID, err := authorForUser(ctx, tx, userID, authorSlug)
	if err != nil {
		return AdminArticle{}, err
	}
	var id string
	for i := 0; i < 50; i++ {
		err = tx.QueryRowContext(ctx, qInsertArticle, slugFn(i), in.Title, in.Excerpt, in.Body, in.CoverURL, catID, authorID,
			in.Status, in.IsPremium, in.IsBreaking, in.ReadingMinutes, in.PublishedAt, userID).Scan(&id)
		if err == nil {
			break
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return AdminArticle{}, err
		}
	}
	if id == "" {
		return AdminArticle{}, httpx.Conflict("Tidak bisa membuat slug unik untuk judul ini.")
	}
	if err := setSymbols(ctx, tx, id, in.Symbols); err != nil {
		return AdminArticle{}, err
	}
	if err := tx.Commit(); err != nil {
		return AdminArticle{}, err
	}
	return p.AdminArticle(ctx, id)
}

const qUpdateArticle = `UPDATE articles SET title = $2, excerpt = $3, body = $4, cover_url = $5, cover_alt = $2, category_id = $6,
  status = $7, is_premium = $8, is_breaking = $9, reading_minutes = $10, published_at = $11
WHERE id = $1`

func (p *PG) UpdateArticle(ctx context.Context, id string, in ArticleInput) (AdminArticle, error) {
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return AdminArticle{}, err
	}
	defer tx.Rollback() //nolint:errcheck
	catID, err := categoryID(ctx, tx, in.CategorySlug)
	if err != nil {
		return AdminArticle{}, err
	}
	res, err := tx.ExecContext(ctx, qUpdateArticle, id, in.Title, in.Excerpt, in.Body, in.CoverURL, catID, in.Status,
		in.IsPremium, in.IsBreaking, in.ReadingMinutes, in.PublishedAt)
	if err != nil {
		return AdminArticle{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return AdminArticle{}, httpx.ErrNotFound
	}
	if err := setSymbols(ctx, tx, id, in.Symbols); err != nil {
		return AdminArticle{}, err
	}
	if err := tx.Commit(); err != nil {
		return AdminArticle{}, err
	}
	return p.AdminArticle(ctx, id)
}

const qSetStatus = `UPDATE articles SET status = $2, published_at = $3, review_note = $4 WHERE id = $1`

// SetArticleStatus mengubah status (terbit, tolak ke draf, arsip).
func (p *PG) SetArticleStatus(ctx context.Context, id, status string, publishedAt *time.Time, note string) error {
	res, err := p.DB.ExecContext(ctx, qSetStatus, id, status, publishedAt, note)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

const qDeleteArticle = `DELETE FROM articles WHERE id = $1`

// DeleteArticle menghapus artikel beserta ticker, tag, komentar, reaksi & bookmark-nya (ON DELETE CASCADE).
func (p *PG) DeleteArticle(ctx context.Context, id string) error {
	res, err := p.DB.ExecContext(ctx, qDeleteArticle, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

const qCreateMedia = `INSERT INTO media (mime, size, bytes, uploaded_by) VALUES ($1, $2, $3, $4) RETURNING id`
const qMedia = `SELECT mime, bytes FROM media WHERE id = $1`

func (p *PG) CreateMedia(ctx context.Context, userID, mime string, data []byte) (string, error) {
	var id string
	err := p.DB.QueryRowContext(ctx, qCreateMedia, mime, len(data), data, userID).Scan(&id)
	return id, err
}

func (p *PG) Media(ctx context.Context, id string) (string, []byte, error) {
	var (
		mime string
		data []byte
	)
	err := p.DB.QueryRowContext(ctx, qMedia, id).Scan(&mime, &data)
	return mime, data, notFound(err)
}

const qAudit = `INSERT INTO audit_log (actor_id, action, entity, entity_id, data) VALUES ($1, $2, $3, $4, $5)`

// Audit mencatat tindakan redaksi ke log aktivitas.
func (p *PG) Audit(ctx context.Context, actorID, action, entity, entityID string, data any) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	_, err = p.DB.ExecContext(ctx, qAudit, actorID, action, entity, entityID, string(b))
	return err
}

func adminQueries() map[string]string {
	q, _ := BuildAdminArticlesQuery(AdminArticleFilter{Status: "review", Query: "q", Mine: "00000000-0000-0000-0000-000000000000", Limit: 5})
	q2, _ := BuildAdminArticlesQuery(AdminArticleFilter{Status: "scheduled", Limit: 5})
	return map[string]string{
		"admin_articles": q, "admin_articles_sched": q2, "admin_article": qAdminArticle, "admin_counts": qAdminCounts,
		"author_for_user": qAuthorForUser, "create_author_for_user": qCreateAuthorForUser, "category_id": qCategoryID,
		"symbols_known": qSymbolsKnown, "clear_symbols": qClearSymbols, "add_symbols": qAddSymbols, "insert_article": qInsertArticle,
		"update_article": qUpdateArticle, "set_status": qSetStatus, "delete_article": qDeleteArticle, "create_media": qCreateMedia, "media": qMedia, "audit": qAudit,
	}
}
