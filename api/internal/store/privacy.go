package store

import (
	"context"
	"database/sql"
)

// ======================================================================= data pribadi (UU PDP): unduh & hapus akun mandiri

// Semua data milik pengguna dalam satu dokumen JSON (tanpa hash sandi, token, atau data pengguna lain).
const qExportUser = `SELECT json_build_object(
  'exported_at', now(),
  'account', (SELECT json_build_object('id', u.id, 'email', u.email, 'full_name', u.full_name, 'display_name', u.display_name,
      'phone', u.phone_e164, 'role', u.role, 'created_at', u.created_at, 'last_login_at', u.last_login_at, 'email_verified_at', u.email_verified_at,
      'preferences', u.preferences - 'totp_secret' - 'totp_pending' - 'totp_recovery' - 'totp_last_step' - 'totp_fail', 'totp_enabled', COALESCE(u.preferences->>'totp_secret', '') <> '', 'two_factor_reader', COALESCE((u.preferences->>'login_2fa')::boolean, false))
    FROM users u WHERE u.id = $1::uuid),
  'watchlist', (SELECT COALESCE(json_agg(json_build_object('watchlist', w.name, 'symbol', wi.symbol, 'added_at', wi.added_at) ORDER BY wi.added_at), '[]')
    FROM watchlist_items wi JOIN watchlists w ON w.id = wi.watchlist_id WHERE w.user_id = $1::uuid),
  'price_alerts', (SELECT COALESCE(json_agg(to_jsonb(t) - 'user_id' ORDER BY t.created_at), '[]') FROM price_alerts t WHERE t.user_id = $1::uuid),
  'bookmarks', (SELECT COALESCE(json_agg(json_build_object('article', a.title, 'url', '/berita/' || a.slug, 'saved_at', b.created_at) ORDER BY b.created_at), '[]')
    FROM bookmarks b JOIN articles a ON a.id = b.article_id WHERE b.user_id = $1::uuid),
  'reactions', (SELECT COALESCE(json_agg(json_build_object('article', a.title, 'kind', r.kind, 'at', r.created_at)), '[]')
    FROM reactions r JOIN articles a ON a.id = r.article_id WHERE r.user_id = $1::uuid),
  'follows', json_build_object(
    'topics', (SELECT COALESCE(json_agg(t.name), '[]') FROM user_topics ut JOIN tags t ON t.id = ut.tag_id WHERE ut.user_id = $1::uuid),
    'categories', (SELECT COALESCE(json_agg(c.name), '[]') FROM user_categories uc JOIN categories c ON c.id = uc.category_id WHERE uc.user_id = $1::uuid),
    'authors', (SELECT COALESCE(json_agg(a.name), '[]') FROM user_authors ua JOIN authors a ON a.id = ua.author_id WHERE ua.user_id = $1::uuid)),
  'comments', (SELECT COALESCE(json_agg(json_build_object('article', a.title, 'body', c.body, 'status', c.status, 'reply', c.parent_id IS NOT NULL, 'at', c.created_at) ORDER BY c.created_at), '[]')
    FROM comments c JOIN articles a ON a.id = c.article_id WHERE c.user_id = $1::uuid),
  'short_comments', (SELECT COALESCE(json_agg(json_build_object('short', s.title, 'body', c.body, 'status', c.status, 'at', c.created_at) ORDER BY c.created_at), '[]')
    FROM short_comments c JOIN shorts s ON s.id = c.short_id WHERE c.user_id = $1::uuid),
  'trading_journal', (SELECT COALESCE(json_agg(to_jsonb(j) - 'user_id' ORDER BY j.opened_at), '[]') FROM trading_journal j WHERE j.user_id = $1::uuid),
  'event_reminders', (SELECT COALESCE(json_agg(to_jsonb(e) - 'user_id'), '[]') FROM event_reminders e WHERE e.user_id = $1::uuid),
  'subscriptions', (SELECT COALESCE(json_agg(to_jsonb(s) - 'user_id' ORDER BY s.created_at), '[]') FROM subscriptions s WHERE s.user_id = $1::uuid),
  'invoices', (SELECT COALESCE(json_agg(to_jsonb(i) - 'user_id' ORDER BY i.issued_at), '[]') FROM invoices i WHERE i.user_id = $1::uuid),
  'newsletter', (SELECT COALESCE(json_agg(json_build_object('email', n.email, 'lists', n.lists, 'status', n.status, 'since', n.created_at)), '[]')
    FROM newsletter_subscribers n WHERE n.user_id = $1::uuid OR n.email = (SELECT email FROM users WHERE id = $1::uuid)),
  'notifications', (SELECT COALESCE(json_agg(json_build_object('kind', x.template, 'content', x.payload, 'at', x.created_at, 'read_at', x.read_at) ORDER BY x.created_at DESC), '[]')
    FROM (SELECT * FROM notifications WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 500) x),
  'sessions', (SELECT COALESCE(json_agg(json_build_object('device', t.user_agent, 'ip', t.ip, 'signed_in_at', t.created_at, 'expires_at', t.expires_at, 'revoked_at', t.revoked_at) ORDER BY t.created_at DESC), '[]')
    FROM refresh_tokens t WHERE t.user_id = $1::uuid),
  'requests', (SELECT COALESCE(json_agg(json_build_object('kind', p.kind, 'status', p.status, 'at', p.created_at)), '[]') FROM privacy_requests p WHERE p.user_id = $1::uuid)
)::text`

// ExportUser mengembalikan seluruh data pengguna sebagai JSON.
func (p *PG) ExportUser(ctx context.Context, uid string) (string, error) {
	var out string
	err := p.DB.QueryRowContext(ctx, qExportUser, uid).Scan(&out)
	return out, notFound(err)
}

// Penghapusan akun: data pribadi dihapus/dianonimkan, sesi dicabut, langganan dihentikan.
// Komentar tetap ada (diskusi publik) dengan nama "Pengguna terhapus"; tagihan disimpan untuk kewajiban pajak.
var qDeleteAccount = []string{
	`DELETE FROM newsletter_subscribers WHERE user_id = $1::uuid OR email = (SELECT email FROM users WHERE id = $1::uuid)`,
	`DELETE FROM watchlists WHERE user_id = $1::uuid`,
	`DELETE FROM price_alerts WHERE user_id = $1::uuid`,
	`DELETE FROM bookmarks WHERE user_id = $1::uuid`,
	`DELETE FROM reactions WHERE user_id = $1::uuid`,
	`DELETE FROM user_topics WHERE user_id = $1::uuid`,
	`DELETE FROM user_categories WHERE user_id = $1::uuid`,
	`DELETE FROM user_authors WHERE user_id = $1::uuid`,
	`DELETE FROM event_reminders WHERE user_id = $1::uuid`,
	`DELETE FROM trading_journal WHERE user_id = $1::uuid`,
	`DELETE FROM short_likes WHERE user_id = $1::uuid`,
	`DELETE FROM short_saves WHERE user_id = $1::uuid`,
	`DELETE FROM notifications WHERE user_id = $1::uuid`,
	`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL`,
	`UPDATE subscriptions SET status = 'canceled', cancel_at_period_end = true, current_period_end = LEAST(COALESCE(current_period_end, now()), now()), updated_at = now()
	  WHERE user_id = $1::uuid AND status IN ('active', 'past_due', 'pending')`,
	// Foto profil dilepas dari akun lalu dihapus (satu pernyataan, sehingga referensi sudah kosong saat dicek).
	`WITH old AS (SELECT avatar_media_id AS m FROM users WHERE id = $1::uuid), upd AS (UPDATE users SET avatar_media_id = NULL WHERE id = $1::uuid RETURNING id)
	  DELETE FROM media WHERE id = (SELECT m FROM old) AND EXISTS (SELECT 1 FROM upd)`,
	`INSERT INTO privacy_requests (user_id, kind, detail, status, handled_at) VALUES ($1::uuid, 'delete', 'Dihapus mandiri oleh pengguna', 'done', now())`,
	`UPDATE users SET email = 'terhapus+' || id::text || '@oceanpedia.invalid', full_name = 'Pengguna terhapus', display_name = NULL, phone_e164 = NULL,
	  password_hash = NULL, avatar_media_id = NULL, preferences = '{}'::jsonb, email_verified_at = NULL, phone_verified_at = NULL,
	  deleted_at = now(), updated_at = now() WHERE id = $1::uuid AND deleted_at IS NULL`,
}

// DeleteAccount menghapus akun pengguna dalam satu transaksi.
func (p *PG) DeleteAccount(ctx context.Context, uid string) error {
	tx, err := p.DB.BeginTx(ctx, &sql.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, q := range qDeleteAccount {
		if _, err := tx.ExecContext(ctx, q, uid); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func privacyQueries() map[string]string {
	out := map[string]string{"export_user": qExportUser}
	for i, q := range qDeleteAccount {
		out["delete_account_"+string(rune('a'+i))] = q
	}
	return out
}
