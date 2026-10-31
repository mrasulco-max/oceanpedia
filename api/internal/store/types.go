// Package store mendefinisikan model domain dan antarmuka penyimpanan.
package store

import (
	"context"
	"time"
)

type Category struct {
	ID           string `json:"id"`
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Icon         string `json:"icon"`
	ArticleCount int    `json:"article_count"`
}

type Author struct {
	ID        string  `json:"id"`
	Slug      string  `json:"slug"`
	Name      string  `json:"name"`
	Title     string  `json:"title"`
	Bio       string  `json:"bio,omitempty"`
	AvatarURL *string `json:"avatar_url"`
	Verified  bool    `json:"verified"`
}

// ArticleCard adalah ringkasan artikel untuk daftar.
type ArticleCard struct {
	ID             string    `json:"id"`
	Slug           string    `json:"slug"`
	Title          string    `json:"title"`
	Excerpt        string    `json:"excerpt"`
	CoverURL       *string   `json:"cover_url"`
	CoverAlt       string    `json:"cover_alt"`
	Category       Category  `json:"category"`
	AuthorName     string    `json:"author_name"`
	AuthorSlug     string    `json:"author_slug"`
	IsPremium      bool      `json:"is_premium"`
	IsBreaking     bool      `json:"is_breaking"`
	ReadingMinutes int       `json:"reading_minutes"`
	ViewCount      int64     `json:"view_count"`
	PublishedAt    time.Time `json:"published_at"`
}

// Article adalah artikel lengkap.
type Article struct {
	ArticleCard
	Body      string   `json:"body"`
	Locked    bool     `json:"locked"`
	AISummary *string  `json:"ai_summary,omitempty"`
	Author    Author   `json:"author"`
	Tags      []Tag    `json:"tags"`
	Symbols   []string `json:"symbols"`
}

type Tag struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// ArticleFilter untuk daftar artikel (paginasi keyset).
type ArticleFilter struct {
	Category string
	Tag      string
	Author   string
	Query    string
	Before   *time.Time // cursor: published_at artikel terakhir
	Limit    int
}

type Instrument struct {
	Symbol         string  `json:"symbol"`
	Name           string  `json:"name"`
	Exchange       string  `json:"exchange"`
	AssetClass     string  `json:"asset_class"`
	Currency       string  `json:"currency"`
	ProviderSymbol string  `json:"-"`
	Sector         *string `json:"sector"`
}

type EconomicEvent struct {
	ID             string    `json:"id"`
	Country        string    `json:"country"`
	Title          string    `json:"title"`
	Impact         string    `json:"impact"`
	ScheduledAt    time.Time `json:"scheduled_at"`
	Actual         *string   `json:"actual"`
	Forecast       *string   `json:"forecast"`
	Previous       *string   `json:"previous"`
	RelatedSymbols []string  `json:"related_symbols"`
}

type Plan struct {
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	PriceAmount   int64    `json:"price_amount"`
	Currency      string   `json:"currency"`
	BillingPeriod string   `json:"billing_period"`
	MinSeats      int      `json:"min_seats"`
	Features      []string `json:"features"`
}

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	FullName     string    `json:"full_name"`
	Role         string    `json:"role"`
	PasswordHash string    `json:"-"`
	Plan         *string   `json:"plan"`
	CreatedAt    time.Time `json:"created_at"`
	// EmailVerified: akun baru wajib konfirmasi OTP sebelum bisa masuk.
	EmailVerified bool    `json:"email_verified"`
	Phone         *string `json:"phone,omitempty"`
	AvatarID      *string `json:"avatar_id"` // foto profil: GET /v1/media/{avatar_id}
}

// SearchResult adalah hasil pencarian gabungan (aset, berita, penulis, topik).
type SearchResult struct {
	Instruments []Instrument  `json:"instruments"`
	Articles    []ArticleCard `json:"articles"`
	Authors     []AuthorHit   `json:"authors"`
	Tags        []Tag         `json:"tags"`
}

type AuthorHit struct {
	Author
	ArticleCount int `json:"article_count"`
}

type WatchItem struct {
	Instrument
	AddedAt time.Time `json:"added_at"`
}

type Alert struct {
	ID        string    `json:"id"`
	Symbol    string    `json:"symbol"`
	Condition string    `json:"condition"`
	Threshold *float64  `json:"threshold"`
	Frequency string    `json:"frequency"`
	Channels  []string  `json:"channels"`
	Note      string    `json:"note"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
}

type Comment struct {
	ID        string    `json:"id"`
	UserName  string    `json:"user_name"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

type ReactionCount struct {
	Kind  string `json:"kind"`
	Count int    `json:"count"`
}

type Invoice struct {
	ID        string    `json:"id"`
	Number    string    `json:"number"`
	PlanCode  string    `json:"plan_code"`
	Subtotal  int64     `json:"subtotal"`
	Discount  int64     `json:"discount"`
	TaxRate   float64   `json:"tax_rate"`
	TaxAmount int64     `json:"tax_amount"`
	Total     int64     `json:"total"`
	Currency  string    `json:"currency"`
	PromoCode *string   `json:"promo_code"`
	Status    string    `json:"status"`
	IssuedAt  time.Time `json:"issued_at"`
}

type AdSlot struct {
	Code      string `json:"code"`
	Surface   string `json:"surface"`
	Placement string `json:"placement"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
}

// Store adalah kontrak penyimpanan yang dipakai handler (memudahkan uji dengan implementasi palsu).
type Store interface {
	Ping(ctx context.Context) error

	Categories(ctx context.Context) ([]Category, error)
	Articles(ctx context.Context, f ArticleFilter) ([]ArticleCard, error)
	MostRead(ctx context.Context, limit int) ([]ArticleCard, error)
	ArticleBySlug(ctx context.Context, slug string) (Article, error)
	RelatedArticles(ctx context.Context, slug string, limit int) ([]ArticleCard, error)
	IncrementView(ctx context.Context, slug string) error
	AuthorBySlug(ctx context.Context, slug string) (Author, error)

	Instruments(ctx context.Context, symbols []string) ([]Instrument, error)
	InstrumentBySymbol(ctx context.Context, symbol string) (Instrument, error)
	Events(ctx context.Context, from, to time.Time, impact string) ([]EconomicEvent, error)
	Plans(ctx context.Context) ([]Plan, error)
	PlanByCode(ctx context.Context, code string) (Plan, error)
	AdSlots(ctx context.Context, surface, page string) ([]AdSlot, error)

	CreateUser(ctx context.Context, email, fullName, passwordHash, phone string) (User, error)
	UpdatePendingUser(ctx context.Context, id, fullName, passwordHash, phone string) (User, error)
	MarkEmailVerified(ctx context.Context, id string) error
	SetPassword(ctx context.Context, id, passwordHash string) error
	RevokeUserTokens(ctx context.Context, id string) error
	Search(ctx context.Context, q string, limit int) (SearchResult, error)
	Profile(ctx context.Context, id string) (Profile, error)
	UpdateProfile(ctx context.Context, id string, in ProfileUpdate) error
	Sessions(ctx context.Context, userID string) ([]Session, error)
	RevokeSession(ctx context.Context, userID, sessionID string) error
	FollowTopic(ctx context.Context, userID, slug string) error
	UnfollowTopic(ctx context.Context, userID, slug string) error
	ActiveAlertCount(ctx context.Context, userID string) (int, error)
	SetAvatar(ctx context.Context, userID, mime string, data []byte) (string, error)
	RemoveAvatar(ctx context.Context, userID string) error
	UserByEmail(ctx context.Context, email string) (User, error)
	UserByID(ctx context.Context, id string) (User, error)
	SaveRefreshToken(ctx context.Context, userID string, hash []byte, ua, ip string, exp time.Time) error
	ConsumeRefreshToken(ctx context.Context, hash []byte) (userID string, err error)
	RevokeRefreshToken(ctx context.Context, hash []byte) error

	Watchlist(ctx context.Context, userID string) ([]WatchItem, error)
	AddToWatchlist(ctx context.Context, userID, symbol string) error
	RemoveFromWatchlist(ctx context.Context, userID, symbol string) error
	Alerts(ctx context.Context, userID string) ([]Alert, error)
	CreateAlert(ctx context.Context, userID string, a Alert) (Alert, error)
	DeleteAlert(ctx context.Context, userID, id string) error
	SetBookmark(ctx context.Context, userID, slug string, on bool) error
	Bookmarks(ctx context.Context, userID string) ([]ArticleCard, error)
	React(ctx context.Context, userID, slug, kind string) error
	Reactions(ctx context.Context, slug string) ([]ReactionCount, error)
	Comments(ctx context.Context, slug string, limit int) ([]Comment, error)
	AddComment(ctx context.Context, userID, slug, body string) (Comment, error)

	CreateInvoice(ctx context.Context, userID string, inv Invoice) (Invoice, error)

	// Redaksi (panel admin)
	AdminArticles(ctx context.Context, f AdminArticleFilter) ([]AdminArticle, error)
	AdminArticle(ctx context.Context, id string) (AdminArticle, error)
	AdminCounts(ctx context.Context, mine string) (map[string]int, error)
	DeleteArticle(ctx context.Context, id string) error
	CreateArticle(ctx context.Context, userID, authorSlug string, in ArticleInput, slugFn func(i int) string) (AdminArticle, error)
	UpdateArticle(ctx context.Context, id string, in ArticleInput) (AdminArticle, error)
	SetArticleStatus(ctx context.Context, id, status string, publishedAt *time.Time, note string) error
	CreateMedia(ctx context.Context, userID, mime string, data []byte) (string, error)
	Media(ctx context.Context, id string) (mime string, data []byte, err error)
	Audit(ctx context.Context, actorID, action, entity, entityID string, data any) error
}
