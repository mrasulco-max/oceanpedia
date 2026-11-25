/// Error API mengikuti RFC 9457 problem+json.
class ApiException implements Exception {
  ApiException({
    required this.status,
    required this.title,
    this.detail,
    this.type,
    this.errors = const {},
  });

  final int status;
  final String title;
  final String? detail;
  final String? type;
  final Map<String, String> errors;

  String get message => detail?.isNotEmpty == true ? detail! : title;

  bool get isVerificationRequired =>
      type?.contains('verification-required') == true || status == 403 && errors.containsKey('email') && !errors.containsKey('challenge');

  bool get isTwoFactorRequired => type?.contains('two-factor-required') == true;

  factory ApiException.fromJson(int status, Map<String, dynamic>? json) {
    final errorsRaw = json?['errors'];
    final errors = <String, String>{};
    if (errorsRaw is Map) {
      for (final e in errorsRaw.entries) {
        errors[e.key.toString()] = e.value?.toString() ?? '';
      }
    }
    return ApiException(
      status: status,
      title: (json?['title'] as String?) ?? 'Permintaan gagal',
      detail: json?['detail'] as String?,
      type: json?['type'] as String?,
      errors: errors,
    );
  }

  @override
  String toString() => 'ApiException($status): $message';
}
