# OceanPedia / OceanBird

Platform berita & data pasar (fokus saham AS & forex, plus komoditas dan crypto; saham IDX dinonaktifkan sementara) — website dan app dalam satu basis kode web.

| Lapisan | Teknologi |
|---|---|
| Frontend | **Next.js 15** (App Router, React 19, TypeScript strict) |
| Backend | **Go 1.24** (`net/http`, `database/sql` + pgx) — REST `/v1` |
| Database | **PostgreSQL 16** |
| Data pasar | Twelve Data (hanya dipanggil dari server) |

## Satu URL, dua tampilan

`web/src/middleware.ts` mendeteksi perangkat (Client Hint `Sec-CH-UA-Mobile`, lalu User-Agent):

- **Desktop / tablet → UI website** (header, rail iklan 160×600, grafik ala TradingView).
- **Ponsel → UI app** (header ringkas, bottom navigation, slider).

URL, SEO, dan data tetap sama; akun, watchlist, dan langganan otomatis sinkron karena satu API.
Paksa tampilan untuk uji: tambahkan `?layout=web` atau `?layout=app` (tersimpan di cookie).

## Struktur

```
api/                 Backend Go
  cmd/api/           entrypoint (serve | migrate)
  internal/api/      handler REST v1
  internal/store/    model + implementasi PostgreSQL
  internal/market/   Twelve Data + cache + data contoh
  internal/auth/     PBKDF2 (OWASP) + JWT HS256
  internal/httpx/    RFC 9457 problem+json, middleware keamanan
  migrations/        migrasi SQL (ditanam ke biner)
  openapi.yaml       kontrak API (OpenAPI 3.1)
web/                 Frontend Next.js
db/seed/             data contoh development
.github/workflows/   CI: lint, test, integration test, build, smoke test desktop/mobile
```

## Menjalankan

```bash
cp .env.example .env            # isi API_JWT_SECRET (≥32 karakter) dan TWELVEDATA_API_KEY bila ada
docker compose up --build       # db + api + web
docker compose --profile seed run --rm seed   # data contoh
```

Buka http://localhost:3000 (desktop) — atau dari ponsel/DevTools mode perangkat untuk UI app.
API: http://localhost:8080/v1/home · spesifikasi: `api/openapi.yaml`.

Tanpa Docker: `make api-run` (butuh PostgreSQL & `DATABASE_URL`) dan `make web-dev`.
Pertama kali, jalankan `cd api && go mod tidy` lalu commit `go.sum`, dan `cd web && npm install` lalu commit `package-lock.json`.

## Standar yang diterapkan

- **API**: REST berversi (`/v1`), error RFC 9457, waktu ISO 8601 UTC, uang dalam satuan terkecil + ISO 4217, negara ISO 3166-1, paginasi keyset, `Cache-Control` per endpoint, kontrak OpenAPI 3.1.
- **Keamanan (OWASP)**: kata sandi PBKDF2-HMAC-SHA256 600.000 iterasi, aturan NIST SP 800-63B, refresh token sekali pakai (rotasi) & disimpan sebagai hash, token web di cookie `httpOnly`, rate limit, CORS allowlist, security headers (HSTS, CSP API, X-Frame-Options), body dibatasi 1 MiB, secret hanya lewat environment.
- **Konfigurasi**: 12-factor; log JSON terstruktur dengan `X-Request-ID`; `/healthz` & `/readyz`; graceful shutdown.
- **Web**: aksesibilitas WCAG 2.1 AA (skip link, label, kontras, `prefers-reduced-motion`), SEO (metadata, Open Graph, JSON-LD `NewsArticle`, sitemap, robots), Core Web Vitals (server components, `next/image`, font `display: swap`).
- **Data pribadi**: mengikuti UU No. 27/2022 (PDP) — lihat halaman Legal.
- **Kode**: gofmt/vet, TypeScript strict, ESLint, Conventional Commits.

## Status fitur

Ringkasan fitur yang **sudah terintegrasi** (frontend ↔ API ↔ database) dan yang **belum**. Perbarui tabel ini setiap kali menambah atau menyelesaikan fitur.

Keterangan: ✅ berfungsi penuh · ⚠️ berfungsi sebagian / butuh tindakan · ⏸️ dinonaktifkan sementara · ❌ belum dibuat

Produksi: web `https://oceanpedia-web.vercel.app` · API `https://oceanpedia-api.vercel.app` · DB Supabase (schema `app`).

### Layanan eksternal

| Layanan | Kegunaan | Variabel env (server saja) | Status | Catatan |
|---|---|---|---|---|
| Supabase PostgreSQL | Database utama | `DATABASE_URL` | ✅ | Migrasi `api/migrations`, RLS + policy `api_all` untuk role `oceanpedia_api` |
| Twelve Data (+ Binance untuk crypto) | Harga, candle, kurs | `TWELVEDATA_API_KEY` | ✅ | Saham AS (AAPL, MSFT, NVDA, TSLA, AMZN, GOOGL, META), forex (EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/IDR), emas, crypto. Paket Basic: 8 kredit/menit, 800/hari — jumlah simbol dibatasi; grafik saham AS & forex memakai widget TradingView. Saham IDX dinonaktifkan |
| Google Gemini | Aurora AI (analisis berita/market, percakapan, analisis gambar chart) | `GEMINI_API_KEY`, `GEMINI_MODELS` | ✅ | Khusus pelanggan Plus & staf |
| Bird | OTP email, email transaksional & newsletter | `BIRD_API_KEY`, `BIRD_EMAIL_KEY`, `BIRD_API_URL`, `OTP_EMAIL_FROM` | ⚠️ | Domain `mail.psi.id` belum terverifikasi (DKIM & return-path) → email bisa gagal/masuk spam |
| Midtrans Snap | Pembayaran langganan (QRIS, GoPay, VA) | `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_PRODUCTION` | ⚠️ | Kode siap, tetapi Server Key ditolak (401) → perlu buat ulang di dashboard Midtrans |
| Vercel | Hosting web (Next.js) & API (Go) | — | ✅ | Deploy otomatis dari `main` |

### Fitur pembaca (web & app)

| Nama fitur | Halaman | API | Tabel database | Status | Catatan |
|---|---|---|---|---|---|
| Beranda, berita terbaru & terpopuler | `/` | `GET /v1/home`, `/v1/articles` | `articles`, `categories`, `authors` | ✅ | Desktop = UI web, ponsel = UI app. Bagian "Sekilas per kategori" & "Polling pembaca" dihapus |
| Detail berita, reaksi, komentar, laporkan komentar | `/berita/[slug]` | `/v1/articles/{slug}…`, `/v1/comments/{id}/report` | `articles`, `reactions`, `comments`, `comment_reports` | ✅ | Komentar akun baru melalui moderasi |
| Kategori, penulis, topik (+ ikuti) | `/kategori/[slug]`, `/penulis/[slug]`, `/topik/[slug]` | `/v1/categories`, `/v1/authors/{slug}`, `/v1/topics/{slug}`, `/v1/me/categories|authors|topics` | `user_categories`, `user_authors`, `user_topics`, `tags` | ✅ | Paginasi kursor |
| Bagikan + pratinjau media sosial | semua halaman konten | `/api/og` | — | ✅ | URL mengikuti domain aktif; gambar sampul atau kartu 1200×630 otomatis |
| Market, detail instrumen, grafik, screener | `/market`, `/market/[symbol]`, `/screener` | `/v1/market/instruments`, `/quotes`, `/candles` | `instruments`, `market_cache` | ✅ | Saham AS, forex, emas, crypto. Contoh desain bertema IDX otomatis diganti instrumen aktif |
| Watchlist | `/watchlist` | `/v1/me/watchlist` | `watchlists`, `watchlist_items` | ✅ | |
| Price alert + notifikasi | `/alert`, `/notifikasi` | `/v1/me/alerts`, `/v1/me/notifications` | `price_alerts`, `notifications` | ✅ | Batas alert mengikuti paket; jam tenang menahan email |
| Kalender ekonomi + pengingat | `/kalender` | `/v1/events`, `/v1/me/reminders` | `economic_events`, `event_reminders` | ✅ | |
| Pencarian | `/cari` | `/v1/search` | `articles`, `instruments`, `authors`, `tags` | ✅ | |
| Artikel tersimpan | `/tersimpan` | `/v1/me/bookmarks` | `bookmarks` | ✅ | |
| Ocean Short (video): suka, simpan, bagikan, komentar | `/short` | `/v1/shorts…` | `shorts`, `short_likes`, `short_saves`, `short_comments` | ✅ | Belum ada konten video di produksi (unggah lewat admin) |
| Live blog | `/live` | `/v1/live` | `live_blogs`, `live_posts` | ✅ | |
| Newsletter (berlangganan/berhenti) | `/newsletter` | `/v1/newsletter/*` | `newsletter_subscribers`, `newsletter_issues` | ⚠️ | Pengiriman bergantung domain email Bird |
| Daftar, masuk, OTP, lupa sandi, sesi perangkat | `/daftar`, `/masuk`, `/verifikasi` | `/v1/auth/*`, `/v1/me/sessions` | `users`, `auth_codes`, `refresh_tokens` | ✅ | Token di cookie `httpOnly` |
| Verifikasi 2 langkah (email) | `/pengaturan` | `PATCH /v1/me` (`two_factor`) | `users.preferences` | ✅ | Opsional untuk pembaca, wajib untuk staf |
| Profil & foto profil | `/akun` | `/v1/me`, `/v1/me/avatar` | `users`, `media` | ✅ | Kartu "Kenali minat pasarmu" hilang otomatis saat kelengkapan 100% |
| Pengaturan: tema terang/gelap/sistem, kurangi animasi, video otomatis, notifikasi, ringkasan pagi | `/pengaturan` | `PATCH /v1/me` | `users.preferences`, `newsletter_subscribers` | ✅ | Tema diterapkan di server (cookie `ob_prefs`) |
| **Jurnal Trading** | `/jurnal` (menu di profil) | `GET/POST /v1/me/journal`, `PUT/DELETE /v1/me/journal/{id}` | `trading_journal` | ✅ | Semua jenis akun. P/L = selisih × lot × ukuran kontrak − biaya (forex 100.000, emas 100 oz/lot, saham AS per lembar); konversi P/L untuk pasangan USD/xxx; R dari stop loss, potensi TP/SL, P/L belum terealisasi, win rate, profit factor, kurva ekuitas, ekspor CSV |
| Aurora AI (asisten) | `/ai` + tombol melayang | `/v1/ai/chat`, `/v1/ai/chart`, `/v1/ai/ask` | — | ✅ | Plus. Kirim tautan berita yang diminta & chart candlestick sesuai timeframe/rentang |
| Analisis Aurora AI di artikel & market | `/berita/[slug]`, `/market/[symbol]` | `/v1/articles/{slug}/ai`, `/v1/market/instruments/{symbol}/ai` | `articles` (cache analisis) | ✅ | Plus |
| Langganan Plus & checkout | `/plus`, `/plus/checkout` … | `/v1/plans`, `/v1/billing/*` | `subscription_plans`, `subscriptions`, `invoices`, `payments` | ⚠️ | Menunggu Midtrans Server Key yang valid |
| Verifikasi Student | `/plus` | `/v1/me/student` | `student_verifications` | ✅ | Ditinjau admin |
| Pasang iklan (formulir & media kit) | `/iklan` | `POST /v1/ads/inquiries` | `ad_inquiries` | ✅ | |
| Permintaan data pribadi (UU PDP) | `/legal` | `POST /v1/me/privacy-requests` | `privacy_requests` | ⚠️ | Ekspor/hapus data diproses manual oleh admin |
| Pusat bantuan, tentang, legal | `/bantuan`, `/tentang`, `/legal` | — | — | ✅ | Kontak WhatsApp CS dari desain |

### Fitur admin & redaksi (`/admin`)

| Nama fitur | Halaman | Tabel database | Status | Catatan |
|---|---|---|---|---|
| Masuk staf + 2 langkah, lupa sandi, sesi | `/admin/masuk…` | `users`, `auth_codes` | ✅ | |
| Dashboard & feed aktivitas | `/admin`, `/admin/aktivitas` | `audit_log` | ✅ | |
| Tulis/edit/terbitkan artikel, versi, penugasan editor | `/admin/tulis`, `/admin/konten`, `/admin/versi` | `articles`, `article_versions`, `article_tags`, `article_instruments` | ✅ | Ekspor CSV, jadwal terbit |
| Kategori & tag | `/admin/kategori` | `categories`, `category_redirects`, `tags` | ✅ | |
| Moderasi komentar & kata terlarang | `/admin/komentar` | `comments`, `comment_reports`, `moderation_words`, `user_warnings` | ✅ | |
| Live blog | `/admin/live` | `live_blogs`, `live_posts` | ✅ | |
| Newsletter | `/admin/newsletter` | `newsletter_issues`, `newsletter_subscribers` | ⚠️ | Pengiriman bergantung domain email Bird |
| Media | `/admin/media` | `media` | ✅ | |
| Pasar & simbol | `/admin/pasar`, `/admin/simbol` | `instruments`, `market_usage` | ✅ | |
| Iklan & permintaan iklan | `/admin/iklan` | `ad_slots`, `ad_campaigns`, `ad_inquiries` | ✅ | |
| Pengguna, role & izin, undangan staf | `/admin/pengguna`, `/admin/role` | `users`, `roles`, `permissions`, `role_permissions`, `staff_invitations`, `staff_desks` | ✅ | Tab "Permintaan" untuk Student & data pribadi |
| Laporan, kondisi sistem, pengaturan | `/admin/laporan`, `/admin/kondisi`, `/admin/pengaturan` | `app_settings` | ✅ | |
| Ocean Short (kelola video) | `/admin/konten` | `shorts` | ✅ | Video lewat URL |

### Belum dibuat / belum lengkap

| Nama fitur | Status | Yang dibutuhkan | Prioritas |
|---|---|---|---|
| Pembayaran Midtrans | ⚠️ Kode siap | Buat ulang Server Key, simpan di Vercel (`oceanpedia-api`) | Tinggi |
| Domain email `mail.psi.id` | ⚠️ Menunggu DNS | TXT DKIM `bird-214-1026._domainkey.mail` & CNAME `send.mail → eu1.bounce.bird.com` | Tinggi |
| Data saham IDX, IHSG, LQ45 | ⏸️ Dinonaktifkan | Instrumen nonaktif di database; aktifkan lagi setelah ada sumber data IDX (paket Twelve Data lebih tinggi / penyedia lain) | Rendah |
| Lebih banyak simbol saham AS & forex | ⚠️ | Paket Twelve Data lebih tinggi (Basic: 8 kredit/menit, 800/hari) | Sedang |
| Bahasa Inggris | ❌ | Terjemahan antarmuka (opsi masih "segera hadir") | Sedang |
| 2 langkah lewat aplikasi autentikator (TOTP) | ❌ | Implementasi TOTP + QR (opsi masih "segera hadir") | Sedang |
| Zona waktu & format angka dari pengaturan | ⚠️ | Disimpan di database, belum diterapkan ke seluruh tampilan | Sedang |
| Balasan komentar | ❌ | Komentar bertingkat + notifikasi balasan | Sedang |
| Ekspor/hapus data pribadi otomatis | ⚠️ | Saat ini diproses manual oleh admin | Rendah |
| Notifikasi WhatsApp | ❌ | Integrasi WhatsApp (Bird) | Rendah |
| Akun media sosial resmi | ❌ | Ikon sosial disembunyikan sampai akun resmi tersedia | Rendah |
| Aplikasi native (Expo) | ❌ | Memakai API yang sama | Rendah |
| Konten awal (artikel, Ocean Short) | ⚠️ | Isi lewat dashboard admin | Sedang |

---
PT Nusantara Entertainment Asia · Menara Cakrawala Lt. 12 Unit A05, Jakarta Pusat · corpcom@jalaexplorer.com
