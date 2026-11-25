/// Konfigurasi runtime aplikasi.
abstract final class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://oceanpedia-api.vercel.app',
  );

  static const userAgent = 'OceanPedia/1.0 (Flutter)';
}
