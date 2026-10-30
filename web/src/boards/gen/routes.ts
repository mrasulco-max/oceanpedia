// Dihasilkan oleh scripts/gen_boards.py dari design/boards — JANGAN diedit manual.
import type { BoardId } from "./registry";

export interface RouteDef {
  path: string;
  web: BoardId | null;
  app: BoardId | null;
  admin: BoardId | null;
  public: boolean;
}

export const ROUTES: RouteDef[] = [
  {
    "path": "/",
    "web": "web-home",
    "app": "app-05",
    "admin": null,
    "public": false
  },
  {
    "path": "/berita/[slug]",
    "web": "web-berita",
    "app": "app-06",
    "admin": null,
    "public": false
  },
  {
    "path": "/kategori/[slug]",
    "web": "web-kategori",
    "app": "app-07",
    "admin": null,
    "public": false
  },
  {
    "path": "/market",
    "web": "web-market",
    "app": "app-08",
    "admin": null,
    "public": false
  },
  {
    "path": "/market/[symbol]",
    "web": "web-market-detail",
    "app": "app-09",
    "admin": null,
    "public": false
  },
  {
    "path": "/kalender",
    "web": "web-kalender",
    "app": "app-10",
    "admin": null,
    "public": false
  },
  {
    "path": "/cari",
    "web": "web-cari",
    "app": "app-11",
    "admin": null,
    "public": false
  },
  {
    "path": "/watchlist",
    "web": "web-watchlist",
    "app": "app-12",
    "admin": null,
    "public": false
  },
  {
    "path": "/alert",
    "web": null,
    "app": "app-13",
    "admin": null,
    "public": false
  },
  {
    "path": "/notifikasi",
    "web": null,
    "app": "app-14",
    "admin": null,
    "public": false
  },
  {
    "path": "/live",
    "web": "web-live",
    "app": "app-15",
    "admin": null,
    "public": false
  },
  {
    "path": "/short",
    "web": "web-short",
    "app": "app-16",
    "admin": null,
    "public": false
  },
  {
    "path": "/tersimpan",
    "web": null,
    "app": "app-17",
    "admin": null,
    "public": false
  },
  {
    "path": "/penulis/[slug]",
    "web": "web-penulis",
    "app": "app-18",
    "admin": null,
    "public": false
  },
  {
    "path": "/topik/[slug]",
    "web": "web-topik",
    "app": "app-19",
    "admin": null,
    "public": false
  },
  {
    "path": "/akun",
    "web": "web-akun",
    "app": "app-20",
    "admin": null,
    "public": false
  },
  {
    "path": "/pengaturan",
    "web": null,
    "app": "app-21",
    "admin": null,
    "public": false
  },
  {
    "path": "/legal",
    "web": "web-legal",
    "app": "app-22",
    "admin": null,
    "public": false
  },
  {
    "path": "/offline",
    "web": "web-error",
    "app": "app-23",
    "admin": null,
    "public": false
  },
  {
    "path": "/masuk",
    "web": "web-login",
    "app": "app-03",
    "admin": null,
    "public": false
  },
  {
    "path": "/daftar",
    "web": "web-login",
    "app": "app-24",
    "admin": null,
    "public": false
  },
  {
    "path": "/verifikasi",
    "web": null,
    "app": "app-04",
    "admin": null,
    "public": false
  },
  {
    "path": "/selamat-datang",
    "web": null,
    "app": "app-02",
    "admin": null,
    "public": false
  },
  {
    "path": "/splash",
    "web": null,
    "app": "app-01",
    "admin": null,
    "public": false
  },
  {
    "path": "/plus",
    "web": null,
    "app": "app-25",
    "admin": null,
    "public": false
  },
  {
    "path": "/plus/baca",
    "web": null,
    "app": "app-26",
    "admin": null,
    "public": false
  },
  {
    "path": "/plus/analisis",
    "web": null,
    "app": "app-27",
    "admin": null,
    "public": false
  },
  {
    "path": "/plus/checkout",
    "web": null,
    "app": "app-28",
    "admin": null,
    "public": false
  },
  {
    "path": "/plus/menunggu-pembayaran",
    "web": null,
    "app": "app-29",
    "admin": null,
    "public": false
  },
  {
    "path": "/plus/berhasil",
    "web": null,
    "app": "app-30",
    "admin": null,
    "public": false
  },
  {
    "path": "/plus/email",
    "web": null,
    "app": "app-31",
    "admin": null,
    "public": false
  },
  {
    "path": "/plus/whatsapp",
    "web": null,
    "app": "app-32",
    "admin": null,
    "public": false
  },
  {
    "path": "/screener",
    "web": "web-screener",
    "app": null,
    "admin": null,
    "public": false
  },
  {
    "path": "/newsletter",
    "web": "web-newsletter",
    "app": null,
    "admin": null,
    "public": false
  },
  {
    "path": "/tentang",
    "web": "web-tentang",
    "app": null,
    "admin": null,
    "public": false
  },
  {
    "path": "/iklan",
    "web": "web-iklan",
    "app": null,
    "admin": null,
    "public": false
  },
  {
    "path": "/bantuan",
    "web": "web-bantuan",
    "app": null,
    "admin": null,
    "public": false
  },
  {
    "path": "/admin",
    "web": null,
    "app": null,
    "admin": "admin-overview",
    "public": false
  },
  {
    "path": "/admin/konten",
    "web": null,
    "app": null,
    "admin": "admin-content",
    "public": false
  },
  {
    "path": "/admin/tulis",
    "web": null,
    "app": null,
    "admin": "admin-editor",
    "public": false
  },
  {
    "path": "/admin/versi",
    "web": null,
    "app": null,
    "admin": "admin-versions",
    "public": false
  },
  {
    "path": "/admin/live",
    "web": null,
    "app": null,
    "admin": "admin-live",
    "public": false
  },
  {
    "path": "/admin/kategori",
    "web": null,
    "app": null,
    "admin": "admin-categories",
    "public": false
  },
  {
    "path": "/admin/kategori/form",
    "web": null,
    "app": null,
    "admin": "admin-category-form",
    "public": false
  },
  {
    "path": "/admin/komentar",
    "web": null,
    "app": null,
    "admin": "admin-comments",
    "public": false
  },
  {
    "path": "/admin/media",
    "web": null,
    "app": null,
    "admin": "admin-media",
    "public": false
  },
  {
    "path": "/admin/pasar",
    "web": null,
    "app": null,
    "admin": "admin-market",
    "public": false
  },
  {
    "path": "/admin/simbol",
    "web": null,
    "app": null,
    "admin": "admin-symbol",
    "public": false
  },
  {
    "path": "/admin/iklan",
    "web": null,
    "app": null,
    "admin": "admin-ads",
    "public": false
  },
  {
    "path": "/admin/newsletter",
    "web": null,
    "app": null,
    "admin": "admin-newsletter",
    "public": false
  },
  {
    "path": "/admin/notifikasi",
    "web": null,
    "app": null,
    "admin": "admin-notif",
    "public": false
  },
  {
    "path": "/admin/laporan",
    "web": null,
    "app": null,
    "admin": "admin-reports",
    "public": false
  },
  {
    "path": "/admin/pengguna",
    "web": null,
    "app": null,
    "admin": "admin-users",
    "public": false
  },
  {
    "path": "/admin/role",
    "web": null,
    "app": null,
    "admin": "admin-roles",
    "public": false
  },
  {
    "path": "/admin/aktivitas",
    "web": null,
    "app": null,
    "admin": "admin-activity",
    "public": false
  },
  {
    "path": "/admin/cari",
    "web": null,
    "app": null,
    "admin": "admin-search",
    "public": false
  },
  {
    "path": "/admin/cari/hasil",
    "web": null,
    "app": null,
    "admin": "admin-search-results",
    "public": false
  },
  {
    "path": "/admin/pengaturan",
    "web": null,
    "app": null,
    "admin": "admin-settings",
    "public": false
  },
  {
    "path": "/admin/kondisi",
    "web": null,
    "app": null,
    "admin": "admin-sys-states",
    "public": false
  },
  {
    "path": "/admin/mockup",
    "web": null,
    "app": null,
    "admin": "admin-mockup",
    "public": false
  },
  {
    "path": "/admin/masuk",
    "web": null,
    "app": null,
    "admin": "admin-login",
    "public": true
  },
  {
    "path": "/admin/masuk/verifikasi",
    "web": null,
    "app": null,
    "admin": "admin-login-2-f-a",
    "public": true
  },
  {
    "path": "/admin/masuk/sesi-berakhir",
    "web": null,
    "app": null,
    "admin": "admin-login-expired",
    "public": true
  },
  {
    "path": "/admin/masuk/lupa",
    "web": null,
    "app": null,
    "admin": "admin-login-forgot",
    "public": true
  },
  {
    "path": "/admin/masuk/cek-email",
    "web": null,
    "app": null,
    "admin": "admin-login-forgot-sent",
    "public": true
  },
  {
    "path": "/admin/masuk/terkunci",
    "web": null,
    "app": null,
    "admin": "admin-login-locked",
    "public": true
  },
  {
    "path": "/admin/masuk/sandi-baru",
    "web": null,
    "app": null,
    "admin": "admin-login-reset",
    "public": true
  }
];
