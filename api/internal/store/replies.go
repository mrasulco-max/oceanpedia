package store

import (
	"context"
	"database/sql"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
)

// ReplyTarget: pemilik komentar yang dibalas (untuk notifikasi "membalas komentarmu").
type ReplyTarget struct {
	UserID string
	Notify bool   // preferensi comment_replies (bawaan: aktif)
	Title  string // judul artikel / short
	Link   string
}

const qReplyTargetArticle = `SELECT p.user_id::text, COALESCE((u.preferences->>'comment_replies')::boolean, true), a.title, '/berita/' || a.slug || '#komentar'
FROM comments p JOIN users u ON u.id = p.user_id JOIN articles a ON a.id = p.article_id WHERE p.id = $1::uuid AND u.deleted_at IS NULL`

const qReplyTargetShort = `SELECT p.user_id::text, COALESCE((u.preferences->>'comment_replies')::boolean, true), s.title, '/short?v=' || s.id::text || '#komentar'
FROM short_comments p JOIN users u ON u.id = p.user_id JOIN shorts s ON s.id = p.short_id WHERE p.id = $1::uuid AND u.deleted_at IS NULL`

// ReplyTarget mencari pemilik komentar induk (kind "article" | "short").
func (p *PG) ReplyTarget(ctx context.Context, kind, parentID string) (ReplyTarget, error) {
	q := qReplyTargetArticle
	if kind == "short" {
		q = qReplyTargetShort
	}
	var t ReplyTarget
	err := p.DB.QueryRowContext(ctx, q, parentID).Scan(&t.UserID, &t.Notify, &t.Title, &t.Link)
	if err == sql.ErrNoRows {
		return t, httpx.ErrNotFound
	}
	return t, err
}

func replyQueries() map[string]string {
	return map[string]string{"reply_target_article": qReplyTargetArticle, "reply_target_short": qReplyTargetShort}
}
