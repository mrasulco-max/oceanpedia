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
	Symbols  []string   // artikel yang menautkan salah satu simbol
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

// EconomicEventInput adalah baris untuk upsert dari penyedia eksternal (TradingView).
type EconomicEventInput struct {
	ExternalID     string
	Country        string
	Title          string
	Impact         string
	ScheduledAt    time.Time
	Actual         *string
	Forecast       *string
	Previous       *string
	RelatedSymbols []string
	Source         string
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
	// TwoFactor: staf wajib kode email setelah kata sandi (verifikasi 2 langkah).
	TwoFactor bool `json:"-"`
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
	Status    string    `json:"status,omitempty"` // "pending" = menunggu moderasi
	CreatedAt time.Time `json:"created_at"`
	// ParentID: komentar induk bila ini balasan (kosong = komentar utama).
	ParentID string `json:"parent_id,omitempty"`
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
	// Kampanye tayang di slot ini (nil bila kosong → tampilkan placeholder/house ad).
	CampaignID  *string `json:"campaign_id"`
	Advertiser  *string `json:"advertiser"`
	CreativeURL *string `json:"creative_url"`
	TargetURL   *string `json:"target_url"`
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
	UpsertEconomicEvents(ctx context.Context, events []EconomicEventInput) error
	ClearSeedEconomicEvents(ctx context.Context, from, to time.Time) error
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
	AddComment(ctx context.Context, userID, slug, body, status, reason, parentID string) (Comment, error)
	ReplyTarget(ctx context.Context, kind, parentID string) (ReplyTarget, error)

	CreateInvoice(ctx context.Context, userID string, inv Invoice) (Invoice, error)

	// Redaksi (panel admin)
	AdminArticles(ctx context.Context, f AdminArticleFilter) ([]AdminArticle, error)
	AdminArticle(ctx context.Context, id string) (AdminArticle, error)
	AdminCounts(ctx context.Context, mine string) (map[string]int, error)
	DeleteArticle(ctx context.Context, id string) error

	// CMS: kategori, tag, komentar, media, log aktivitas
	AdminCategories(ctx context.Context) ([]AdminCategory, error)
	CreateCategory(ctx context.Context, in CategoryInput, by string) (string, error)
	UpdateCategory(ctx context.Context, id string, in CategoryInput) error
	DeleteCategory(ctx context.Context, id, moveTo string, redirect bool) (int, error)
	ReorderCategories(ctx context.Context, ids []string) error
	SetCategoryMenu(ctx context.Context, id string, on bool) error
	CategoryRedirect(ctx context.Context, slug string) (string, error)
	AdminTags(ctx context.Context, q string, limit int) ([]AdminTag, error)
	TagCounts(ctx context.Context) (int, int, error)
	CreateTag(ctx context.Context, slug, name string) (string, error)
	UpdateTag(ctx context.Context, id, slug, name string) error
	DeleteTag(ctx context.Context, id string) error
	MergeTags(ctx context.Context, from, into string) error
	ModComments(ctx context.Context, status string, limit int) ([]ModComment, error)
	ModerationCounts(ctx context.Context) (ModCounts, error)
	SetCommentStatus(ctx context.Context, ids []string, status, by string) (int, error)
	ReportComment(ctx context.Context, id, userID, reason string, threshold int) (int, bool, error)
	ModerationWords(ctx context.Context) ([]string, error)
	AddModerationWord(ctx context.Context, word, by string) error
	RemoveModerationWord(ctx context.Context, word string) error
	Setting(ctx context.Context, key string, dst any) (bool, error)
	SetSetting(ctx context.Context, key string, v any, by string) error
	MediaList(ctx context.Context, filter, q string, limit int) ([]MediaItem, MediaCounts, error)
	MediaItemByID(ctx context.Context, id string) (MediaItem, error)
	UpdateMediaMeta(ctx context.Context, id string, m MediaMeta) error
	SetMediaFile(ctx context.Context, id, name, kind string, w, h int) error
	DeleteMedia(ctx context.Context, id string) error
	AuditLog(ctx context.Context, days int, entities []string, before int64, limit int) ([]AuditEntry, map[string]int, error)

	// RBAC
	UserAccess(ctx context.Context, userID string) (Access, error)
	RBACState(ctx context.Context) (RBAC, error)
	SetMatrix(ctx context.Context, m map[string][]string) error
	CreateRole(ctx context.Context, key, name, desc string) error
	DeleteRole(ctx context.Context, key string) error
	StaffMembers(ctx context.Context) ([]StaffMember, error)
	SetUserRole(ctx context.Context, userID, role string) error
	SetBlocked(ctx context.Context, userID string, blocked bool) error
	// Pembaca: notifikasi, price alert, iklan.
	Notifications(ctx context.Context, uid, kind string, limit int) ([]Notification, map[string]int, int, error)
	MarkNotificationsRead(ctx context.Context, uid string, ids []string) error
	Notify(ctx context.Context, uid string, n NotifyInput) error
	NotifyArticle(ctx context.Context, articleID string) (int, error)
	ActiveAlerts(ctx context.Context, symbols []string) ([]AlertJob, error)
	AlertSeen(ctx context.Context, id string, price float64, fired bool) error
	AdImpression(ctx context.Context, id string) error
	Reminders(ctx context.Context, uid string) ([]string, error)
	SetReminder(ctx context.Context, uid, eventID string, on bool) error
	DispatchReminders(ctx context.Context) (int, error)
	TopicBySlug(ctx context.Context, slug, uid string) (Topic, error)

	// tagihan & langganan
	CreatePayment(ctx context.Context, invoiceID, provider, method, ref string, amount int64, expires time.Time) (string, error)
	SetPaymentRaw(ctx context.Context, paymentID string, raw map[string]any) error
	SetInvoiceSeats(ctx context.Context, invoiceID string, seats int) error
	Bill(ctx context.Context, id, uid string) (Bill, error)
	BillByOrder(ctx context.Context, orderID string) (Bill, error)
	Bills(ctx context.Context, uid string) ([]Bill, error)
	ApplyPayment(ctx context.Context, provider, ref, outcome, method string, raw map[string]any) (bool, error)
	ActiveSubscription(ctx context.Context, uid string) (Subscription, error)
	SetCancelAtPeriodEnd(ctx context.Context, uid string, cancel bool) error

	// redaksi lanjutan
	SnapshotArticle(ctx context.Context, id, editorID, note string) error
	ArticleVersions(ctx context.Context, id string) ([]Version, error)
	RestoreVersion(ctx context.Context, articleID, versionID, editorID string) (int, error)
	BreakingList(ctx context.Context) ([]BreakingItem, error)
	SetBreaking(ctx context.Context, id string, hours int) error
	CurrentLive(ctx context.Context) (LiveBlog, error)
	StartLive(ctx context.Context, title, summary, symbol string, closes *time.Time, uid string) (string, error)
	EndLive(ctx context.Context, id string) error
	AddLivePost(ctx context.Context, blogID, body, kind, symbol string, pinned bool, uid string) (string, error)
	PinLivePost(ctx context.Context, id string, pinned bool) error
	DeleteLivePost(ctx context.Context, id string) error
	Shorts(ctx context.Context, all bool, limit int, uid string) ([]Short, error)
	SavedShorts(ctx context.Context, uid string, limit int) ([]Short, error)
	Follow(ctx context.Context, kind, uid, slug string, on bool) error
	FollowStat(ctx context.Context, kind, slug, uid string) (int64, bool, error)
	MyFollows(ctx context.Context, uid string) (map[string][]string, error)
	AddAdInquiry(ctx context.Context, company, email, budget, message, uid string) (string, error)
	AddStudentVerification(ctx context.Context, uid, campusEmail, studentID string) (string, error)
	StudentStatus(ctx context.Context, uid string) (string, bool, error)
	AddPrivacyRequest(ctx context.Context, uid, kind, detail string) (string, error)
	Requests(ctx context.Context, kind string, limit int) ([]Request, error)
	SetRequestStatus(ctx context.Context, kind, id, status, by, note string) (string, error)
	PendingRequests(ctx context.Context) (int, error)
	PublicStats(ctx context.Context) (map[string]int64, error)
	AssignArticle(ctx context.Context, id, staffID string) (string, error)
	RemoveList(ctx context.Context, email, list string) error
	Reader2FA(ctx context.Context, id string) (bool, error)
	PendingReplies(ctx context.Context, kind string, ids []string) ([]PendingReply, error)
	ExportUser(ctx context.Context, uid string) (string, error)
	TOTP(ctx context.Context, uid string) (active, pending string, err error)
	SetTOTP(ctx context.Context, uid, key, value string) error
	ClearTOTP(ctx context.Context, uid string) error
	UseTOTPStep(ctx context.Context, uid string, step int64) (bool, error)
	TOTPAttempt(ctx context.Context, uid string, now, windowSec int64) (int, error)
	TOTPRecovery(ctx context.Context, uid string) ([]string, error)
	UseRecoveryCode(ctx context.Context, uid, hash string) (left int, ok bool, err error)
	DeleteAccount(ctx context.Context, uid string) error
	Journal(ctx context.Context, uid string, limit int) ([]JournalEntry, error)
	JournalCount(ctx context.Context, uid string) (int, error)
	SaveJournal(ctx context.Context, uid string, e JournalEntry) (JournalEntry, error)
	DeleteJournal(ctx context.Context, uid, id string) error
	ShortToggle(ctx context.Context, kind, id, uid string, on bool) (int64, error)
	ShortShare(ctx context.Context, id string) (int64, error)
	ShortComments(ctx context.Context, id, uid string, limit int) ([]ShortComment, error)
	AddShortComment(ctx context.Context, id, uid, body, status, reason, parentID string) (ShortComment, error)
	DeleteShortComment(ctx context.Context, shortID, id, uid string, moderator bool) error
	AdminShortComments(ctx context.Context, status string, limit int) ([]ShortComment, error)
	SetShortCommentStatus(ctx context.Context, id, status, by string) error
	CreateShort(ctx context.Context, s Short, uid string) (string, error)
	SetShortStatus(ctx context.Context, id, status string) error
	ShortView(ctx context.Context, id string) error
	Subscribe(ctx context.Context, email, uid string, lists []string, source string) (bool, error)
	Unsubscribe(ctx context.Context, token, email string) error
	NewsletterOverview(ctx context.Context, q string, limit int) (NewsletterStats, []Subscriber, error)
	Issues(ctx context.Context) ([]Issue, error)
	Issue(ctx context.Context, id string) (Issue, error)
	CreateIssue(ctx context.Context, list, subject, intro string, articleIDs []string, uid string) (string, error)
	IssueRecipients(ctx context.Context, list string) ([][2]string, error)
	MarkIssueSent(ctx context.Context, id string, sent, failed int) error
	ArticleLinks(ctx context.Context, ids []string) ([][3]string, error)
	DashboardStats(ctx context.Context) (Dashboard, error)
	Reports(ctx context.Context) (Report, error)
	AdminSearch(ctx context.Context, q string) ([]AdminHit, error)
	AdClick(ctx context.Context, id string) (string, error)
	// Operasional admin: pengguna, iklan, data pasar.
	AdminUsers(ctx context.Context, tab, q string, limit int) ([]AdminUser, UserStats, error)
	AdminUser(ctx context.Context, id string) (AdminUser, error)
	UserActivity(ctx context.Context, id string) ([]UserDay, []UserWarning, error)
	BlockUser(ctx context.Context, id string, until *time.Time, reason string) error
	UnblockUser(ctx context.Context, id string) error
	WarnUser(ctx context.Context, id, by, reason string) error
	Campaigns(ctx context.Context) ([]Campaign, error)
	CampaignByID(ctx context.Context, id string) (Campaign, error)
	CreateCampaign(ctx context.Context, in CampaignInput, by string) (string, error)
	UpdateCampaign(ctx context.Context, id string, in CampaignInput) error
	SetCampaignStatus(ctx context.Context, id, status, note string) error
	DeleteCampaign(ctx context.Context, id string) error
	AdminSlots(ctx context.Context) ([]AdminSlot, error)
	SetSlotActive(ctx context.Context, code string, on bool) error
	MarketFeed(ctx context.Context) ([]FeedRow, error)
	FeedRowBySymbol(ctx context.Context, symbol string) (FeedRow, error)
	MarketStats(ctx context.Context) (FeedStats, error)
	CreateInstrument(ctx context.Context, in InstrumentInput) error
	UpdateInstrument(ctx context.Context, in InstrumentInput) error
	SetInstrumentActive(ctx context.Context, symbol string, on bool) error
	SymbolArticles(ctx context.Context, symbol string, limit int) ([]SymbolArticle, error)
	Invitations(ctx context.Context, now time.Time) ([]Invitation, error)
	CreateInvitation(ctx context.Context, email, role string, categories []string, by string, expires time.Time) (string, error)
	RevokeInvitation(ctx context.Context, id string) error
	AcceptInvitation(ctx context.Context, userID string) (string, string, error)
	CreateArticle(ctx context.Context, userID, authorSlug string, in ArticleInput, slugFn func(i int) string) (AdminArticle, error)
	UpdateArticle(ctx context.Context, id string, in ArticleInput) (AdminArticle, error)
	SetArticleStatus(ctx context.Context, id, status string, publishedAt *time.Time, note string) error
	CreateMedia(ctx context.Context, userID, mime string, data []byte) (string, error)
	Media(ctx context.Context, id string) (mime string, data []byte, err error)
	Audit(ctx context.Context, actorID, action, entity, entityID string, data any) error
}
