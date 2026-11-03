package api

import (
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/httpx"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// Super Admin selalu memegang semua izin (tidak bisa dikunci keluar dari RBAC).
const superRole = "superadmin"

const inviteTTL = 48 * time.Hour

var (
	roleKeyRe = regexp.MustCompile(`^[a-z][a-z0-9_]{1,31}$`)
	emailRe   = regexp.MustCompile(`^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$`)
)

type rbacResponse struct {
	store.RBAC
	Staff       []store.StaffMember `json:"staff"`
	Invitations []store.Invitation  `json:"invitations"`
	Me          string              `json:"me"`
}

// GET /v1/admin/rbac — peran, izin, matriks, anggota staf, dan undangan.
func (s *Server) rbacState(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "rbac.manage"); err != nil {
		return err
	}
	st, err := s.Store.RBACState(r.Context())
	if err != nil {
		return err
	}
	staff, err := s.Store.StaffMembers(r.Context())
	if err != nil {
		return err
	}
	inv, err := s.Store.Invitations(r.Context(), s.Now())
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, rbacResponse{RBAC: st, Staff: staff, Invitations: inv, Me: claims(r).Sub})
	return nil
}

// PUT /v1/admin/rbac/matrix {matrix: {role: [izin…]}} — simpan matriks izin.
func (s *Server) rbacMatrix(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "rbac.manage"); err != nil {
		return err
	}
	var in struct {
		Matrix map[string][]string `json:"matrix"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	st, err := s.Store.RBACState(r.Context())
	if err != nil {
		return err
	}
	perms := map[string]bool{}
	for _, p := range st.Permissions {
		perms[p.Key] = true
	}
	roles := map[string]store.Role{}
	for _, ro := range st.Roles {
		roles[ro.Key] = ro
	}
	out := map[string][]string{}
	changes := map[string]any{}
	for role, list := range in.Matrix {
		ro, ok := roles[role]
		if !ok {
			return httpx.Validation(map[string]string{"matrix": "Role tidak dikenal: " + role})
		}
		if role == superRole {
			continue // selalu semua izin
		}
		seen := map[string]bool{}
		clean := []string{}
		for _, p := range list {
			if !perms[p] {
				return httpx.Validation(map[string]string{"matrix": "Izin tidak dikenal: " + p})
			}
			if !seen[p] {
				seen[p] = true
				clean = append(clean, p)
			}
		}
		if !ro.IsStaff && len(clean) > 0 {
			return httpx.Validation(map[string]string{"matrix": "Role " + ro.Name + " bukan staf; tidak bisa diberi izin panel."})
		}
		sort.Strings(clean)
		if strings.Join(clean, ",") != strings.Join(sorted(st.Matrix[role]), ",") {
			out[role] = clean
			changes[role] = map[string]any{"before": sorted(st.Matrix[role]), "after": clean}
		}
	}
	if len(out) > 0 {
		if err := s.Store.SetMatrix(r.Context(), out); err != nil {
			return err
		}
		s.audit(r, "rbac.matrix", "", changes)
	}
	return s.rbacState(w, r)
}

func sorted(v []string) []string {
	c := append([]string(nil), v...)
	sort.Strings(c)
	return c
}

// POST /v1/admin/rbac/roles {name, description}
func (s *Server) rbacCreateRole(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "rbac.manage"); err != nil {
		return err
	}
	var in struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Name, in.Description = strings.TrimSpace(in.Name), strings.TrimSpace(in.Description)
	key := store.NormalizeRoleKey(in.Name)
	f := map[string]string{}
	if n := len([]rune(in.Name)); n < 2 || n > 40 || !roleKeyRe.MatchString(key) {
		f["name"] = "Nama role 2–40 karakter (huruf/angka)."
	}
	if len([]rune(in.Description)) > 160 {
		f["description"] = "Deskripsi maksimal 160 karakter."
	}
	if len(f) > 0 {
		return httpx.Validation(f)
	}
	if err := s.Store.CreateRole(r.Context(), key, in.Name, in.Description); err != nil {
		return err
	}
	s.audit(r, "rbac.role_create", key, map[string]any{"name": in.Name})
	httpx.JSON(w, http.StatusCreated, map[string]string{"key": key, "name": in.Name})
	return nil
}

// DELETE /v1/admin/rbac/roles/{key}
func (s *Server) rbacDeleteRole(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "rbac.manage"); err != nil {
		return err
	}
	key := r.PathValue("key")
	if !roleKeyRe.MatchString(key) {
		return httpx.NotFound("Role tidak ditemukan.")
	}
	if err := s.Store.DeleteRole(r.Context(), key); err != nil {
		return err
	}
	s.audit(r, "rbac.role_delete", key, nil)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// POST /v1/admin/rbac/invitations {email, role, categories}
func (s *Server) rbacInvite(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "rbac.manage"); err != nil {
		return err
	}
	var in struct {
		Email      string   `json:"email"`
		Role       string   `json:"role"`
		Categories []string `json:"categories"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	f := map[string]string{}
	if !emailRe.MatchString(in.Email) || len(in.Email) > 200 {
		f["email"] = "Email tidak valid."
	}
	st, err := s.Store.RBACState(r.Context())
	if err != nil {
		return err
	}
	var role *store.Role
	for i := range st.Roles {
		if st.Roles[i].Key == in.Role {
			role = &st.Roles[i]
		}
	}
	if role == nil || !role.IsStaff {
		f["role"] = "Pilih role staf."
	}
	cats := []string{}
	for _, c := range in.Categories {
		if c = strings.TrimSpace(c); c != "" && len(cats) < 20 {
			cats = append(cats, c)
		}
	}
	if len(f) > 0 {
		return httpx.Validation(f)
	}
	if role.Key == superRole && !can(r, "rbac.manage") {
		return httpx.Forbidden("Hanya Super Admin yang bisa mengundang Super Admin.")
	}
	id, err := s.Store.CreateInvitation(r.Context(), in.Email, in.Role, cats, claims(r).Sub, s.Now().Add(inviteTTL))
	if err != nil {
		return err
	}
	s.audit(r, "rbac.invite", id, map[string]any{"email": in.Email, "role": in.Role, "categories": cats})
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id, "expires_at": s.Now().Add(inviteTTL)})
	return nil
}

// DELETE /v1/admin/rbac/invitations/{id}
func (s *Server) rbacRevokeInvite(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "rbac.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if err := s.Store.RevokeInvitation(r.Context(), id); err != nil {
		return err
	}
	s.audit(r, "rbac.invite_revoke", id, nil)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// PATCH /v1/admin/users/{id}/role {role}
func (s *Server) setUserRole(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "rbac.manage"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if id == claims(r).Sub {
		return httpx.Forbidden("Tidak bisa mengubah role akun sendiri.")
	}
	var in struct {
		Role string `json:"role"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if !roleKeyRe.MatchString(in.Role) {
		return httpx.Validation(map[string]string{"role": "Role tidak dikenal."})
	}
	before, err := s.Store.UserAccess(r.Context(), id)
	if err != nil {
		return err
	}
	if err := s.Store.SetUserRole(r.Context(), id, in.Role); err != nil {
		return err
	}
	s.audit(r, "rbac.user_role", id, map[string]any{"before": before.Role, "after": in.Role})
	return s.rbacState(w, r)
}

// POST /v1/admin/users/{id}/block {blocked}
func (s *Server) blockUser(w http.ResponseWriter, r *http.Request) error {
	if err := need(r, "users.ban"); err != nil {
		return err
	}
	id, err := pathID(r)
	if err != nil {
		return err
	}
	if id == claims(r).Sub {
		return httpx.Forbidden("Tidak bisa memblokir akun sendiri.")
	}
	var in struct {
		Blocked bool `json:"blocked"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	target, err := s.Store.UserAccess(r.Context(), id)
	if err != nil {
		return err
	}
	if target.Has("rbac.manage") && !can(r, "rbac.manage") {
		return httpx.Forbidden("Akun pengelola RBAC hanya bisa diblokir Super Admin.")
	}
	if err := s.Store.SetBlocked(r.Context(), id, in.Blocked); err != nil {
		return err
	}
	action := "users.unblock"
	if in.Blocked {
		action = "users.block"
	}
	s.audit(r, action, id, nil)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// GET /v1/admin/staff — daftar staf (nama & peran) untuk pilihan penanggung jawab; tanpa rbac.manage.
func (s *Server) staffList(w http.ResponseWriter, r *http.Request) error {
	staff, err := s.Store.StaffMembers(r.Context())
	if err != nil {
		return err
	}
	w.Header().Set("Cache-Control", "private, no-store")
	httpx.JSON(w, 200, map[string]any{"data": staff})
	return nil
}
