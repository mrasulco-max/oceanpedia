package api

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/mrasulco-max/oceanpedia/api/internal/auth"
	"github.com/mrasulco-max/oceanpedia/api/internal/store"
)

// fakeRBAC menyimpan matriks & undangan di memori.
type fakeRBAC struct {
	*fakeAdmin
	matrix  map[string][]string
	invites []store.Invitation
	roles   map[string]string
}

func (f *fakeRBAC) RBACState(context.Context) (store.RBAC, error) {
	st := store.RBAC{Matrix: map[string][]string{}}
	for _, k := range []string{"superadmin", "admin", "editor", "author", "ads", "support", "reader"} {
		st.Roles = append(st.Roles, store.Role{Key: k, Name: k, IsStaff: k != "reader", IsSystem: true})
		st.Matrix[k] = f.matrix[k]
	}
	for _, p := range testMatrix["superadmin"] {
		st.Permissions = append(st.Permissions, store.Permission{Key: p})
	}
	return st, nil
}
func (f *fakeRBAC) SetMatrix(_ context.Context, m map[string][]string) error {
	for k, v := range m {
		f.matrix[k] = v
	}
	return nil
}
func (f *fakeRBAC) StaffMembers(context.Context) ([]store.StaffMember, error) { return nil, nil }
func (f *fakeRBAC) Invitations(context.Context, time.Time) ([]store.Invitation, error) {
	return f.invites, nil
}
func (f *fakeRBAC) CreateInvitation(_ context.Context, email, role string, cats []string, _ string, exp time.Time) (string, error) {
	f.invites = append(f.invites, store.Invitation{ID: "22222222-2222-2222-2222-222222222222", Email: email, Role: role, Categories: cats, ExpiresAt: exp, Status: "pending"})
	return "22222222-2222-2222-2222-222222222222", nil
}
func (f *fakeRBAC) SetUserRole(_ context.Context, id, role string) error {
	f.roles[id] = role
	return nil
}
func (f *fakeRBAC) UserAccess(ctx context.Context, id string) (store.Access, error) {
	a, err := f.fake.UserAccess(ctx, id)
	if err == nil {
		a.Permissions = f.matrix[a.Role]
	}
	return a, err
}

func TestRBACEndpoints(t *testing.T) {
	s, _ := newTest(t)
	m := map[string][]string{}
	for k, v := range testMatrix {
		m[k] = append([]string(nil), v...)
	}
	fr := &fakeRBAC{fakeAdmin: &fakeAdmin{fake: s.Store.(*fake)}, matrix: m, roles: map[string]string{}}
	s.Store = fr
	h := s.Handler()
	tok := func(sub string) string {
		t, _ := auth.Sign(s.Cfg.JWTSecret, auth.Claims{Sub: sub, Role: "reader"}, time.Minute, time.Now())
		return "Bearer " + t
	}
	super, editor, author := tok("u-superadmin"), tok("u-editor"), tok("u-author")

	if w := do(h, "GET", "/v1/admin/rbac", "", "Authorization", editor); w.Code != 403 {
		t.Fatalf("editor tanpa rbac.manage harus 403: %d", w.Code)
	}
	w := do(h, "GET", "/v1/admin/rbac", "", "Authorization", super)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"rbac.manage"`) {
		t.Fatalf("super admin baca RBAC: %d %s", w.Code, w.Body)
	}
	// Cabut content.publish_own dari penulis → penulis tak bisa terbit langsung lagi.
	w = do(h, "PUT", "/v1/admin/rbac/matrix", `{"matrix":{"author":["content.write"],"superadmin":[]}}`, "Authorization", super)
	if w.Code != 200 || strings.Join(fr.matrix["author"], ",") != "content.write" || len(fr.matrix["superadmin"]) != 13 {
		t.Fatalf("simpan matriks: %d %v %v", w.Code, fr.matrix["author"], len(fr.matrix["superadmin"]))
	}
	body := `{"title":"Uji RBAC terbit langsung","excerpt":"Ringkas.","body":"JAKARTA — IHSG ditutup menguat pada sesi pertama ditopang saham bank besar.","category":"saham","symbols":["BBCA"],"action":"publish"}`
	if w := do(h, "POST", "/v1/admin/articles", body, "Authorization", author); w.Code != 403 {
		t.Fatalf("penulis tanpa publish_own harus 403: %d %s", w.Code, w.Body)
	}
	if w := do(h, "PUT", "/v1/admin/rbac/matrix", `{"matrix":{"author":["izin.palsu"]}}`, "Authorization", super); w.Code != 422 {
		t.Fatalf("izin tak dikenal harus 422: %d", w.Code)
	}
	if w := do(h, "PUT", "/v1/admin/rbac/matrix", `{"matrix":{"reader":["content.write"]}}`, "Authorization", super); w.Code != 422 {
		t.Fatalf("pembaca bukan staf harus 422: %d", w.Code)
	}
	// Undangan.
	if w := do(h, "POST", "/v1/admin/rbac/invitations", `{"email":"bukan-email","role":"author"}`, "Authorization", super); w.Code != 422 {
		t.Fatalf("email salah harus 422: %d", w.Code)
	}
	if w := do(h, "POST", "/v1/admin/rbac/invitations", `{"email":"x@oceanbird.id","role":"reader"}`, "Authorization", super); w.Code != 422 {
		t.Fatalf("role pembaca harus 422: %d", w.Code)
	}
	w = do(h, "POST", "/v1/admin/rbac/invitations", `{"email":"Laras@OceanBird.id","role":"author","categories":["saham"]}`, "Authorization", super)
	if w.Code != 201 || len(fr.invites) != 1 || fr.invites[0].Email != "laras@oceanbird.id" {
		t.Fatalf("undang: %d %s", w.Code, w.Body)
	}
	// Role pengguna.
	if w := do(h, "PATCH", "/v1/admin/users/u-superadmin/role", `{"role":"author"}`, "Authorization", super); w.Code != 404 {
		t.Fatalf("id bukan uuid: %d", w.Code)
	}
	target := "33333333-3333-3333-3333-333333333333"
	s.Store.(*fakeRBAC).users["t@x"] = store.User{ID: target, Role: "reader"}
	w = do(h, "PATCH", "/v1/admin/users/"+target+"/role", `{"role":"editor"}`, "Authorization", super)
	if w.Code != 200 || fr.roles[target] != "editor" {
		t.Fatalf("ubah role: %d %s", w.Code, w.Body)
	}
	if w := do(h, "PATCH", "/v1/admin/users/"+target+"/role", `{"role":"editor"}`, "Authorization", editor); w.Code != 403 {
		t.Fatalf("editor ubah role harus 403: %d", w.Code)
	}
	var st rbacResponse
	_ = json.Unmarshal(w.Body.Bytes(), &st)
}

func TestNormalizeRoleKey(t *testing.T) {
	for in, want := range map[string]string{"Analis Pasar": "analis_pasar", "  Ads—Ops 2 ": "ads_ops_2", "9 Desk": "r9_desk"} {
		if got := store.NormalizeRoleKey(in); got != want {
			t.Errorf("%q → %q, mau %q", in, got, want)
		}
	}
}

func TestBlockedUserCannotLogin(t *testing.T) {
	s, h := newTest(t)
	f := s.Store.(*fake)
	do(h, "POST", "/v1/auth/register", `{"email":"blok@example.com","password":"Sandi-lama1","full_name":"Blok"}`)
	if w := do(h, "POST", "/v1/auth/verify", `{"email":"blok@example.com","code":"123456"}`); w.Code != 200 || !strings.Contains(w.Body.String(), `"permissions":[]`) || !strings.Contains(w.Body.String(), `"is_staff":false`) {
		t.Fatalf("verifikasi + izin pembaca: %d %s", w.Code, w.Body)
	}
	f.blocked = map[string]bool{f.users["blok@example.com"].ID: true}
	if w := do(h, "POST", "/v1/auth/login", `{"email":"blok@example.com","password":"Sandi-lama1"}`); w.Code != 403 {
		t.Fatalf("akun diblokir harus 403: %d %s", w.Code, w.Body)
	}
}
