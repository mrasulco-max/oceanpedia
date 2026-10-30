# Kontribusi

- Branch dari `main`, nama `feat/…`, `fix/…`, `chore/…`.
- Pesan commit mengikuti [Conventional Commits](https://www.conventionalcommits.org/): `feat(api): tambah endpoint alert`.
- Sebelum PR: `make lint` dan `make api-test` harus lulus; CI wajib hijau.
- Perubahan skema database selalu lewat migrasi baru (`api/migrations/000N_nama.up.sql` + `.down.sql`), jangan ubah migrasi yang sudah rilis.
- Jangan pernah commit `.env`, API key, atau data pribadi.
