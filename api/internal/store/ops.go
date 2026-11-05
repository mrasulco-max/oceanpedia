package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
)

// ======================================================================= pengguna

// AdminUser adalah baris daftar pengguna di panel admin.
type AdminUser struct {
	ID           string     `json:"id"`
	Email        string     `json:"email"`
	FullName     string     `json:"full_name"`
	Role         string     `json:"role"`
	RoleName     string     `json:"role_name"`
	IsStaff      bool       `json:"is_staff"`
	Status       string     `json:"status"` // active | warned | blocked
	BlockedAt    *time.Time `json:"blocked_at"`
	BlockedUntil *time.Time `json:"blocked_until"`
	BlockReason  string     `json:"block_reason"`
	CreatedAt    time.Time  `json:"created_at"`
	LastLoginAt  *time.Time `json:"last_login_at"`
	Verified     bool       `json:"verified"`
	Agents       []string   `json:"-"`
	Platforms    []string   `json:"platforms"`
	Comments     int        `json:"comments"`
	Reported     int        `json:"reported"`
	Watchlist    int        `json:"watchlist"`
	Bookmarks    int        `json:"bookmarks"`
	Warnings     int        `json:"warnings"`
	TOTP         bool       `json:"totp"` // aplikasi autentikator aktif
}

// UserStats adalah ringkasan kartu atas halaman Pengguna.
type UserStats struct {
	Total        int `json:"total"`
	NewMonth     int `json:"new_month"`
	PrevMonth    int `json:"prev_month"`
	Active24h    int `json:"active_24h"`
	Readers      int `json:"readers"`
	Staff        int `json:"staff"`
	Reported     int `json:"reported"`
	Blocked      int `json:"blocked"`
	BlockedPerm  int `json:"blocked_permanent"`
	BlockedTemp  int `json:"blocked_temporary"`
	WarningsWeek int `json:"warnings_week"`
}

// UserDay adalah aktivitas satu hari (grid 3 minggu di panel detail).
type UserDay struct {
	Day      string `json:"day"`
	Active   bool   `json:"active"`
	Reported bool   `json:"reported"`
}

// UserWarning adalah peringatan yang pernah dikirim.
type UserWarning struct {
	Reason    string    `json:"reason"`
	IssuedBy  *string   `json:"issued_by_name"`
	CreatedAt time.Time `json:"created_at"`
}

// blockedNow: blokir permanen (tanpa batas) atau sementara yang belum lewat.
const blockedNow = `(u.blocked_at IS NOT NULL AND (u.blocked_until IS NULL OR u.blocked_until > now()))`

const adminUserCols = `u.id, u.email, u.full_name, u.role, r.name, r.is_staff,
  CASE WHEN ` + blockedNow + ` THEN 'blocked'
       WHEN EXISTS (SELECT 1 FROM user_warnings w WHERE w.user_id = u.id AND w.created_at > now() - interval '30 days') THEN 'warned'
       ELSE 'active' END,
  CASE WHEN ` + blockedNow + ` THEN u.blocked_at END, CASE WHEN ` + blockedNow + ` THEN u.blocked_until END, u.block_reason,
  u.created_at, coalesce(u.last_login_at, (SELECT max(t.created_at) FROM refresh_tokens t WHERE t.user_id = u.id)), u.email_verified_at IS NOT NULL,
  coalesce((SELECT json_agg(DISTINCT t.user_agent) FROM (SELECT user_agent FROM refresh_tokens WHERE user_id = u.id AND user_agent IS NOT NULL ORDER BY created_at DESC LIMIT 20) t), '[]')::text,
  (SELECT count(*) FROM comments c WHERE c.user_id = u.id)::int,
  (SELECT count(DISTINCT cr.comment_id) FROM comment_reports cr JOIN comments c ON c.id = cr.comment_id WHERE c.user_id = u.id)::int,
  (SELECT count(*) FROM watchlist_items wi JOIN watchlists wl ON wl.id = wi.watchlist_id WHERE wl.user_id = u.id)::int,
  (SELECT count(*) FROM bookmarks b WHERE b.user_id = u.id)::int,
  (SELECT count(*) FROM user_warnings w WHERE w.user_id = u.id)::int,
  COALESCE(u.preferences->>'totp_secret', '') <> ''`

const qAdminUsers = `SELECT ` + adminUserCols + `
FROM users u JOIN roles r ON r.key = u.role
WHERE u.deleted_at IS NULL
  AND ($1::text = '' OR u.email ILIKE '%' || $1::text || '%' OR u.full_name ILIKE '%' || $1::text || '%')
  AND CASE $2::text
        WHEN 'staff' THEN r.is_staff
        WHEN 'reader' THEN NOT r.is_staff
        WHEN 'reported' THEN EXISTS (SELECT 1 FROM comment_reports cr JOIN comments c ON c.id = cr.comment_id WHERE c.user_id = u.id AND cr.created_at > now() - interval '30 days')
        WHEN 'blocked' THEN ` + blockedNow + `
        ELSE true END
ORDER BY coalesce(u.last_login_at, u.created_at) DESC
LIMIT $3`

const qAdminUser = `SELECT ` + adminUserCols + ` FROM users u JOIN roles r ON r.key = u.role WHERE u.id = $1::uuid AND u.deleted_at IS NULL`

const qUserStats = `SELECT
  count(*)::int,
  count(*) FILTER (WHERE u.created_at >= date_trunc('month', now()))::int,
  count(*) FILTER (WHERE u.created_at >= date_trunc('month', now()) - interval '1 month' AND u.created_at < date_trunc('month', now()))::int,
  count(*) FILTER (WHERE coalesce(u.last_login_at, (SELECT max(t.created_at) FROM refresh_tokens t WHERE t.user_id = u.id)) > now() - interval '24 hours')::int,
  count(*) FILTER (WHERE NOT r.is_staff)::int,
  count(*) FILTER (WHERE r.is_staff)::int,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM comment_reports cr JOIN comments c ON c.id = cr.comment_id WHERE c.user_id = u.id AND cr.created_at > now() - interval '30 days'))::int,
  count(*) FILTER (WHERE ` + blockedNow + `)::int,
  count(*) FILTER (WHERE ` + blockedNow + ` AND u.blocked_until IS NULL)::int,
  count(*) FILTER (WHERE ` + blockedNow + ` AND u.blocked_until IS NOT NULL)::int,
  (SELECT count(*) FROM user_warnings WHERE created_at > now() - interval '7 days')::int
FROM users u JOIN roles r ON r.key = u.role WHERE u.deleted_at IS NULL`

func scanAdminUser(s scanner) (AdminUser, error) {
	var u AdminUser
	err := s.Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &u.RoleName, &u.IsStaff, &u.Status, &u.BlockedAt, &u.BlockedUntil, &u.BlockReason,
		&u.CreatedAt, &u.LastLoginAt, &u.Verified, jsonArr{&u.Agents}, &u.Comments, &u.Reported, &u.Watchlist, &u.Bookmarks, &u.Warnings, &u.TOTP)
	if err != nil {
		return u, notFound(err)
	}
	u.Platforms = Platforms(u.Agents)
	return u, nil
}

// Platforms meringkas user-agent sesi menjadi "Web", "iOS", "Android".
func Platforms(agents []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, a := range agents {
		l := strings.ToLower(a)
		p := "Web"
		switch {
		case strings.Contains(l, "iphone") || strings.Contains(l, "ipad") || strings.Contains(l, "ios") || strings.Contains(l, "darwin"):
			p = "iOS"
		case strings.Contains(l, "android") || strings.Contains(l, "okhttp"):
			p = "Android"
		}
		if !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	return out
}

// AdminUsers mencari pengguna per tab (reader|staff|reported|blocked|"").
func (p *PG) AdminUsers(ctx context.Context, tab, q string, limit int) ([]AdminUser, UserStats, error) {
	var st UserStats
	if err := p.DB.QueryRowContext(ctx, qUserStats).Scan(&st.Total, &st.NewMonth, &st.PrevMonth, &st.Active24h, &st.Readers, &st.Staff,
		&st.Reported, &st.Blocked, &st.BlockedPerm, &st.BlockedTemp, &st.WarningsWeek); err != nil {
		return nil, st, err
	}
	rows, err := p.DB.QueryContext(ctx, qAdminUsers, q, tab, limit)
	if err != nil {
		return nil, st, err
	}
	defer rows.Close()
	out := []AdminUser{}
	for rows.Next() {
		u, err := scanAdminUser(rows)
		if err != nil {
			return nil, st, err
		}
		out = append(out, u)
	}
	return out, st, rows.Err()
}

// AdminUser membaca satu pengguna.
func (p *PG) AdminUser(ctx context.Context, id string) (AdminUser, error) {
	return scanAdminUser(p.DB.QueryRowContext(ctx, qAdminUser, id))
}

const qUserActivity = `
SELECT to_char(d, 'YYYY-MM-DD'),
  EXISTS (SELECT 1 FROM refresh_tokens t WHERE t.user_id = $1::uuid AND t.created_at::date = d)
  OR EXISTS (SELECT 1 FROM comments c WHERE c.user_id = $1::uuid AND c.created_at::date = d)
  OR EXISTS (SELECT 1 FROM bookmarks b WHERE b.user_id = $1::uuid AND b.created_at::date = d)
  OR EXISTS (SELECT 1 FROM reactions x WHERE x.user_id = $1::uuid AND x.created_at::date = d),
  EXISTS (SELECT 1 FROM comment_reports cr JOIN comments c ON c.id = cr.comment_id WHERE c.user_id = $1::uuid AND cr.created_at::date = d)
FROM generate_series(date_trunc('week', current_date) - interval '14 days', date_trunc('week', current_date) + interval '6 days', interval '1 day') AS g(d0),
     LATERAL (SELECT g.d0::date AS d) x
ORDER BY d`

const qUserWarnings = `SELECT w.reason, u.full_name, w.created_at FROM user_warnings w LEFT JOIN users u ON u.id = w.issued_by
WHERE w.user_id = $1::uuid ORDER BY w.created_at DESC LIMIT 10`

// UserActivity mengembalikan 21 hari (3 minggu, Senin–Minggu) aktivitas & laporan pengguna, plus riwayat peringatan.
func (p *PG) UserActivity(ctx context.Context, id string) ([]UserDay, []UserWarning, error) {
	rows, err := p.DB.QueryContext(ctx, qUserActivity, id)
	if err != nil {
		return nil, nil, err
	}
	days := []UserDay{}
	for rows.Next() {
		var d UserDay
		if err := rows.Scan(&d.Day, &d.Active, &d.Reported); err != nil {
			rows.Close()
			return nil, nil, err
		}
		days = append(days, d)
	}
	rows.Close()
	wr, err := p.DB.QueryContext(ctx, qUserWarnings, id)
	if err != nil {
		return nil, nil, err
	}
	defer wr.Close()
	ws := []UserWarning{}
	for wr.Next() {
		var w UserWarning
		if err := wr.Scan(&w.Reason, &w.IssuedBy, &w.CreatedAt); err != nil {
			return nil, nil, err
		}
		ws = append(ws, w)
	}
	return days, ws, wr.Err()
}

const qBlockFor = `UPDATE users SET blocked_at = now(), blocked_until = $2::timestamptz, block_reason = $3::text WHERE id = $1::uuid AND deleted_at IS NULL`
const qUnblock = `UPDATE users SET blocked_at = NULL, blocked_until = NULL, block_reason = '' WHERE id = $1::uuid AND deleted_at IS NULL`

// BlockUser memblokir pengguna sampai waktu tertentu (nil = permanen) dan mencabut semua sesinya.
func (p *PG) BlockUser(ctx context.Context, id string, until *time.Time, reason string) error {
	res, err := p.DB.ExecContext(ctx, qBlockFor, id, until, reason)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	_, err = p.DB.ExecContext(ctx, qRevokeTokens, id)
	return err
}

// UnblockUser membuka blokir.
func (p *PG) UnblockUser(ctx context.Context, id string) error {
	res, err := p.DB.ExecContext(ctx, qUnblock, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

const qWarn = `INSERT INTO user_warnings (user_id, issued_by, reason) VALUES ($1::uuid, nullif($2::text, '')::uuid, $3::text)`
const qNotifyWarn = `INSERT INTO notifications (user_id, channel, template, payload, status, sent_at)
VALUES ($1::uuid, 'in_app', 'moderation_warning', jsonb_build_object('title', $2::text, 'body', $3::text), 'sent', now())`

// WarnUser mencatat peringatan dan mengirim notifikasi ke akun pengguna.
func (p *PG) WarnUser(ctx context.Context, id, by, reason string) error {
	if _, err := p.DB.ExecContext(ctx, qWarn, id, by, reason); err != nil {
		if pgCode(err, "23503") {
			return httpx.ErrNotFound
		}
		return err
	}
	_, err := p.DB.ExecContext(ctx, qNotifyWarn, id, "Peringatan dari moderator OceanBird", reason)
	return err
}

// ======================================================================= iklan

// Campaign adalah kampanye iklan.
type Campaign struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Advertiser   string    `json:"advertiser"`
	Industry     string    `json:"industry"`
	SlotCode     string    `json:"slot_code"`
	SlotLabel    string    `json:"slot_label"`
	SlotWidth    int       `json:"slot_width"`
	SlotHeight   int       `json:"slot_height"`
	StartDate    string    `json:"start_date"`
	EndDate      string    `json:"end_date"`
	Status       string    `json:"status"`
	Regulated    bool      `json:"regulated"`
	DocsCompany  bool      `json:"docs_company"`
	DocsLicense  bool      `json:"docs_license"`
	DocsCreative bool      `json:"docs_creative"`
	DocsClaims   bool      `json:"docs_claims"`
	CreativeURL  *string   `json:"creative_url"`
	TargetURL    *string   `json:"target_url"`
	BudgetUSD    float64   `json:"budget_usd"`
	Impressions  int64     `json:"impressions"`
	Clicks       int64     `json:"clicks"`
	Note         string    `json:"note"`
	CreatedBy    *string   `json:"created_by_name"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// CampaignInput adalah isian form kampanye.
type CampaignInput struct {
	Name         string  `json:"name"`
	Advertiser   string  `json:"advertiser"`
	Industry     string  `json:"industry"`
	SlotCode     string  `json:"slot_code"`
	StartDate    string  `json:"start_date"`
	EndDate      string  `json:"end_date"`
	Regulated    bool    `json:"regulated"`
	DocsCompany  bool    `json:"docs_company"`
	DocsLicense  bool    `json:"docs_license"`
	DocsCreative bool    `json:"docs_creative"`
	DocsClaims   bool    `json:"docs_claims"`
	CreativeURL  *string `json:"creative_url"`
	TargetURL    *string `json:"target_url"`
	BudgetUSD    float64 `json:"budget_usd"`
	Note         string  `json:"note"`
}

// AdminSlot adalah slot iklan dengan tingkat keterisian 30 hari.
type AdminSlot struct {
	Code      string   `json:"code"`
	Surface   string   `json:"surface"`
	Placement string   `json:"placement"`
	Width     int      `json:"width"`
	Height    int      `json:"height"`
	Pages     []string `json:"pages"`
	Active    bool     `json:"active"`
	Fill      int      `json:"fill"` // persen hari (30 hari terakhir) yang terisi kampanye tayang
	Live      int      `json:"live"`
}

const campaignCols = `c.id, c.name, c.advertiser, c.industry, c.slot_code, s.placement, s.width, s.height,
  to_char(c.start_date, 'YYYY-MM-DD'), to_char(c.end_date, 'YYYY-MM-DD'),
  CASE WHEN c.status = 'live' AND c.end_date < current_date THEN 'finished' ELSE c.status END,
  c.regulated, c.docs_company, c.docs_license, c.docs_creative, c.docs_claims, c.creative_url, c.target_url, c.budget_usd::float8,
  c.impressions, c.clicks, c.note, u.full_name, c.created_at, c.updated_at`

const qCampaigns = `SELECT ` + campaignCols + ` FROM ad_campaigns c JOIN ad_slots s ON s.code = c.slot_code LEFT JOIN users u ON u.id = c.created_by
ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'live' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, c.start_date DESC LIMIT 200`
const qCampaign = `SELECT ` + campaignCols + ` FROM ad_campaigns c JOIN ad_slots s ON s.code = c.slot_code LEFT JOIN users u ON u.id = c.created_by WHERE c.id = $1::uuid`

func scanCampaign(s scanner) (Campaign, error) {
	var c Campaign
	err := s.Scan(&c.ID, &c.Name, &c.Advertiser, &c.Industry, &c.SlotCode, &c.SlotLabel, &c.SlotWidth, &c.SlotHeight, &c.StartDate, &c.EndDate,
		&c.Status, &c.Regulated, &c.DocsCompany, &c.DocsLicense, &c.DocsCreative, &c.DocsClaims, &c.CreativeURL, &c.TargetURL, &c.BudgetUSD,
		&c.Impressions, &c.Clicks, &c.Note, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt)
	return c, notFound(err)
}

// Campaigns mengembalikan semua kampanye (terbaru dulu, menunggu verifikasi paling atas).
func (p *PG) Campaigns(ctx context.Context) ([]Campaign, error) {
	rows, err := p.DB.QueryContext(ctx, qCampaigns)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Campaign{}
	for rows.Next() {
		c, err := scanCampaign(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// CampaignByID membaca satu kampanye.
func (p *PG) CampaignByID(ctx context.Context, id string) (Campaign, error) {
	return scanCampaign(p.DB.QueryRowContext(ctx, qCampaign, id))
}

const qCreateCampaign = `INSERT INTO ad_campaigns (name, advertiser, industry, slot_code, start_date, end_date, regulated, docs_company, docs_license,
  docs_creative, docs_claims, creative_url, target_url, budget_usd, note, created_by)
VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11, $12, $13, $14, $15, nullif($16::text, '')::uuid) RETURNING id`
const qUpdateCampaign = `UPDATE ad_campaigns SET name = $2, advertiser = $3, industry = $4, slot_code = $5, start_date = $6::date, end_date = $7::date,
  regulated = $8, docs_company = $9, docs_license = $10, docs_creative = $11, docs_claims = $12, creative_url = $13, target_url = $14,
  budget_usd = $15, note = $16 WHERE id = $1::uuid`

func campaignErr(err error) error {
	switch {
	case pgCode(err, "23503"):
		return httpx.Validation(map[string]string{"slot_code": "Slot iklan tidak dikenal."})
	case pgCode(err, "23514"):
		return httpx.Validation(map[string]string{"end_date": "Periode atau isian kampanye tidak valid."})
	}
	return err
}

// CreateCampaign membuat kampanye berstatus "pending" (menunggu verifikasi).
func (p *PG) CreateCampaign(ctx context.Context, in CampaignInput, by string) (string, error) {
	var id string
	err := p.DB.QueryRowContext(ctx, qCreateCampaign, in.Name, in.Advertiser, in.Industry, in.SlotCode, in.StartDate, in.EndDate, in.Regulated,
		in.DocsCompany, in.DocsLicense, in.DocsCreative, in.DocsClaims, in.CreativeURL, in.TargetURL, in.BudgetUSD, in.Note, by).Scan(&id)
	return id, campaignErr(err)
}

// UpdateCampaign mengubah isian kampanye.
func (p *PG) UpdateCampaign(ctx context.Context, id string, in CampaignInput) error {
	res, err := p.DB.ExecContext(ctx, qUpdateCampaign, id, in.Name, in.Advertiser, in.Industry, in.SlotCode, in.StartDate, in.EndDate, in.Regulated,
		in.DocsCompany, in.DocsLicense, in.DocsCreative, in.DocsClaims, in.CreativeURL, in.TargetURL, in.BudgetUSD, in.Note)
	if err != nil {
		return campaignErr(err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

const qCampaignStatus = `UPDATE ad_campaigns SET status = $2::text, note = CASE WHEN $3::text = '' THEN note ELSE $3::text END WHERE id = $1::uuid`

// SetCampaignStatus mengubah status kampanye (validasi transisi di handler).
func (p *PG) SetCampaignStatus(ctx context.Context, id, status, note string) error {
	res, err := p.DB.ExecContext(ctx, qCampaignStatus, id, status, note)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

const qDeleteCampaign = `DELETE FROM ad_campaigns WHERE id = $1::uuid`

// DeleteCampaign menghapus kampanye.
func (p *PG) DeleteCampaign(ctx context.Context, id string) error {
	res, err := p.DB.ExecContext(ctx, qDeleteCampaign, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

const qAdminSlots = `SELECT s.code, s.surface, s.placement, s.width, s.height, array_to_json(s.pages)::text, s.active,
  (SELECT count(DISTINCT d)::int FROM ad_campaigns c, generate_series(current_date - 29, current_date, interval '1 day') d
   WHERE c.slot_code = s.code AND c.status IN ('live', 'finished') AND d::date BETWEEN c.start_date AND c.end_date) * 100 / 30,
  (SELECT count(*)::int FROM ad_campaigns c WHERE c.slot_code = s.code AND c.status = 'live' AND current_date BETWEEN c.start_date AND c.end_date)
FROM ad_slots s ORDER BY s.surface DESC, s.code`

// AdminSlots mengembalikan semua slot (aktif & nonaktif) dengan keterisiannya.
func (p *PG) AdminSlots(ctx context.Context) ([]AdminSlot, error) {
	rows, err := p.DB.QueryContext(ctx, qAdminSlots)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminSlot{}
	for rows.Next() {
		var s AdminSlot
		if err := rows.Scan(&s.Code, &s.Surface, &s.Placement, &s.Width, &s.Height, jsonArr{&s.Pages}, &s.Active, &s.Fill, &s.Live); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

const qSlotActive = `UPDATE ad_slots SET active = $2 WHERE code = $1`

// SetSlotActive menyalakan/mematikan slot tanpa mengubah tata letak halaman.
func (p *PG) SetSlotActive(ctx context.Context, code string, on bool) error {
	res, err := p.DB.ExecContext(ctx, qSlotActive, code, on)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

// ======================================================================= data pasar

// FeedRow adalah satu instrumen dengan status cache harga terakhir.
type FeedRow struct {
	Symbol         string          `json:"symbol"`
	Name           string          `json:"name"`
	Exchange       string          `json:"exchange"`
	AssetClass     string          `json:"asset_class"`
	Currency       string          `json:"currency"`
	ProviderSymbol string          `json:"provider_symbol"`
	Sector         *string         `json:"sector"`
	Active         bool            `json:"active"`
	InTicker       bool            `json:"in_ticker"`
	SaverMode      bool            `json:"saver_mode"`
	CategorySlug   *string         `json:"category_slug"`
	Quote          json.RawMessage `json:"quote"`
	Error          string          `json:"error"`
	FetchedAt      *time.Time      `json:"fetched_at"`
	LatencyMs      *int            `json:"latency_ms"`
	Articles       int             `json:"articles"`
	Watchers       int             `json:"watchers"`
}

// ProviderUsage adalah pemakaian penyedia data hari ini.
type ProviderUsage struct {
	Provider  string `json:"provider"`
	Calls     int    `json:"calls"`
	Errors    int    `json:"errors"`
	Limited   int    `json:"limited"`
	LatencyMs int64  `json:"latency_ms"`
}

// FeedStats adalah ringkasan kesehatan feed.
type FeedStats struct {
	Usage      []ProviderUsage `json:"usage"`
	P95Ms      int             `json:"p95_ms"`
	CacheKeys  int             `json:"cache_keys"`
	CacheFresh int             `json:"cache_fresh"`
	Watchers   int             `json:"watchers"`
	Week       []ProviderUsage `json:"week"` // total 7 hari per penyedia
}

const feedCols = `i.symbol, i.name, i.exchange, i.asset_class, i.currency, i.provider_symbol, i.sector, i.active, i.in_ticker, i.saver_mode, i.category_slug,
  mc.body::text, coalesce(mc.error, ''), mc.fetched_at, mc.latency_ms,
  (SELECT count(*) FROM article_instruments ai WHERE ai.symbol = i.symbol)::int,
  (SELECT count(DISTINCT wl.user_id) FROM watchlist_items wi JOIN watchlists wl ON wl.id = wi.watchlist_id WHERE wi.symbol = i.symbol)::int`

const qFeed = `SELECT ` + feedCols + ` FROM instruments i LEFT JOIN market_cache mc ON mc.key = 'q:' || i.provider_symbol
ORDER BY i.active DESC, CASE i.asset_class WHEN 'index' THEN 0 WHEN 'crypto' THEN 1 WHEN 'commodity' THEN 2 WHEN 'forex' THEN 3 ELSE 4 END, i.symbol`
const qFeedOne = `SELECT ` + feedCols + ` FROM instruments i LEFT JOIN market_cache mc ON mc.key = 'q:' || i.provider_symbol WHERE i.symbol = $1`

func scanFeed(s scanner) (FeedRow, error) {
	var f FeedRow
	var body sql.NullString
	err := s.Scan(&f.Symbol, &f.Name, &f.Exchange, &f.AssetClass, &f.Currency, &f.ProviderSymbol, &f.Sector, &f.Active, &f.InTicker, &f.SaverMode,
		&f.CategorySlug, &body, &f.Error, &f.FetchedAt, &f.LatencyMs, &f.Articles, &f.Watchers)
	if err != nil {
		return f, notFound(err)
	}
	if body.Valid && body.String != "" {
		f.Quote = json.RawMessage(body.String)
	}
	return f, nil
}

// MarketFeed mengembalikan semua instrumen dengan status cache harganya.
func (p *PG) MarketFeed(ctx context.Context) ([]FeedRow, error) {
	rows, err := p.DB.QueryContext(ctx, qFeed)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FeedRow{}
	for rows.Next() {
		f, err := scanFeed(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// FeedRowBySymbol membaca satu instrumen (aktif maupun tidak).
func (p *PG) FeedRowBySymbol(ctx context.Context, symbol string) (FeedRow, error) {
	return scanFeed(p.DB.QueryRowContext(ctx, qFeedOne, symbol))
}

const qUsageToday = `SELECT provider, calls, errors, limited, latency_ms FROM market_usage WHERE day = current_date ORDER BY provider`
const qUsageWeek = `SELECT provider, sum(calls)::int, sum(errors)::int, sum(limited)::int, sum(latency_ms)::bigint FROM market_usage
WHERE day > current_date - 7 GROUP BY provider ORDER BY provider`
const qFeedP95 = `SELECT coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int,
  count(*)::int, count(*) FILTER (WHERE fetched_at > now() - interval '15 minutes')::int
FROM market_cache WHERE key LIKE 'q:%' AND error = ''`
const qWatchersAll = `SELECT count(DISTINCT wl.user_id)::int FROM watchlist_items wi JOIN watchlists wl ON wl.id = wi.watchlist_id`

func usageRows(ctx context.Context, db *sql.DB, q string) ([]ProviderUsage, error) {
	rows, err := db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ProviderUsage{}
	for rows.Next() {
		var u ProviderUsage
		if err := rows.Scan(&u.Provider, &u.Calls, &u.Errors, &u.Limited, &u.LatencyMs); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// MarketStats meringkas kesehatan feed hari ini.
func (p *PG) MarketStats(ctx context.Context) (FeedStats, error) {
	var st FeedStats
	var err error
	if st.Usage, err = usageRows(ctx, p.DB, qUsageToday); err != nil {
		return st, err
	}
	if st.Week, err = usageRows(ctx, p.DB, qUsageWeek); err != nil {
		return st, err
	}
	if err := p.DB.QueryRowContext(ctx, qFeedP95).Scan(&st.P95Ms, &st.CacheKeys, &st.CacheFresh); err != nil {
		return st, err
	}
	err = p.DB.QueryRowContext(ctx, qWatchersAll).Scan(&st.Watchers)
	return st, err
}

const qUsageInc = `INSERT INTO market_usage (day, provider, calls, errors, limited, latency_ms)
VALUES (current_date, $1::text, 1, CASE WHEN $2::bool THEN 0 ELSE 1 END, CASE WHEN $3::bool THEN 1 ELSE 0 END, $4::bigint)
ON CONFLICT (day, provider) DO UPDATE SET calls = market_usage.calls + 1, errors = market_usage.errors + EXCLUDED.errors,
  limited = market_usage.limited + EXCLUDED.limited, latency_ms = market_usage.latency_ms + EXCLUDED.latency_ms`
const qCacheLatency = `UPDATE market_cache SET latency_ms = $2::int WHERE key = $1::text`

// MarketFetched mengimplementasikan market.Recorder (kegagalan pencatatan diabaikan).
func (p *PG) MarketFetched(ctx context.Context, key, provider string, latency time.Duration, ok, limited bool) {
	if provider == "" {
		provider = "twelvedata"
	}
	ms := latency.Milliseconds()
	_, _ = p.DB.ExecContext(ctx, qUsageInc, provider, ok, limited, ms)
	if ok {
		_, _ = p.DB.ExecContext(ctx, qCacheLatency, key, ms)
	}
}

const qSaver = `SELECT provider_symbol FROM instruments WHERE saver_mode AND active`

// SaverSymbols mengimplementasikan market.Saver.
func (p *PG) SaverSymbols(ctx context.Context) (map[string]bool, error) {
	rows, err := p.DB.QueryContext(ctx, qSaver)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out[s] = true
	}
	return out, rows.Err()
}

// InstrumentInput adalah isian form simbol.
type InstrumentInput struct {
	Symbol         string  `json:"symbol"`
	Name           string  `json:"name"`
	Exchange       string  `json:"exchange"`
	AssetClass     string  `json:"asset_class"`
	Currency       string  `json:"currency"`
	ProviderSymbol string  `json:"provider_symbol"`
	Sector         *string `json:"sector"`
	CategorySlug   *string `json:"category_slug"`
	InTicker       bool    `json:"in_ticker"`
	SaverMode      bool    `json:"saver_mode"`
}

const qCreateInstrument = `INSERT INTO instruments (symbol, name, exchange, asset_class, currency, provider_symbol, sector, category_slug, in_ticker, saver_mode)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`
const qUpdateInstrument = `UPDATE instruments SET name = $2, exchange = $3, asset_class = $4, currency = $5, provider_symbol = $6, sector = $7,
  category_slug = $8, in_ticker = $9, saver_mode = $10, updated_at = now() WHERE symbol = $1`
const qInstrumentActive = `UPDATE instruments SET active = $2, updated_at = now() WHERE symbol = $1`

func instrumentErr(err error) error {
	switch {
	case pgCode(err, "23505"):
		return httpx.Validation(map[string]string{"symbol": "Simbol ini sudah ada."})
	case pgCode(err, "23514"):
		return httpx.Validation(map[string]string{"symbol": "Kode simbol atau kelas aset tidak valid."})
	}
	return err
}

// CreateInstrument menambah simbol baru.
func (p *PG) CreateInstrument(ctx context.Context, in InstrumentInput) error {
	_, err := p.DB.ExecContext(ctx, qCreateInstrument, in.Symbol, in.Name, in.Exchange, in.AssetClass, in.Currency, in.ProviderSymbol, in.Sector,
		in.CategorySlug, in.InTicker, in.SaverMode)
	return instrumentErr(err)
}

// UpdateInstrument mengubah pengaturan simbol.
func (p *PG) UpdateInstrument(ctx context.Context, in InstrumentInput) error {
	res, err := p.DB.ExecContext(ctx, qUpdateInstrument, in.Symbol, in.Name, in.Exchange, in.AssetClass, in.Currency, in.ProviderSymbol, in.Sector,
		in.CategorySlug, in.InTicker, in.SaverMode)
	if err != nil {
		return instrumentErr(err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

// SetInstrumentActive menonaktifkan/mengaktifkan simbol (artikel lama tetap menautnya).
func (p *PG) SetInstrumentActive(ctx context.Context, symbol string, on bool) error {
	res, err := p.DB.ExecContext(ctx, qInstrumentActive, symbol, on)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

// SymbolArticle adalah artikel terkait simbol.
type SymbolArticle struct {
	ID          string     `json:"id"`
	Slug        string     `json:"slug"`
	Title       string     `json:"title"`
	Status      string     `json:"status"`
	AuthorName  string     `json:"author_name"`
	PublishedAt *time.Time `json:"published_at"`
}

const qSymbolArticles = `SELECT a.id, a.slug, a.title, a.status, coalesce(au.name, ''), a.published_at
FROM article_instruments ai JOIN articles a ON a.id = ai.article_id LEFT JOIN authors au ON au.id = a.author_id
WHERE ai.symbol = $1 ORDER BY coalesce(a.published_at, a.created_at) DESC LIMIT $2`

// SymbolArticles mengembalikan artikel yang menautkan simbol.
func (p *PG) SymbolArticles(ctx context.Context, symbol string, limit int) ([]SymbolArticle, error) {
	rows, err := p.DB.QueryContext(ctx, qSymbolArticles, symbol, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SymbolArticle{}
	for rows.Next() {
		var a SymbolArticle
		if err := rows.Scan(&a.ID, &a.Slug, &a.Title, &a.Status, &a.AuthorName, &a.PublishedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func opsQueries() map[string]string {
	return map[string]string{
		"admin_users": qAdminUsers, "admin_user": qAdminUser, "user_stats": qUserStats, "user_activity": qUserActivity, "user_warnings": qUserWarnings,
		"block_for": qBlockFor, "unblock": qUnblock, "warn": qWarn, "notify_warn": qNotifyWarn,
		"campaigns": qCampaigns, "campaign": qCampaign, "create_campaign": qCreateCampaign, "update_campaign": qUpdateCampaign,
		"campaign_status": qCampaignStatus, "delete_campaign": qDeleteCampaign, "admin_slots": qAdminSlots, "slot_active": qSlotActive,
		"feed": qFeed, "feed_one": qFeedOne, "usage_today": qUsageToday, "usage_week": qUsageWeek, "feed_p95": qFeedP95,
		"watchers_all": qWatchersAll, "usage_inc": qUsageInc, "cache_latency": qCacheLatency, "saver": qSaver,
		"create_instrument": qCreateInstrument, "update_instrument": qUpdateInstrument, "instrument_active": qInstrumentActive,
		"symbol_articles": qSymbolArticles,
	}
}
