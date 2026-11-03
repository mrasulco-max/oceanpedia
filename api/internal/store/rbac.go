package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
)

func pgCode(err error, code string) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE "+code)
}

// jsonArr membaca kolom JSON array teks.
type jsonArr struct{ v *[]string }

func (j jsonArr) Scan(src any) error {
	var b []byte
	switch x := src.(type) {
	case []byte:
		b = x
	case string:
		b = []byte(x)
	case nil:
		*j.v = []string{}
		return nil
	}
	*j.v = []string{}
	return json.Unmarshal(b, j.v)
}

// Role adalah peran (RBAC) dengan jumlah anggota aktif.
type Role struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	Description string `json:"description"`
	IsStaff     bool   `json:"is_staff"`
	IsSystem    bool   `json:"is_system"`
	Members     int    `json:"members"`
}

// Permission adalah satu izin di matriks.
type Permission struct {
	Key   string `json:"key"`
	Group string `json:"group"`
	Label string `json:"label"`
}

// RBAC adalah keadaan lengkap untuk halaman Role & Akses.
type RBAC struct {
	Roles       []Role              `json:"roles"`
	Permissions []Permission        `json:"permissions"`
	Matrix      map[string][]string `json:"matrix"` // role → izin
}

// Access adalah peran terkini pengguna (dibaca dari database pada tiap permintaan staf).
type Access struct {
	Role        string
	RoleName    string
	IsStaff     bool
	Blocked     bool
	Permissions []string
}

// Has: apakah peran punya izin ini.
func (a Access) Has(perm string) bool {
	for _, p := range a.Permissions {
		if p == perm {
			return true
		}
	}
	return false
}

// Invitation adalah undangan staf.
type Invitation struct {
	ID         string     `json:"id"`
	Email      string     `json:"email"`
	Role       string     `json:"role"`
	RoleName   string     `json:"role_name"`
	Categories []string   `json:"categories"`
	InvitedBy  *string    `json:"invited_by_name"`
	CreatedAt  time.Time  `json:"created_at"`
	ExpiresAt  time.Time  `json:"expires_at"`
	AcceptedAt *time.Time `json:"accepted_at"`
	RevokedAt  *time.Time `json:"revoked_at"`
	Status     string     `json:"status"` // pending | expired | accepted | revoked
}

// StaffMember adalah pengguna dengan peran staf.
type StaffMember struct {
	ID        string     `json:"id"`
	Email     string     `json:"email"`
	FullName  string     `json:"full_name"`
	Role      string     `json:"role"`
	RoleName  string     `json:"role_name"`
	AvatarID  *string    `json:"avatar_id"`
	BlockedAt *time.Time `json:"blocked_at"`
	CreatedAt time.Time  `json:"created_at"`
	Desks     []string   `json:"desks"`
}

const qAccess = `
SELECT u.role, r.name, r.is_staff, (u.blocked_at IS NOT NULL AND (u.blocked_until IS NULL OR u.blocked_until > now())),
       coalesce(json_agg(rp.permission ORDER BY rp.permission) FILTER (WHERE rp.permission IS NOT NULL), '[]')::text
FROM users u
JOIN roles r ON r.key = u.role
LEFT JOIN role_permissions rp ON rp.role = u.role
WHERE u.id = $1::uuid AND u.deleted_at IS NULL
GROUP BY u.role, r.name, r.is_staff, u.blocked_at, u.blocked_until`

// UserAccess membaca peran & izin terkini seorang pengguna.
func (p *PG) UserAccess(ctx context.Context, userID string) (Access, error) {
	var a Access
	err := p.DB.QueryRowContext(ctx, qAccess, userID).Scan(&a.Role, &a.RoleName, &a.IsStaff, &a.Blocked, jsonArr{&a.Permissions})
	return a, notFound(err)
}

const qRoles = `
SELECT r.key, r.name, r.description, r.is_staff, r.is_system,
       (SELECT count(*) FROM users u WHERE u.role = r.key AND u.deleted_at IS NULL)::int
FROM roles r ORDER BY r.position, r.name`
const qPermissions = `SELECT key, grp, label FROM permissions ORDER BY position, key`
const qMatrix = `SELECT role, permission FROM role_permissions`

// RBACState mengembalikan peran, izin, dan matriksnya.
func (p *PG) RBACState(ctx context.Context) (RBAC, error) {
	out := RBAC{Roles: []Role{}, Permissions: []Permission{}, Matrix: map[string][]string{}}
	rows, err := p.DB.QueryContext(ctx, qRoles)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var r Role
		if err := rows.Scan(&r.Key, &r.Name, &r.Description, &r.IsStaff, &r.IsSystem, &r.Members); err != nil {
			rows.Close()
			return out, err
		}
		out.Roles = append(out.Roles, r)
		out.Matrix[r.Key] = []string{}
	}
	rows.Close()
	if rows, err = p.DB.QueryContext(ctx, qPermissions); err != nil {
		return out, err
	}
	for rows.Next() {
		var x Permission
		if err := rows.Scan(&x.Key, &x.Group, &x.Label); err != nil {
			rows.Close()
			return out, err
		}
		out.Permissions = append(out.Permissions, x)
	}
	rows.Close()
	if rows, err = p.DB.QueryContext(ctx, qMatrix); err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var role, perm string
		if err := rows.Scan(&role, &perm); err != nil {
			return out, err
		}
		out.Matrix[role] = append(out.Matrix[role], perm)
	}
	return out, rows.Err()
}

const qClearRolePerms = `DELETE FROM role_permissions WHERE role = $1`
const qAddRolePerms = `INSERT INTO role_permissions (role, permission) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`

// SetMatrix mengganti izin beberapa peran sekaligus (satu transaksi).
func (p *PG) SetMatrix(ctx context.Context, m map[string][]string) error {
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	for role, perms := range m {
		if _, err := tx.ExecContext(ctx, qClearRolePerms, role); err != nil {
			return err
		}
		if len(perms) > 0 {
			if _, err := tx.ExecContext(ctx, qAddRolePerms, role, pgTextArray(perms)); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

const qCreateRole = `INSERT INTO roles (key, name, description, is_staff, position)
VALUES ($1, $2, $3, true, 500 + (SELECT count(*) FROM roles)::int)`

// CreateRole membuat peran staf baru (tanpa izin).
func (p *PG) CreateRole(ctx context.Context, key, name, desc string) error {
	_, err := p.DB.ExecContext(ctx, qCreateRole, key, name, desc)
	if pgCode(err, "23505") {
		return httpx.Conflict("Role dengan nama itu sudah ada.")
	}
	return err
}

const qDeleteRole = `DELETE FROM roles r WHERE r.key = $1 AND NOT r.is_system
AND NOT EXISTS (SELECT 1 FROM users u WHERE u.role = r.key AND u.deleted_at IS NULL)`

// DeleteRole menghapus peran buatan sendiri yang tidak punya anggota.
func (p *PG) DeleteRole(ctx context.Context, key string) error {
	res, err := p.DB.ExecContext(ctx, qDeleteRole, key)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.Conflict("Role bawaan atau yang masih punya anggota tidak bisa dihapus.")
	}
	return nil
}

const qStaff = `
SELECT u.id, u.email, u.full_name, u.role, r.name, u.avatar_media_id, u.blocked_at, u.created_at,
       coalesce((SELECT json_agg(c.slug ORDER BY c.slug) FROM staff_desks d JOIN categories c ON c.id = d.category_id WHERE d.user_id = u.id), '[]')::text
FROM users u JOIN roles r ON r.key = u.role
WHERE u.deleted_at IS NULL AND r.is_staff
ORDER BY r.position, u.full_name
LIMIT 500`

// StaffMembers mengembalikan semua pengguna berperan staf.
func (p *PG) StaffMembers(ctx context.Context) ([]StaffMember, error) {
	rows, err := p.DB.QueryContext(ctx, qStaff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StaffMember{}
	for rows.Next() {
		var m StaffMember
		if err := rows.Scan(&m.ID, &m.Email, &m.FullName, &m.Role, &m.RoleName, &m.AvatarID, &m.BlockedAt, &m.CreatedAt, jsonArr{&m.Desks}); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

const qSetUserRole = `UPDATE users SET role = $2 WHERE id = $1::uuid AND deleted_at IS NULL`
const qRevokeTokens = `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1::uuid AND revoked_at IS NULL`

// SetUserRole mengganti peran pengguna. Sesi lamanya tetap berlaku, tetapi izin dibaca ulang dari database.
func (p *PG) SetUserRole(ctx context.Context, userID, role string) error {
	res, err := p.DB.ExecContext(ctx, qSetUserRole, userID, role)
	if pgCode(err, "23503") {
		return httpx.Validation(map[string]string{"role": "Role tidak dikenal."})
	}
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

const qBlockUser = `UPDATE users SET blocked_at = CASE WHEN $2 THEN now() ELSE NULL END, blocked_until = NULL,
  block_reason = CASE WHEN $2 THEN block_reason ELSE '' END WHERE id = $1::uuid AND deleted_at IS NULL`

// SetBlocked memblokir/membuka blokir pengguna; blokir juga mencabut semua sesinya.
func (p *PG) SetBlocked(ctx context.Context, userID string, blocked bool) error {
	res, err := p.DB.ExecContext(ctx, qBlockUser, userID, blocked)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	if blocked {
		_, err = p.DB.ExecContext(ctx, qRevokeTokens, userID)
	}
	return err
}

const qInvites = `
SELECT i.id, i.email, i.role, r.name, to_json(i.categories)::text, inv.full_name, i.created_at, i.expires_at, i.accepted_at, i.revoked_at
FROM staff_invitations i
JOIN roles r ON r.key = i.role
LEFT JOIN users inv ON inv.id = i.invited_by
WHERE i.revoked_at IS NULL AND (i.accepted_at IS NULL OR i.accepted_at > now() - interval '14 days')
ORDER BY i.created_at DESC
LIMIT 50`

// Invitations mengembalikan undangan terbuka, kedaluwarsa, dan yang baru diterima.
func (p *PG) Invitations(ctx context.Context, now time.Time) ([]Invitation, error) {
	rows, err := p.DB.QueryContext(ctx, qInvites)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Invitation{}
	for rows.Next() {
		var i Invitation
		if err := rows.Scan(&i.ID, &i.Email, &i.Role, &i.RoleName, jsonArr{&i.Categories}, &i.InvitedBy, &i.CreatedAt, &i.ExpiresAt, &i.AcceptedAt, &i.RevokedAt); err != nil {
			return nil, err
		}
		i.Status = inviteStatus(i, now)
		out = append(out, i)
	}
	return out, rows.Err()
}

func inviteStatus(i Invitation, now time.Time) string {
	switch {
	case i.RevokedAt != nil:
		return "revoked"
	case i.AcceptedAt != nil:
		return "accepted"
	case !i.ExpiresAt.After(now):
		return "expired"
	}
	return "pending"
}

// Undangan lama (kedaluwarsa) untuk email yang sama ditutup dulu agar indeks unik tidak bentrok.
const qCloseOldInvites = `UPDATE staff_invitations SET revoked_at = now()
WHERE lower(email) = lower($1) AND accepted_at IS NULL AND revoked_at IS NULL`
const qCreateInvite = `INSERT INTO staff_invitations (email, role, categories, invited_by, expires_at)
VALUES (lower($1), $2, $3::text[], $4::uuid, $5) RETURNING id`

// CreateInvitation membuat undangan baru (menggantikan undangan terbuka untuk email yang sama).
func (p *PG) CreateInvitation(ctx context.Context, email, role string, categories []string, by string, expires time.Time) (string, error) {
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback() //nolint:errcheck
	if _, err := tx.ExecContext(ctx, qCloseOldInvites, email); err != nil {
		return "", err
	}
	var id string
	err = tx.QueryRowContext(ctx, qCreateInvite, email, role, pgTextArray(categories), by, expires).Scan(&id)
	if pgCode(err, "23503") {
		return "", httpx.Validation(map[string]string{"role": "Role tidak dikenal."})
	}
	if err != nil {
		return "", err
	}
	return id, tx.Commit()
}

const qRevokeInvite = `UPDATE staff_invitations SET revoked_at = now() WHERE id = $1::uuid AND accepted_at IS NULL AND revoked_at IS NULL`

// RevokeInvitation membatalkan undangan yang belum diterima.
func (p *PG) RevokeInvitation(ctx context.Context, id string) error {
	res, err := p.DB.ExecContext(ctx, qRevokeInvite, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

const qTakeInvite = `
UPDATE staff_invitations i SET accepted_at = now(), accepted_user = u.id
FROM users u
WHERE u.id = $1::uuid AND lower(i.email) = lower(u.email)
  AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
RETURNING i.id, i.role, to_json(i.categories)::text`
const qApplyInviteRole = `UPDATE users SET role = $2 WHERE id = $1::uuid`
const qSetDesks = `INSERT INTO staff_desks (user_id, category_id)
SELECT $1::uuid, c.id FROM categories c WHERE c.slug = ANY($2::text[]) ON CONFLICT DO NOTHING`

// AcceptInvitation menerapkan undangan terbuka untuk email pengguna ini (dipanggil saat masuk/verifikasi).
// Mengembalikan id undangan & peran baru, atau "" bila tidak ada undangan.
func (p *PG) AcceptInvitation(ctx context.Context, userID string) (string, string, error) {
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return "", "", err
	}
	defer tx.Rollback() //nolint:errcheck
	var id, role string
	var cats []string
	err = tx.QueryRowContext(ctx, qTakeInvite, userID).Scan(&id, &role, jsonArr{&cats})
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", nil
	}
	if err != nil {
		return "", "", err
	}
	if _, err := tx.ExecContext(ctx, qApplyInviteRole, userID, role); err != nil {
		return "", "", err
	}
	if len(cats) > 0 {
		if _, err := tx.ExecContext(ctx, qSetDesks, userID, pgTextArray(cats)); err != nil {
			return "", "", err
		}
	}
	return id, role, tx.Commit()
}

// NormalizeRoleKey membuat kunci peran dari nama ("Analis Pasar" → "analis_pasar").
func NormalizeRoleKey(name string) string {
	var b strings.Builder
	us := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			if b.Len() == 0 && r >= '0' && r <= '9' {
				b.WriteString("r")
			}
			b.WriteRune(r)
			us = false
		default:
			if b.Len() > 0 && !us {
				b.WriteByte('_')
				us = true
			}
		}
	}
	k := strings.Trim(b.String(), "_")
	if len(k) > 32 {
		k = strings.Trim(k[:32], "_")
	}
	return k
}

func rbacQueries() map[string]string {
	return map[string]string{
		"access": qAccess, "roles": qRoles, "permissions": qPermissions, "matrix": qMatrix, "clear_role_perms": qClearRolePerms,
		"add_role_perms": qAddRolePerms, "create_role": qCreateRole, "delete_role": qDeleteRole, "staff": qStaff,
		"set_user_role": qSetUserRole, "block_user": qBlockUser, "revoke_tokens": qRevokeTokens, "invites": qInvites,
		"close_old_invites": qCloseOldInvites, "create_invite": qCreateInvite, "revoke_invite": qRevokeInvite,
		"take_invite": qTakeInvite, "apply_invite_role": qApplyInviteRole, "set_desks": qSetDesks,
	}
}
