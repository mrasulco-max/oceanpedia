import 'package:dio/dio.dart';

import '../data/models/models.dart';
import 'api_exception.dart';
import 'config.dart';
import 'session.dart';

typedef OnUnauthorized = void Function();

/// Dio client + Bearer interceptor + refresh sekali pada 401.
class ApiClient {
  ApiClient({
    required this.session,
    this.onUnauthorized,
    String? baseUrl,
  }) {
    dio = Dio(
      BaseOptions(
        baseUrl: baseUrl ?? AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 30),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': AppConfig.userAgent,
        },
      ),
    );
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final t = session.accessToken;
          if (t != null && t.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $t';
          }
          handler.next(options);
        },
        onError: (err, handler) async {
          if (err.response?.statusCode == 401 &&
              !_isAuthPath(err.requestOptions.path) &&
              !_refreshing) {
            final ok = await _tryRefresh();
            if (ok) {
              try {
                final req = err.requestOptions;
                req.headers['Authorization'] = 'Bearer ${session.accessToken}';
                final res = await dio.fetch(req);
                return handler.resolve(res);
              } catch (_) {
                return handler.next(err);
              }
            }
            onUnauthorized?.call();
          }
          handler.next(err);
        },
      ),
    );
  }

  final SessionStore session;
  final OnUnauthorized? onUnauthorized;
  late final Dio dio;
  bool _refreshing = false;

  bool _isAuthPath(String path) =>
      path.contains('/v1/auth/login') ||
      path.contains('/v1/auth/register') ||
      path.contains('/v1/auth/verify') ||
      path.contains('/v1/auth/refresh') ||
      path.contains('/v1/auth/otp') ||
      path.contains('/v1/auth/password');

  Future<bool> _tryRefresh() async {
    final rt = session.refreshToken;
    if (rt == null || rt.isEmpty) return false;
    _refreshing = true;
    try {
      final res = await Dio(
        BaseOptions(
          baseUrl: dio.options.baseUrl,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': AppConfig.userAgent,
          },
        ),
      ).post<Map<String, dynamic>>(
        '/v1/auth/refresh',
        data: {'refresh_token': rt},
      );
      final data = res.data;
      if (data == null) return false;
      await session.applyTokens(TokenResponse.fromJson(data));
      return true;
    } catch (_) {
      await session.clear();
      return false;
    } finally {
      _refreshing = false;
    }
  }

  Never throwFrom(DioException e) {
    final status = e.response?.statusCode ?? 0;
    final data = e.response?.data;
    if (data is Map<String, dynamic>) {
      throw ApiException.fromJson(status, data);
    }
    if (data is Map) {
      throw ApiException.fromJson(status, Map<String, dynamic>.from(data));
    }
    throw ApiException(
      status: status == 0 ? 503 : status,
      title: 'Jaringan bermasalah',
      detail: e.message,
    );
  }

  Future<T> getJson<T>(
    String path, {
    Map<String, dynamic>? query,
    required T Function(dynamic json) parse,
  }) async {
    try {
      final res = await dio.get<dynamic>(path, queryParameters: query);
      return parse(res.data);
    } on DioException catch (e) {
      throwFrom(e);
    }
  }

  Future<T> postJson<T>(
    String path, {
    Object? data,
    required T Function(dynamic json) parse,
  }) async {
    try {
      final res = await dio.post<dynamic>(path, data: data);
      return parse(res.data);
    } on DioException catch (e) {
      throwFrom(e);
    }
  }

  Future<void> postVoid(String path, {Object? data}) async {
    try {
      await dio.post<dynamic>(path, data: data);
    } on DioException catch (e) {
      throwFrom(e);
    }
  }

  Future<T> deleteJson<T>(
    String path, {
    required T Function(dynamic json) parse,
  }) async {
    try {
      final res = await dio.delete<dynamic>(path);
      return parse(res.data);
    } on DioException catch (e) {
      throwFrom(e);
    }
  }

  Future<void> deleteVoid(String path) async {
    try {
      await dio.delete<dynamic>(path);
    } on DioException catch (e) {
      throwFrom(e);
    }
  }

  Future<T> putJson<T>(
    String path, {
    Object? data,
    required T Function(dynamic json) parse,
  }) async {
    try {
      final res = await dio.put<dynamic>(path, data: data);
      return parse(res.data);
    } on DioException catch (e) {
      throwFrom(e);
    }
  }

  Future<void> putVoid(String path, {Object? data}) async {
    try {
      await dio.put<dynamic>(path, data: data);
    } on DioException catch (e) {
      throwFrom(e);
    }
  }

  Future<T> patchJson<T>(
    String path, {
    Object? data,
    required T Function(dynamic json) parse,
  }) async {
    try {
      final res = await dio.patch<dynamic>(path, data: data);
      return parse(res.data);
    } on DioException catch (e) {
      throwFrom(e);
    }
  }

  Future<T> postMultipart<T>(
    String path, {
    required FormData data,
    Duration? receiveTimeout,
    required T Function(dynamic json) parse,
  }) async {
    try {
      final res = await dio.post<dynamic>(
        path,
        data: data,
        options: Options(
          receiveTimeout: receiveTimeout ?? const Duration(seconds: 60),
          sendTimeout: const Duration(seconds: 60),
        ),
      );
      return parse(res.data);
    } on DioException catch (e) {
      throwFrom(e);
    }
  }

  Future<T> postJsonLong<T>(
    String path, {
    Object? data,
    required T Function(dynamic json) parse,
  }) async {
    try {
      final res = await dio.post<dynamic>(
        path,
        data: data,
        options: Options(receiveTimeout: const Duration(seconds: 55)),
      );
      return parse(res.data);
    } on DioException catch (e) {
      throwFrom(e);
    }
  }
}
