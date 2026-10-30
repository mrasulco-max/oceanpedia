# OceanPedia / OceanBird

Platform berita & data pasar (saham IDX, komoditas, crypto, forex) — website dan app dalam satu basis kode web.

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

## Tahap berikutnya

Pembayaran (Midtrans/Xendit) + webhook, notifikasi email & WhatsApp, admin redaksi, halaman Cari/Watchlist/Akun/Short, aplikasi native (Expo) memakai API yang sama, deploy (Vercel + Postgres terkelola).

---
PT Nusantara Entertainment Asia · Menara Cakrawala Lt. 12 Unit A05, Jakarta Pusat · corpcom@jalaexplorer.com
