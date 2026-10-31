package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// ProfileStats: ringkasan aktivitas akun untuk halaman profil.
type ProfileStats struct {
	Watchlist       int `json:"watchlist"`
	AlertsActive    int `json:"alerts_active"`
	AlertsTriggered int `json:"alerts_triggered"`
	Bookmarks       int `json:"bookmarks"`
	Topics          int `json:"topics"`
}

// Profile adalah data lengkap halaman profil & pengaturan.
type Profile struct {
	User
	DisplayName *string         `json:"display_name"`
	Preferences json.RawMessage `json:"preferences"`
	Stats       ProfileStats    `json:"stats"`
	Topics      []Tag           `json:"topics"`
}

// Session adalah satu perangkat yang sedang masuk (refresh token aktif).
type Session struct {
	ID        string    `json:"id"`
	UserAgent string    `json:"user_agent"`
	IP        string    `json:"ip"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	Current   bool      `json:"current"`
	Hash      []byte    `json:"-"`
}

const qProfileExtra = `
SELECT u.display_name, u.preferences,
  (SELECT count(*) FROM watchlist_items wi JOIN watchlists w ON w.id = wi.watchlist_id WHERE w.user_id = u.id),
  (SELECT count(*) FROM price_alerts a WHERE a.user_id = u.id AND a.active),
  (SELECT count(*) FROM price_alerts a WHERE a.user_id = u.id AND a.triggered_at IS NOT NULL),
  (SELECT count(*) FROM bookmarks b WHERE b.user_id = u.id),
  (SELECT count(*) FROM user_topics t WHERE t.user_id = u.id)
FROM users u WHERE u.id = $1::uuid AND u.deleted_at IS NULL`

const qProfileTopics = `SELECT t.slug, t.name FROM user_topics ut JOIN tags t ON t.id = ut.tag_id WHERE ut.user_id = $1::uuid ORDER BY ut.created_at`

func (p *PG) Profile(ctx context.Context, id string) (Profile, error) {
	u, err := p.UserByID(ctx, id)
	if err != nil {
		return Profile{}, err
	}
	out := Profile{User: u, Topics: []Tag{}}
	var prefs []byte
	if err := p.DB.QueryRowContext(ctx, qProfileExtra, id).Scan(&out.DisplayName, &prefs, &out.Stats.Watchlist, &out.Stats.AlertsActive,
		&out.Stats.AlertsTriggered, &out.Stats.Bookmarks, &out.Stats.Topics); err != nil {
		return Profile{}, notFound(err)
	}
	out.Preferences = prefs
	rows, err := p.DB.QueryContext(ctx, qProfileTopics, id)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.Slug, &t.Name); err != nil {
			return out, err
		}
		out.Topics = append(out.Topics, t)
	}
	return out, rows.Err()
}

// ProfileUpdate: field nil = tidak diubah.
type ProfileUpdate struct {
	FullName    *string
	DisplayName *string // "" = hapus
	Phone       *string // "" = hapus (sudah dinormalisasi E.164)
	Preferences json.RawMessage
}

const qUpdateProfile = `
UPDATE users SET
  full_name    = coalesce($2::text, full_name),
  display_name = CASE WHEN $3::text IS NULL THEN display_name ELSE nullif($3::text, '') END,
  phone_e164   = CASE WHEN $4::text IS NULL THEN phone_e164 ELSE nullif($4::text, '') END,
  preferences  = CASE WHEN $5::jsonb IS NULL THEN preferences ELSE preferences || $5::jsonb END,
  updated_at   = now()
WHERE id = $1::uuid AND deleted_at IS NULL`

func (p *PG) UpdateProfile(ctx context.Context, id string, in ProfileUpdate) error {
	var prefs any
	if len(in.Preferences) > 0 {
		prefs = string(in.Preferences)
	}
	_, err := p.DB.ExecContext(ctx, qUpdateProfile, id, in.FullName, in.DisplayName, in.Phone, prefs)
	return err
}

const qSessions = `
SELECT id, coalesce(user_agent, ''), coalesce(host(ip), ''), created_at, expires_at, token_hash
FROM refresh_tokens WHERE user_id = $1::uuid AND revoked_at IS NULL AND expires_at > now()
ORDER BY created_at DESC LIMIT 20`

func (p *PG) Sessions(ctx context.Context, userID string) ([]Session, error) {
	rows, err := p.DB.QueryContext(ctx, qSessions, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Session{}
	for rows.Next() {
		var s Session
		if err := rows.Scan(&s.ID, &s.UserAgent, &s.IP, &s.CreatedAt, &s.ExpiresAt, &s.Hash); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

const qRevokeSession = `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $2::uuid AND user_id = $1::uuid AND revoked_at IS NULL`

func (p *PG) RevokeSession(ctx context.Context, userID, sessionID string) error {
	res, err := p.DB.ExecContext(ctx, qRevokeSession, userID, sessionID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return notFound(sql.ErrNoRows)
	}
	return nil
}

const qFollowTopic = `INSERT INTO user_topics (user_id, tag_id) SELECT $1::uuid, id FROM tags WHERE slug = $2::text ON CONFLICT DO NOTHING`
const qTagExists = `SELECT EXISTS (SELECT 1 FROM tags WHERE slug = $1::text)`
const qUnfollowTopic = `DELETE FROM user_topics WHERE user_id = $1::uuid AND tag_id = (SELECT id FROM tags WHERE slug = $2::text)`

func (p *PG) FollowTopic(ctx context.Context, userID, slug string) error {
	var ok bool
	if err := p.DB.QueryRowContext(ctx, qTagExists, slug).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return notFound(sql.ErrNoRows)
	}
	_, err := p.DB.ExecContext(ctx, qFollowTopic, userID, slug)
	return err
}

func (p *PG) UnfollowTopic(ctx context.Context, userID, slug string) error {
	_, err := p.DB.ExecContext(ctx, qUnfollowTopic, userID, slug)
	return err
}

const qActiveAlerts = `SELECT count(*) FROM price_alerts WHERE user_id = $1::uuid AND active`

func (p *PG) ActiveAlertCount(ctx context.Context, userID string) (int, error) {
	var n int
	err := p.DB.QueryRowContext(ctx, qActiveAlerts, userID).Scan(&n)
	return n, err
}

// SetAvatar menyimpan foto profil baru dan menghapus foto lama milik pengguna (satu transaksi).
const qSetAvatar = `
WITH old AS (SELECT avatar_media_id AS id FROM users WHERE id = $4::uuid),
ins AS (INSERT INTO media (mime, size, bytes, uploaded_by) VALUES ($1::text, $2::int, $3::bytea, $4::uuid) RETURNING id),
upd AS (UPDATE users SET avatar_media_id = (SELECT id FROM ins), updated_at = now() WHERE id = $4::uuid RETURNING 1),
del AS (DELETE FROM media WHERE id = (SELECT id FROM old) AND uploaded_by = $4::uuid RETURNING 1)
SELECT id FROM ins`

func (p *PG) SetAvatar(ctx context.Context, userID, mime string, data []byte) (string, error) {
	var id string
	err := p.DB.QueryRowContext(ctx, qSetAvatar, mime, len(data), data, userID).Scan(&id)
	return id, err
}

const qRemoveAvatar = `
WITH old AS (SELECT avatar_media_id AS id FROM users WHERE id = $1::uuid),
upd AS (UPDATE users SET avatar_media_id = NULL, updated_at = now() WHERE id = $1::uuid RETURNING 1)
DELETE FROM media WHERE id = (SELECT id FROM old) AND uploaded_by = $1::uuid`

func (p *PG) RemoveAvatar(ctx context.Context, userID string) error {
	_, err := p.DB.ExecContext(ctx, qRemoveAvatar, userID)
	return err
}

func profileQueries() map[string]string {
	return map[string]string{"set_avatar": qSetAvatar, "remove_avatar": qRemoveAvatar, "profile_extra": qProfileExtra, "profile_topics": qProfileTopics, "update_profile": qUpdateProfile, "sessions": qSessions,
		"revoke_session": qRevokeSession, "follow_topic": qFollowTopic, "tag_exists": qTagExists, "unfollow_topic": qUnfollowTopic, "active_alerts": qActiveAlerts}
}
