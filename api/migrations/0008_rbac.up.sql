-- RBAC: peran, izin, matriks peran→izin, undangan staf, dan desk (kategori) yang dipegang staf.
CREATE TABLE roles (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,31}$'),
  name        text NOT NULL CHECK (length(name) BETWEEN 2 AND 40),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 160),
  is_staff    boolean NOT NULL DEFAULT true,
  is_system   boolean NOT NULL DEFAULT false,
  position    int NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE permissions (
  key      text PRIMARY KEY CHECK (key ~ '^[a-z]+\.[a-z_]+$'),
  grp      text NOT NULL,
  label    text NOT NULL,
  position int NOT NULL
);

CREATE TABLE role_permissions (
  role       text NOT NULL REFERENCES roles (key) ON DELETE CASCADE ON UPDATE CASCADE,
  permission text NOT NULL REFERENCES permissions (key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission)
);

INSERT INTO roles (key, name, description, is_staff, is_system, position) VALUES
  ('superadmin', 'Super Admin', 'Akses penuh termasuk RBAC.', true, true, 10),
  ('admin',      'Admin',       'Konten, pengguna, iklan.', true, true, 20),
  ('editor',     'Editor',      'Review, terbit, BREAKING.', true, true, 30),
  ('author',     'Penulis',     'Tulis & terbitkan artikel sendiri.', true, true, 40),
  ('ads',        'Ads Ops',     'Kampanye & slot iklan.', true, true, 50),
  ('data',       'Data',        'Feed & kuota API.', true, true, 60),
  ('support',    'Support',     'Bantu & moderasi pengguna.', true, true, 70),
  ('reader',     'Pembaca',     'Pengguna situs & aplikasi.', false, true, 1000);

INSERT INTO permissions (key, grp, label, position) VALUES
  ('content.write',       'KONTEN',     'Tulis & edit artikel sendiri', 10),
  ('content.publish_own', 'KONTEN',     'Terbitkan artikel sendiri tanpa review', 20),
  ('content.publish',     'KONTEN',     'Review & terbitkan semua artikel', 30),
  ('content.breaking',    'KONTEN',     'Tandai BREAKING', 40),
  ('content.delete',      'KONTEN',     'Hapus artikel penulis lain', 50),
  ('users.read',          'PENGGUNA',   'Lihat pengguna', 60),
  ('users.ban',           'PENGGUNA',   'Blokir pengguna', 70),
  ('market.manage',       'DATA PASAR', 'Kelola simbol & alert', 80),
  ('market.read',         'DATA PASAR', 'Lihat kuota API', 90),
  ('ads.manage',          'IKLAN',      'Kelola kampanye', 100),
  ('revenue.read',        'IKLAN',      'Lihat pendapatan', 110),
  ('rbac.manage',         'SISTEM',     'Ubah role, izin & undangan staf', 120),
  ('audit.read',          'SISTEM',     'Lihat log aktivitas', 130);

INSERT INTO role_permissions (role, permission)
SELECT 'superadmin', key FROM permissions;
INSERT INTO role_permissions (role, permission) VALUES
  ('admin', 'content.write'), ('admin', 'content.publish_own'), ('admin', 'content.publish'), ('admin', 'content.breaking'),
  ('admin', 'content.delete'), ('admin', 'users.read'), ('admin', 'users.ban'), ('admin', 'market.manage'),
  ('admin', 'market.read'), ('admin', 'ads.manage'), ('admin', 'revenue.read'), ('admin', 'audit.read'),
  ('editor', 'content.write'), ('editor', 'content.publish_own'), ('editor', 'content.publish'), ('editor', 'content.breaking'),
  ('editor', 'content.delete'), ('editor', 'users.read'), ('editor', 'market.read'),
  ('author', 'content.write'), ('author', 'content.publish_own'),
  ('ads', 'ads.manage'), ('ads', 'revenue.read'),
  ('data', 'market.manage'), ('data', 'market.read'),
  ('support', 'users.read'), ('support', 'users.ban');

-- Peran pengguna kini mengacu tabel roles (bukan daftar tetap). Admin lama = Super Admin.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role = 'superadmin' WHERE role = 'admin';
ALTER TABLE users ADD CONSTRAINT users_role_fkey FOREIGN KEY (role) REFERENCES roles (key) ON UPDATE CASCADE;
CREATE INDEX users_role_idx ON users (role) WHERE deleted_at IS NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

-- Undangan staf: role diterapkan saat pemilik email masuk/verifikasi dalam 48 jam.
CREATE TABLE staff_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role          text NOT NULL REFERENCES roles (key) ON UPDATE CASCADE ON DELETE CASCADE,
  categories    text[] NOT NULL DEFAULT '{}',
  invited_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  accepted_at   timestamptz,
  accepted_user uuid REFERENCES users (id) ON DELETE SET NULL,
  revoked_at    timestamptz
);
CREATE UNIQUE INDEX staff_invitations_open_uq ON staff_invitations (lower(email)) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX staff_invitations_created_idx ON staff_invitations (created_at DESC);

-- Desk: kategori yang dipegang staf (dari undangan atau diatur admin).
CREATE TABLE staff_desks (
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, category_id)
);
