package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
)

// ======================================================================= ikuti kategori & penulis

const qFollowCategory = `INSERT INTO user_categories (user_id, category_id) SELECT $1::uuid, id FROM categories WHERE slug = $2::text ON CONFLICT DO NOTHING`
const qUnfollowCategory = `DELETE FROM user_categories WHERE user_id = $1::uuid AND category_id = (SELECT id FROM categories WHERE slug = $2::text)`
const qFollowAuthor = `INSERT INTO user_authors (user_id, author_id) SELECT $1::uuid, id FROM authors WHERE slug = $2::text ON CONFLICT DO NOTHING`
const qUnfollowAuthor = `DELETE FROM user_authors WHERE user_id = $1::uuid AND author_id = (SELECT id FROM authors WHERE slug = $2::text)`
const qCategoryExists = `SELECT EXISTS (SELECT 1 FROM categories WHERE slug = $1::text)`
const qAuthorExists = `SELECT EXISTS (SELECT 1 FROM authors WHERE slug = $1::text)`
const qFollowStatCategory = `SELECT (SELECT count(*) FROM user_categories uc JOIN categories c ON c.id = uc.category_id WHERE c.slug = $1::text),
  EXISTS (SELECT 1 FROM user_categories uc JOIN categories c ON c.id = uc.category_id WHERE c.slug = $1::text AND uc.user_id = NULLIF($2::text, '')::uuid)`
const qFollowStatAuthor = `SELECT (SELECT count(*) FROM user_authors ua JOIN authors a ON a.id = ua.author_id WHERE a.slug = $1::text),
  EXISTS (SELECT 1 FROM user_authors ua JOIN authors a ON a.id = ua.author_id WHERE a.slug = $1::text AND ua.user_id = NULLIF($2::text, '')::uuid)`
const qMyFollows = `SELECT 'category', c.slug FROM user_categories uc JOIN categories c ON c.id = uc.category_id WHERE uc.user_id = $1::uuid
UNION ALL SELECT 'author', a.slug FROM user_authors ua JOIN authors a ON a.id = ua.author_id WHERE ua.user_id = $1::uuid
UNION ALL SELECT 'topic', t.slug FROM user_topics ut JOIN tags t ON t.id = ut.tag_id WHERE ut.user_id = $1::uuid`

// Follow mengikuti / berhenti mengikuti kategori atau penulis (kind = "category" | "author").
func (p *PG) Follow(ctx context.Context, kind, uid, slug string, on bool) error {
	exists, ins, del := qCategoryExists, qFollowCategory, qUnfollowCategory
	if kind == "author" {
		exists, ins, del = qAuthorExists, qFollowAuthor, qUnfollowAuthor
	}
	var ok bool
	if err := p.DB.QueryRowContext(ctx, exists, slug).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return httpx.ErrNotFound
	}
	q := del
	if on {
		q = ins
	}
	_, err := p.DB.ExecContext(ctx, q, uid, slug)
	return err
}

// FollowStat: jumlah pengikut & apakah pengguna mengikuti.
func (p *PG) FollowStat(ctx context.Context, kind, slug, uid string) (int64, bool, error) {
	q := qFollowStatCategory
	if kind == "author" {
		q = qFollowStatAuthor
	}
	var n int64
	var f bool
	err := p.DB.QueryRowContext(ctx, q, slug, uid).Scan(&n, &f)
	return n, f, err
}

// MyFollows: slug yang diikuti per jenis.
func (p *PG) MyFollows(ctx context.Context, uid string) (map[string][]string, error) {
	rows, err := p.DB.QueryContext(ctx, qMyFollows, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]string{"category": {}, "author": {}, "topic": {}}
	for rows.Next() {
		var k, s string
		if err := rows.Scan(&k, &s); err != nil {
			return nil, err
		}
		out[k] = append(out[k], s)
	}
	return out, rows.Err()
}

// ======================================================================= permintaan (iklan, student, data pribadi)

// Request: baris permintaan generik untuk panel admin.
type Request struct {
	ID        string     `json:"id"`
	Kind      string     `json:"kind"`
	Status    string     `json:"status"`
	Name      string     `json:"name"`
	Email     string     `json:"email"`
	Detail    string     `json:"detail"`
	Extra     string     `json:"extra"`
	UserID    *string    `json:"user_id"`
	CreatedAt time.Time  `json:"created_at"`
	HandledAt *time.Time `json:"handled_at"`
}

const qAdInquiryAdd = `INSERT INTO ad_inquiries (company, email, budget, message, user_id) VALUES ($1::text, $2::text, $3::text, $4::text, NULLIF($5::text, '')::uuid) RETURNING id`
const qStudentAdd = `INSERT INTO student_verifications (user_id, campus_email, student_id) VALUES ($1::uuid, $2::text, $3::text) RETURNING id`
const qStudentPending = `SELECT EXISTS (SELECT 1 FROM student_verifications WHERE user_id = $1::uuid AND status = 'pending')`
const qStudentStatus = `SELECT coalesce((SELECT status FROM student_verifications WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 1), ''),
  coalesce((SELECT student_verified_until > now() FROM users WHERE id = $1::uuid), false)`
const qPrivacyAdd = `INSERT INTO privacy_requests (user_id, kind, detail) VALUES ($1::uuid, $2::text, $3::text) RETURNING id`
const qPrivacyOpen = `SELECT count(*) FROM privacy_requests WHERE user_id = $1::uuid AND kind = $2::text AND status = 'pending'`

const qRequests = `SELECT * FROM (
  SELECT i.id, 'ad' AS kind, i.status, i.company AS name, i.email, i.message AS detail, i.budget AS extra, i.user_id, i.created_at, i.handled_at FROM ad_inquiries i
  UNION ALL
  SELECT v.id, 'student', v.status, u.full_name, u.email, v.campus_email, v.student_id, v.user_id, v.created_at, v.reviewed_at FROM student_verifications v JOIN users u ON u.id = v.user_id
  UNION ALL
  SELECT r.id, 'privacy', r.status, u.full_name, u.email, r.detail, r.kind, r.user_id, r.created_at, r.handled_at FROM privacy_requests r JOIN users u ON u.id = r.user_id
) x WHERE ($1::text = '' OR x.kind = $1::text) ORDER BY (x.status IN ('new', 'pending')) DESC, x.created_at DESC LIMIT $2::int`

const qAdInquiryStatus = `UPDATE ad_inquiries SET status = $2::text, handled_by = NULLIF($3::text, '')::uuid, handled_at = now() WHERE id = $1::uuid`
const qStudentReview = `WITH v AS (
  UPDATE student_verifications SET status = $2::text, note = $4::text, reviewed_by = NULLIF($3::text, '')::uuid, reviewed_at = now() WHERE id = $1::uuid RETURNING user_id, status
)
UPDATE users u SET student_verified_until = CASE WHEN v.status = 'approved' THEN now() + interval '1 year' ELSE u.student_verified_until END FROM v WHERE u.id = v.user_id RETURNING u.id`
const qPrivacyStatus = `UPDATE privacy_requests SET status = $2::text, handled_by = NULLIF($3::text, '')::uuid, handled_at = now() WHERE id = $1::uuid RETURNING user_id`
const qPendingRequests = `SELECT (SELECT count(*) FROM ad_inquiries WHERE status = 'new') + (SELECT count(*) FROM student_verifications WHERE status = 'pending') + (SELECT count(*) FROM privacy_requests WHERE status = 'pending')`

// AddAdInquiry menyimpan permintaan kerja sama iklan.
func (p *PG) AddAdInquiry(ctx context.Context, company, email, budget, message, uid string) (string, error) {
	var id string
	err := p.DB.QueryRowContext(ctx, qAdInquiryAdd, company, email, budget, message, uid).Scan(&id)
	return id, err
}

// AddStudentVerification mengajukan verifikasi Student (satu pengajuan menunggu per pengguna).
func (p *PG) AddStudentVerification(ctx context.Context, uid, campusEmail, studentID string) (string, error) {
	var pending bool
	if err := p.DB.QueryRowContext(ctx, qStudentPending, uid).Scan(&pending); err != nil {
		return "", err
	}
	if pending {
		return "", ErrDuplicate
	}
	var id string
	err := p.DB.QueryRowContext(ctx, qStudentAdd, uid, campusEmail, studentID).Scan(&id)
	return id, err
}

// StudentStatus: status pengajuan terakhir & apakah verifikasi masih berlaku.
func (p *PG) StudentStatus(ctx context.Context, uid string) (string, bool, error) {
	var st string
	var ok bool
	err := p.DB.QueryRowContext(ctx, qStudentStatus, uid).Scan(&st, &ok)
	return st, ok, err
}

// AddPrivacyRequest mencatat permintaan data pribadi (satu yang terbuka per jenis).
func (p *PG) AddPrivacyRequest(ctx context.Context, uid, kind, detail string) (string, error) {
	var n int
	if err := p.DB.QueryRowContext(ctx, qPrivacyOpen, uid, kind).Scan(&n); err != nil {
		return "", err
	}
	if n > 0 {
		return "", ErrDuplicate
	}
	var id string
	err := p.DB.QueryRowContext(ctx, qPrivacyAdd, uid, kind, detail).Scan(&id)
	return id, err
}

// Requests: semua permintaan untuk panel admin (kind kosong = semua).
func (p *PG) Requests(ctx context.Context, kind string, limit int) ([]Request, error) {
	rows, err := p.DB.QueryContext(ctx, qRequests, kind, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Request{}
	for rows.Next() {
		var r Request
		if err := rows.Scan(&r.ID, &r.Kind, &r.Status, &r.Name, &r.Email, &r.Detail, &r.Extra, &r.UserID, &r.CreatedAt, &r.HandledAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SetRequestStatus memproses permintaan. Mengembalikan user_id pemohon (bila ada) untuk notifikasi.
func (p *PG) SetRequestStatus(ctx context.Context, kind, id, status, by, note string) (string, error) {
	var uid sql.NullString
	var err error
	switch kind {
	case "ad":
		return "", affected(p.DB.ExecContext(ctx, qAdInquiryStatus, id, status, by))
	case "student":
		err = p.DB.QueryRowContext(ctx, qStudentReview, id, status, by, note).Scan(&uid)
	case "privacy":
		err = p.DB.QueryRowContext(ctx, qPrivacyStatus, id, status, by).Scan(&uid)
	default:
		return "", httpx.ErrNotFound
	}
	return uid.String, notFound(err)
}

// PendingRequests: jumlah permintaan yang menunggu tindakan.
func (p *PG) PendingRequests(ctx context.Context) (int, error) {
	var n int
	err := p.DB.QueryRowContext(ctx, qPendingRequests).Scan(&n)
	return n, err
}

const qPublicStats = `SELECT (SELECT count(*) FROM articles WHERE status = 'published'),
  (SELECT coalesce(sum(view_count), 0) FROM articles WHERE status = 'published'),
  (SELECT count(*) FROM newsletter_subscribers WHERE status = 'active'),
  (SELECT count(*) FROM users WHERE deleted_at IS NULL AND role = 'reader')`

// PublicStats: angka nyata untuk halaman Pasang iklan.
func (p *PG) PublicStats(ctx context.Context) (map[string]int64, error) {
	var a, v, n, r int64
	if err := p.DB.QueryRowContext(ctx, qPublicStats).Scan(&a, &v, &n, &r); err != nil {
		return nil, err
	}
	return map[string]int64{"articles": a, "views": v, "newsletter": n, "readers": r}, nil
}

const qAssignArticle = `WITH st AS (SELECT u.id FROM users u WHERE u.id = $2::uuid AND u.role <> 'reader' AND u.deleted_at IS NULL)
UPDATE articles SET assigned_to = (SELECT id FROM st) WHERE id = $1::uuid AND EXISTS (SELECT 1 FROM st) RETURNING title`

// AssignArticle menugaskan staf (bukan pembaca) untuk meninjau artikel. Mengembalikan judul artikel.
func (p *PG) AssignArticle(ctx context.Context, id, staffID string) (string, error) {
	var t string
	err := p.DB.QueryRowContext(ctx, qAssignArticle, id, staffID).Scan(&t)
	return t, notFound(err)
}

func requestQueries() map[string]string {
	return map[string]string{
		"follow_category": qFollowCategory, "unfollow_category": qUnfollowCategory, "follow_author": qFollowAuthor, "unfollow_author": qUnfollowAuthor,
		"category_exists": qCategoryExists, "author_exists": qAuthorExists, "follow_stat_category": qFollowStatCategory, "follow_stat_author": qFollowStatAuthor,
		"my_follows": qMyFollows, "ad_inquiry_add": qAdInquiryAdd, "student_add": qStudentAdd, "student_pending": qStudentPending, "student_status": qStudentStatus,
		"privacy_add": qPrivacyAdd, "privacy_open": qPrivacyOpen, "requests": qRequests, "ad_inquiry_status": qAdInquiryStatus, "student_review": qStudentReview,
		"privacy_status": qPrivacyStatus, "pending_requests": qPendingRequests, "public_stats": qPublicStats, "assign_article": qAssignArticle,
	}
}
