# OceanPedia Mobile (Flutter)

Aplikasi native yang meniru UI mode app web, terhubung ke API yang sama.

## Prasyarat

- Flutter 3.24+ (`flutter doctor`)
- Xcode (iOS) / Android Studio (Android)

## Menjalankan

```bash
cd mobile
flutter pub get
flutter run
```

API default: `https://oceanpedia-api.vercel.app`. Override:

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:8080
```

## Fitur

- 5 tab: Beranda, Market, Cari, Kalender, Akun
- Auth: masuk / daftar / OTP (Bearer JWT + refresh)
- Detail berita, detail market (quote + chart)
- Watchlist, tersimpan, alert, notifikasi, pengaturan
- Ocean Short, Live, Plus (WebView checkout), Aurora AI, Jurnal
- Tulis artikel / Short + dashboard redaksi (izin `content.write`)
