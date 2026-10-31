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

// PG adalah implementasi Store di atas PostgreSQL (database/sql; driver didaftarkan di cmd/api).
type PG struct{ DB *sql.DB }

var _ Store = (*PG)(nil)

// ErrDuplicate untuk pelanggaran unique.
var ErrDuplicate = errors.New("duplicate")

func notFound(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return httpx.ErrNotFound
	}
	return err
}

func isUnique(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "SQLSTATE 23505") || strings.Contains(err.Error(), "duplicate key"))
}

func (p *PG) Ping(ctx context.Context) error { return p.DB.PingContext(ctx) }

// ---------------------------------------------------------------- konten

const qCategories = `
SELECT c.id, c.slug, c.name, c.description, c.icon,
       count(a.id) FILTER (WHERE a.status = 'published')::int
FROM categories c LEFT JOIN articles a ON a.category_id = c.id
GROUP BY c.id ORDER BY c.sort_order, c.name`

func (p *PG) Categories(ctx context.Context) ([]Category, error) {
	rows, err := p.DB.QueryContext(ctx, qCategories)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Category{}
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.ArticleCount); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

const cardCols = `a.id, a.slug, a.title, a.excerpt, a.cover_url, a.cover_alt,
       c.id, c.slug, c.name, c.description, c.icon,
       au.name, au.slug, a.is_premium, a.is_breaking, a.reading_minutes, a.view_count, a.published_at`

const cardFrom = `
FROM articles a
JOIN categories c ON c.id = a.category_id
JOIN authors au ON au.id = a.author_id
WHERE a.status = 'published' AND a.published_at <= now()`

type scanner interface{ Scan(...any) error }

func scanCard(s scanner, extra ...any) (ArticleCard, error) {
	var a ArticleCard
	dst := []any{&a.ID, &a.Slug, &a.Title, &a.Excerpt, &a.CoverURL, &a.CoverAlt,
		&a.Category.ID, &a.Category.Slug, &a.Category.Name, &a.Category.Description, &a.Category.Icon,
		&a.AuthorName, &a.AuthorSlug, &a.IsPremium, &a.IsBreaking, &a.ReadingMinutes, &a.ViewCount, &a.PublishedAt}
	err := s.Scan(append(dst, extra...)...)
	return a, err
}

func (p *PG) cards(ctx context.Context, q string, args ...any) ([]ArticleCard, error) {
	rows, err := p.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ArticleCard{}
	for rows.Next() {
		a, err := scanCard(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// BuildArticlesQuery menyusun query daftar artikel dengan parameter berurutan.
func BuildArticlesQuery(f ArticleFilter) (string, []any) {
	var (
		where []string
		args  []any
	)
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(cond, len(args)))
	}
	if f.Category != "" {
		add("c.slug = $%d", f.Category)
	}
	if f.Author != "" {
		add("au.slug = $%d", f.Author)
	}
	if f.Tag != "" {
		add("EXISTS (SELECT 1 FROM article_tags at JOIN tags t ON t.id = at.tag_id WHERE at.article_id = a.id AND t.slug = $%d)", f.Tag)
	}
	if f.Query != "" {
		add("a.search @@ websearch_to_tsquery('simple', $%d)", f.Query)
	}
	if f.Before != nil {
		add("a.published_at < $%d", *f.Before)
	}
	q := "SELECT " + cardCols + cardFrom
	for _, w := range where {
		q += "\n  AND " + w
	}
	args = append(args, f.Limit)
	q += fmt.Sprintf("\nORDER BY a.published_at DESC, a.id\nLIMIT $%d", len(args))
	return q, args
}

func (p *PG) Articles(ctx context.Context, f ArticleFilter) ([]ArticleCard, error) {
	q, args := BuildArticlesQuery(f)
	return p.cards(ctx, q, args...)
}

const qMostRead = `SELECT ` + cardCols + cardFrom + `
  AND a.published_at > now() - interval '7 days'
ORDER BY a.view_count DESC, a.published_at DESC
LIMIT $1`

func (p *PG) MostRead(ctx context.Context, limit int) ([]ArticleCard, error) {
	return p.cards(ctx, qMostRead, limit)
}

const qArticle = `SELECT ` + cardCols + `,
       a.body, a.ai_summary, au.id, au.title, au.bio, au.avatar_url, au.verified,
       coalesce((SELECT json_agg(json_build_object('slug', t.slug, 'name', t.name) ORDER BY t.name)
                 FROM article_tags at JOIN tags t ON t.id = at.tag_id WHERE at.article_id = a.id), '[]')::text,
       coalesce((SELECT json_agg(ai.symbol ORDER BY ai.symbol) FROM article_instruments ai WHERE ai.article_id = a.id), '[]')::text` + cardFrom + `
  AND a.slug = $1`

func (p *PG) ArticleBySlug(ctx context.Context, slug string) (Article, error) {
	var (
		a          Article
		tags, syms string
	)
	card, err := scanCard(p.DB.QueryRowContext(ctx, qArticle, slug),
		&a.Body, &a.AISummary, &a.Author.ID, &a.Author.Title, &a.Author.Bio, &a.Author.AvatarURL, &a.Author.Verified, &tags, &syms)
	if err != nil {
		return a, notFound(err)
	}
	a.ArticleCard = card
	a.Author.Name, a.Author.Slug = card.AuthorName, card.AuthorSlug
	if err := json.Unmarshal([]byte(tags), &a.Tags); err != nil {
		return a, err
	}
	return a, json.Unmarshal([]byte(syms), &a.Symbols)
}

const qRelated = `SELECT ` + cardCols + cardFrom + `
  AND a.slug <> $1
  AND a.category_id = (SELECT category_id FROM articles WHERE slug = $1)
ORDER BY a.published_at DESC
LIMIT $2`

func (p *PG) RelatedArticles(ctx context.Context, slug string, limit int) ([]ArticleCard, error) {
	return p.cards(ctx, qRelated, slug, limit)
}

const qIncView = `UPDATE articles SET view_count = view_count + 1 WHERE slug = $1 AND status = 'published'`

func (p *PG) IncrementView(ctx context.Context, slug string) error {
	_, err := p.DB.ExecContext(ctx, qIncView, slug)
	return err
}

const qAuthor = `SELECT id, slug, name, title, bio, avatar_url, verified FROM authors WHERE slug = $1`

func (p *PG) AuthorBySlug(ctx context.Context, slug string) (Author, error) {
	var a Author
	err := p.DB.QueryRowContext(ctx, qAuthor, slug).Scan(&a.ID, &a.Slug, &a.Name, &a.Title, &a.Bio, &a.AvatarURL, &a.Verified)
	return a, notFound(err)
}

// ---------------------------------------------------------------- pasar, agenda, paket, iklan

const qInstruments = `
SELECT symbol, name, exchange, asset_class, currency, provider_symbol, sector
FROM instruments WHERE active AND (cardinality($1::text[]) = 0 OR symbol = ANY($1::text[]))
ORDER BY asset_class, symbol`

func pgTextArray(v []string) string {
	if len(v) == 0 {
		return "{}"
	}
	b, _ := json.Marshal(v)
	s := string(b)
	return "{" + strings.TrimSuffix(strings.TrimPrefix(s, "["), "]") + "}"
}

func (p *PG) Instruments(ctx context.Context, symbols []string) ([]Instrument, error) {
	rows, err := p.DB.QueryContext(ctx, qInstruments, pgTextArray(symbols))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Instrument{}
	for rows.Next() {
		var i Instrument
		if err := rows.Scan(&i.Symbol, &i.Name, &i.Exchange, &i.AssetClass, &i.Currency, &i.ProviderSymbol, &i.Sector); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

func (p *PG) InstrumentBySymbol(ctx context.Context, symbol string) (Instrument, error) {
	l, err := p.Instruments(ctx, []string{symbol})
	if err != nil {
		return Instrument{}, err
	}
	if len(l) == 0 {
		return Instrument{}, httpx.ErrNotFound
	}
	return l[0], nil
}

const qEvents = `
SELECT id, country, title, impact, scheduled_at, actual, forecast, previous, to_json(related_symbols)::text
FROM economic_events
WHERE scheduled_at >= $1 AND scheduled_at < $2 AND ($3 = '' OR impact = $3)
ORDER BY scheduled_at`

func (p *PG) Events(ctx context.Context, from, to time.Time, impact string) ([]EconomicEvent, error) {
	rows, err := p.DB.QueryContext(ctx, qEvents, from, to, impact)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []EconomicEvent{}
	for rows.Next() {
		var (
			e   EconomicEvent
			rel string
		)
		if err := rows.Scan(&e.ID, &e.Country, &e.Title, &e.Impact, &e.ScheduledAt, &e.Actual, &e.Forecast, &e.Previous, &rel); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(rel), &e.RelatedSymbols); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

const qPlans = `SELECT code, name, price_amount, currency, billing_period, min_seats, features::text FROM subscription_plans WHERE active AND ($1 = '' OR code = $1) ORDER BY price_amount`

func (p *PG) plans(ctx context.Context, code string) ([]Plan, error) {
	rows, err := p.DB.QueryContext(ctx, qPlans, code)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Plan{}
	for rows.Next() {
		var (
			pl   Plan
			feat string
		)
		if err := rows.Scan(&pl.Code, &pl.Name, &pl.PriceAmount, &pl.Currency, &pl.BillingPeriod, &pl.MinSeats, &feat); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(feat), &pl.Features); err != nil {
			return nil, err
		}
		out = append(out, pl)
	}
	return out, rows.Err()
}

func (p *PG) Plans(ctx context.Context) ([]Plan, error) { return p.plans(ctx, "") }

func (p *PG) PlanByCode(ctx context.Context, code string) (Plan, error) {
	l, err := p.plans(ctx, code)
	if err != nil {
		return Plan{}, err
	}
	if len(l) == 0 || code == "" {
		return Plan{}, httpx.ErrNotFound
	}
	return l[0], nil
}

const qAds = `SELECT code, surface, placement, width, height FROM ad_slots WHERE active AND surface = $1 AND $2 = ANY(pages) ORDER BY code`

func (p *PG) AdSlots(ctx context.Context, surface, page string) ([]AdSlot, error) {
	rows, err := p.DB.QueryContext(ctx, qAds, surface, page)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdSlot{}
	for rows.Next() {
		var a AdSlot
		if err := rows.Scan(&a.Code, &a.Surface, &a.Placement, &a.Width, &a.Height); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------- pengguna & sesi

const userCols = `u.id, u.email, u.full_name, u.role, coalesce(u.password_hash, ''), u.created_at,
       (SELECT s.plan_code FROM subscriptions s WHERE s.user_id = u.id AND s.status IN ('active', 'past_due') LIMIT 1),
       u.email_verified_at IS NOT NULL, u.phone_e164`

func scanUser(s scanner) (User, error) {
	var u User
	err := s.Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &u.PasswordHash, &u.CreatedAt, &u.Plan, &u.EmailVerified, &u.Phone)
	return u, notFound(err)
}

const qCreateUser = `INSERT INTO users (email, full_name, password_hash, phone_e164) VALUES ($1, $2, $3, nullif($4, '')) RETURNING id`

// CreateUser membuat akun baru yang belum terverifikasi (email_verified_at kosong).
func (p *PG) CreateUser(ctx context.Context, email, name, hash, phone string) (User, error) {
	var id string
	if err := p.DB.QueryRowContext(ctx, qCreateUser, email, name, hash, phone).Scan(&id); err != nil {
		if isUnique(err) {
			return User{}, ErrDuplicate
		}
		return User{}, err
	}
	return p.UserByID(ctx, id)
}

const qUpdatePendingUser = `UPDATE users SET full_name = $2, password_hash = $3, phone_e164 = nullif($4, ''), updated_at = now()
WHERE id = $1 AND email_verified_at IS NULL AND deleted_at IS NULL`

// UpdatePendingUser: pendaftaran ulang untuk akun yang belum menyelesaikan OTP.
func (p *PG) UpdatePendingUser(ctx context.Context, id, name, hash, phone string) (User, error) {
	if _, err := p.DB.ExecContext(ctx, qUpdatePendingUser, id, name, hash, phone); err != nil {
		return User{}, err
	}
	return p.UserByID(ctx, id)
}

const qMarkVerified = `UPDATE users SET email_verified_at = coalesce(email_verified_at, now()), updated_at = now() WHERE id = $1`

func (p *PG) MarkEmailVerified(ctx context.Context, id string) error {
	_, err := p.DB.ExecContext(ctx, qMarkVerified, id)
	return err
}

const qSetPassword = `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1 AND deleted_at IS NULL`

func (p *PG) SetPassword(ctx context.Context, id, hash string) error {
	_, err := p.DB.ExecContext(ctx, qSetPassword, id, hash)
	return err
}

const qRevokeUserTokens = `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`

// RevokeUserTokens mengeluarkan akun dari semua perangkat (mis. setelah ganti kata sandi).
func (p *PG) RevokeUserTokens(ctx context.Context, id string) error {
	_, err := p.DB.ExecContext(ctx, qRevokeUserTokens, id)
	return err
}

const qUserByEmail = `SELECT ` + userCols + ` FROM users u WHERE lower(u.email) = lower($1) AND u.deleted_at IS NULL`
const qUserByID = `SELECT ` + userCols + ` FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`

func (p *PG) UserByEmail(ctx context.Context, email string) (User, error) {
	return scanUser(p.DB.QueryRowContext(ctx, qUserByEmail, email))
}
func (p *PG) UserByID(ctx context.Context, id string) (User, error) {
	return scanUser(p.DB.QueryRowContext(ctx, qUserByID, id))
}

const qSaveRefresh = `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip, expires_at) VALUES ($1, $2, $3, nullif($4, '')::inet, $5)`

func (p *PG) SaveRefreshToken(ctx context.Context, userID string, hash []byte, ua, ip string, exp time.Time) error {
	_, err := p.DB.ExecContext(ctx, qSaveRefresh, userID, hash, ua, ip, exp)
	return err
}

const qConsumeRefresh = `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() RETURNING user_id`

func (p *PG) ConsumeRefreshToken(ctx context.Context, hash []byte) (string, error) {
	var id string
	err := p.DB.QueryRowContext(ctx, qConsumeRefresh, hash).Scan(&id)
	return id, notFound(err)
}

const qRevokeRefresh = `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`

func (p *PG) RevokeRefreshToken(ctx context.Context, hash []byte) error {
	_, err := p.DB.ExecContext(ctx, qRevokeRefresh, hash)
	return err
}

// ---------------------------------------------------------------- watchlist, alert, interaksi

const qDefaultWatchlist = `
WITH ins AS (
  INSERT INTO watchlists (user_id) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM watchlists WHERE user_id = $1) RETURNING id
)
SELECT id FROM (SELECT id, 0 AS o FROM ins UNION ALL SELECT id, 1 FROM (SELECT id FROM watchlists WHERE user_id = $1 ORDER BY sort_order, created_at LIMIT 1) w) x
ORDER BY o LIMIT 1`

func (p *PG) defaultWatchlist(ctx context.Context, userID string) (string, error) {
	var id string
	err := p.DB.QueryRowContext(ctx, qDefaultWatchlist, userID).Scan(&id)
	return id, err
}

const qWatchlist = `
SELECT i.symbol, i.name, i.exchange, i.asset_class, i.currency, i.provider_symbol, i.sector, wi.added_at
FROM watchlists w JOIN watchlist_items wi ON wi.watchlist_id = w.id JOIN instruments i ON i.symbol = wi.symbol
WHERE w.user_id = $1 ORDER BY wi.sort_order, wi.added_at`

func (p *PG) Watchlist(ctx context.Context, userID string) ([]WatchItem, error) {
	rows, err := p.DB.QueryContext(ctx, qWatchlist, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WatchItem{}
	for rows.Next() {
		var w WatchItem
		if err := rows.Scan(&w.Symbol, &w.Name, &w.Exchange, &w.AssetClass, &w.Currency, &w.ProviderSymbol, &w.Sector, &w.AddedAt); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

const qAddWatch = `INSERT INTO watchlist_items (watchlist_id, symbol) VALUES ($1, $2) ON CONFLICT DO NOTHING`

func (p *PG) AddToWatchlist(ctx context.Context, userID, symbol string) error {
	wl, err := p.defaultWatchlist(ctx, userID)
	if err != nil {
		return err
	}
	_, err = p.DB.ExecContext(ctx, qAddWatch, wl, symbol)
	return err
}

const qRemoveWatch = `DELETE FROM watchlist_items wi USING watchlists w WHERE wi.watchlist_id = w.id AND w.user_id = $1 AND wi.symbol = $2`

func (p *PG) RemoveFromWatchlist(ctx context.Context, userID, symbol string) error {
	_, err := p.DB.ExecContext(ctx, qRemoveWatch, userID, symbol)
	return err
}

const alertCols = `id, symbol, condition, threshold::float8, frequency, to_json(channels)::text, note, active, created_at`

func scanAlert(s scanner) (Alert, error) {
	var (
		a  Alert
		ch string
	)
	if err := s.Scan(&a.ID, &a.Symbol, &a.Condition, &a.Threshold, &a.Frequency, &ch, &a.Note, &a.Active, &a.CreatedAt); err != nil {
		return a, notFound(err)
	}
	return a, json.Unmarshal([]byte(ch), &a.Channels)
}

const qAlerts = `SELECT ` + alertCols + ` FROM price_alerts WHERE user_id = $1 ORDER BY created_at DESC`

func (p *PG) Alerts(ctx context.Context, userID string) ([]Alert, error) {
	rows, err := p.DB.QueryContext(ctx, qAlerts, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Alert{}
	for rows.Next() {
		a, err := scanAlert(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

const qCreateAlert = `
INSERT INTO price_alerts (user_id, symbol, condition, threshold, frequency, channels, note)
VALUES ($1, $2, $3, $4, $5, $6::text[], $7)
RETURNING ` + alertCols

func (p *PG) CreateAlert(ctx context.Context, userID string, a Alert) (Alert, error) {
	return scanAlert(p.DB.QueryRowContext(ctx, qCreateAlert, userID, a.Symbol, a.Condition, a.Threshold, a.Frequency, pgTextArray(a.Channels), a.Note))
}

const qDeleteAlert = `DELETE FROM price_alerts WHERE id = $1 AND user_id = $2`

func (p *PG) DeleteAlert(ctx context.Context, userID, id string) error {
	res, err := p.DB.ExecContext(ctx, qDeleteAlert, id, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

const qBookmarkOn = `INSERT INTO bookmarks (user_id, article_id) SELECT $1, id FROM articles WHERE slug = $2 ON CONFLICT DO NOTHING`
const qBookmarkOff = `DELETE FROM bookmarks b USING articles a WHERE b.article_id = a.id AND b.user_id = $1 AND a.slug = $2`

func (p *PG) SetBookmark(ctx context.Context, userID, slug string, on bool) error {
	q := qBookmarkOff
	if on {
		q = qBookmarkOn
	}
	_, err := p.DB.ExecContext(ctx, q, userID, slug)
	return err
}

const qBookmarks = `SELECT ` + cardCols + cardFrom + `
  AND a.id IN (SELECT article_id FROM bookmarks WHERE user_id = $1)
ORDER BY a.published_at DESC`

func (p *PG) Bookmarks(ctx context.Context, userID string) ([]ArticleCard, error) {
	return p.cards(ctx, qBookmarks, userID)
}

const qReact = `
INSERT INTO reactions (user_id, article_id, kind) SELECT $1, id, $3 FROM articles WHERE slug = $2
ON CONFLICT (user_id, article_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = now()`

func (p *PG) React(ctx context.Context, userID, slug, kind string) error {
	_, err := p.DB.ExecContext(ctx, qReact, userID, slug, kind)
	return err
}

const qReactions = `
SELECT k.kind, count(r.user_id)::int
FROM unnest(ARRAY['bullish', 'bearish', 'informative', 'favorite']) AS k(kind)
LEFT JOIN reactions r ON r.kind = k.kind AND r.article_id = (SELECT id FROM articles WHERE slug = $1)
GROUP BY k.kind ORDER BY array_position(ARRAY['bullish', 'bearish', 'informative', 'favorite'], k.kind)`

func (p *PG) Reactions(ctx context.Context, slug string) ([]ReactionCount, error) {
	rows, err := p.DB.QueryContext(ctx, qReactions, slug)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ReactionCount{}
	for rows.Next() {
		var r ReactionCount
		if err := rows.Scan(&r.Kind, &r.Count); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

const qComments = `
SELECT cm.id, u.full_name, cm.body, cm.created_at
FROM comments cm JOIN users u ON u.id = cm.user_id JOIN articles a ON a.id = cm.article_id
WHERE a.slug = $1 AND cm.status = 'visible'
ORDER BY cm.created_at DESC LIMIT $2`

func (p *PG) Comments(ctx context.Context, slug string, limit int) ([]Comment, error) {
	rows, err := p.DB.QueryContext(ctx, qComments, slug, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Comment{}
	for rows.Next() {
		var c Comment
		if err := rows.Scan(&c.ID, &c.UserName, &c.Body, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

const qAddComment = `
WITH ins AS (
  INSERT INTO comments (article_id, user_id, body)
  SELECT a.id, $1, $3 FROM articles a WHERE a.slug = $2 AND a.status = 'published'
  RETURNING id, user_id, body, created_at
)
SELECT ins.id, u.full_name, ins.body, ins.created_at FROM ins JOIN users u ON u.id = ins.user_id`

func (p *PG) AddComment(ctx context.Context, userID, slug, body string) (Comment, error) {
	var c Comment
	err := p.DB.QueryRowContext(ctx, qAddComment, userID, slug, body).Scan(&c.ID, &c.UserName, &c.Body, &c.CreatedAt)
	return c, notFound(err)
}

// ---------------------------------------------------------------- tagihan

const qCreateInvoice = `
WITH sub AS (
  INSERT INTO subscriptions (user_id, plan_code, status) VALUES ($1, $2, 'pending') RETURNING id
)
INSERT INTO invoices (number, user_id, subscription_id, subtotal, discount, tax_rate, tax_amount, total, currency, promo_code)
SELECT 'INV/OP/' || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY/MM') || '/' || lpad(nextval('invoice_number_seq')::text, 6, '0'),
       $1, sub.id, $3, $4, $5, $6, $7, $8, $9
FROM sub
RETURNING id, number, subtotal, discount, tax_rate::float8, tax_amount, total, currency, promo_code, status, issued_at`

func (p *PG) CreateInvoice(ctx context.Context, userID string, inv Invoice) (Invoice, error) {
	out := Invoice{PlanCode: inv.PlanCode}
	err := p.DB.QueryRowContext(ctx, qCreateInvoice, userID, inv.PlanCode, inv.Subtotal, inv.Discount, inv.TaxRate, inv.TaxAmount, inv.Total, inv.Currency, inv.PromoCode).
		Scan(&out.ID, &out.Number, &out.Subtotal, &out.Discount, &out.TaxRate, &out.TaxAmount, &out.Total, &out.Currency, &out.PromoCode, &out.Status, &out.IssuedAt)
	return out, err
}

// AllQueries dipakai uji integrasi untuk memvalidasi sintaks SQL terhadap PostgreSQL.
func AllQueries() map[string]string {
	q, _ := BuildArticlesQuery(ArticleFilter{Category: "x", Tag: "y", Author: "z", Query: "q", Before: &time.Time{}, Limit: 10})
	out := map[string]string{
		"categories": qCategories, "articles": q, "most_read": qMostRead, "article": qArticle, "related": qRelated,
		"inc_view": qIncView, "author": qAuthor, "instruments": qInstruments, "events": qEvents, "plans": qPlans, "ads": qAds,
		"create_user": qCreateUser, "update_pending_user": qUpdatePendingUser, "mark_verified": qMarkVerified, "set_password": qSetPassword,
		"revoke_user_tokens": qRevokeUserTokens, "search_instruments": qSearchInstruments, "search_articles": qSearchArticles,
		"search_authors": qSearchAuthors, "search_tags": qSearchTags, "user_by_email": qUserByEmail, "user_by_id": qUserByID, "save_refresh": qSaveRefresh,
		"consume_refresh": qConsumeRefresh, "revoke_refresh": qRevokeRefresh, "default_watchlist": qDefaultWatchlist,
		"watchlist": qWatchlist, "add_watch": qAddWatch, "remove_watch": qRemoveWatch, "alerts": qAlerts, "create_alert": qCreateAlert,
		"delete_alert": qDeleteAlert, "bookmark_on": qBookmarkOn, "bookmark_off": qBookmarkOff, "bookmarks": qBookmarks,
		"react": qReact, "reactions": qReactions, "comments": qComments, "add_comment": qAddComment, "create_invoice": qCreateInvoice,
	}
	out["market_cache_get"], out["market_cache_put"] = qMarketCacheGet, qMarketCachePut
	for k, v := range adminQueries() {
		out[k] = v
	}
	return out
}

// ---------------------------------------------------------------- pencarian

const qSearchInstruments = `
SELECT i.symbol, i.name, i.exchange, i.asset_class, i.currency, i.provider_symbol, i.sector
FROM instruments i
WHERE i.active AND (i.symbol ILIKE $1 || '%' OR i.name ILIKE '%' || $1 || '%' OR replace(i.provider_symbol, '/', '') ILIKE $1 || '%')
ORDER BY (upper(i.symbol) = upper($1)) DESC, (i.symbol ILIKE $1 || '%') DESC, i.symbol
LIMIT $2`

const qSearchArticles = `SELECT ` + cardCols + cardFrom + `
  AND (a.search @@ websearch_to_tsquery('simple', $1) OR a.title ILIKE '%' || $1 || '%' OR a.excerpt ILIKE '%' || $1 || '%'
       OR EXISTS (SELECT 1 FROM article_instruments ai WHERE ai.article_id = a.id AND ai.symbol ILIKE $1))
ORDER BY (a.title ILIKE '%' || $1 || '%') DESC, a.published_at DESC
LIMIT $2`

const qSearchAuthors = `
SELECT au.id, au.slug, au.name, coalesce(au.title, ''), au.avatar_url, au.verified,
       (SELECT count(*) FROM articles a WHERE a.author_id = au.id AND a.status = 'published')
FROM authors au
WHERE au.name ILIKE '%' || $1 || '%' OR au.title ILIKE '%' || $1 || '%'
   OR EXISTS (SELECT 1 FROM articles a WHERE a.author_id = au.id AND a.status = 'published' AND a.title ILIKE '%' || $1 || '%')
ORDER BY (au.name ILIKE '%' || $1 || '%') DESC, au.name
LIMIT $2`

const qSearchTags = `
SELECT t.slug, t.name FROM tags t
WHERE t.name ILIKE '%' || $1 || '%' OR t.slug ILIKE '%' || $1 || '%'
   OR EXISTS (SELECT 1 FROM article_tags at JOIN articles a ON a.id = at.article_id
              WHERE at.tag_id = t.id AND a.status = 'published' AND a.title ILIKE '%' || $1 || '%')
ORDER BY t.name
LIMIT $2`

// Search mencari aset, berita, penulis, dan topik sekaligus.
func (p *PG) Search(ctx context.Context, q string, limit int) (SearchResult, error) {
	out := SearchResult{Instruments: []Instrument{}, Articles: []ArticleCard{}, Authors: []AuthorHit{}, Tags: []Tag{}}
	// Karakter wildcard LIKE dari pengguna diperlakukan sebagai teks biasa.
	q = strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(q)
	rows, err := p.DB.QueryContext(ctx, qSearchInstruments, q, limit)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var i Instrument
		if err := rows.Scan(&i.Symbol, &i.Name, &i.Exchange, &i.AssetClass, &i.Currency, &i.ProviderSymbol, &i.Sector); err != nil {
			rows.Close()
			return out, err
		}
		out.Instruments = append(out.Instruments, i)
	}
	rows.Close()
	if rows, err = p.DB.QueryContext(ctx, qSearchArticles, q, limit*3); err != nil {
		return out, err
	}
	for rows.Next() {
		c, err := scanCard(rows)
		if err != nil {
			rows.Close()
			return out, err
		}
		out.Articles = append(out.Articles, c)
	}
	rows.Close()
	if rows, err = p.DB.QueryContext(ctx, qSearchAuthors, q, limit); err != nil {
		return out, err
	}
	for rows.Next() {
		var a AuthorHit
		if err := rows.Scan(&a.ID, &a.Slug, &a.Name, &a.Title, &a.AvatarURL, &a.Verified, &a.ArticleCount); err != nil {
			rows.Close()
			return out, err
		}
		out.Authors = append(out.Authors, a)
	}
	rows.Close()
	if rows, err = p.DB.QueryContext(ctx, qSearchTags, q, limit); err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.Slug, &t.Name); err != nil {
			return out, err
		}
		out.Tags = append(out.Tags, t)
	}
	return out, rows.Err()
}
