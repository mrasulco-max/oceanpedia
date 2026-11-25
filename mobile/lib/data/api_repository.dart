import 'dart:io';

import 'package:dio/dio.dart';

import '../core/api_client.dart';
import '../core/session.dart';
import 'models/extra.dart';
import 'models/models.dart';

class ApiRepository {
  ApiRepository(this.api, this.session);

  final ApiClient api;
  final SessionStore session;

  List<T> _list<T>(dynamic j, T Function(Map<String, dynamic>) map) {
    final data = j is Map ? (j['data'] ?? j) : j;
    if (data is! List) return [];
    return data
        .whereType<Map>()
        .map((e) => map(Map<String, dynamic>.from(e)))
        .toList();
  }

  // —— Auth ——

  Future<TokenResponse> login(String email, String password) async {
    final body = <String, dynamic>{'email': email, 'password': password};
    final device = session.deviceToken;
    if (device != null && device.isNotEmpty) body['device'] = device;
    final tr = await api.postJson(
      '/v1/auth/login',
      data: body,
      parse: (j) => TokenResponse.fromJson(Map<String, dynamic>.from(j as Map)),
    );
    await session.applyTokens(tr);
    return tr;
  }

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String fullName,
    String? phone,
  }) {
    return api.postJson(
      '/v1/auth/register',
      data: {
        'email': email,
        'password': password,
        'full_name': fullName,
        if (phone != null && phone.isNotEmpty) 'phone': phone,
      },
      parse: (j) => Map<String, dynamic>.from(j as Map),
    );
  }

  Future<TokenResponse> verify({
    required String email,
    required String code,
    String? challenge,
    bool remember = true,
  }) async {
    final tr = await api.postJson(
      '/v1/auth/verify',
      data: {
        'email': email,
        'code': code,
        if (challenge != null) 'challenge': challenge,
        'remember': remember,
      },
      parse: (j) => TokenResponse.fromJson(Map<String, dynamic>.from(j as Map)),
    );
    await session.applyTokens(tr);
    return tr;
  }

  Future<Map<String, dynamic>> resendOtp(String email) {
    return api.postJson(
      '/v1/auth/otp',
      data: {'email': email},
      parse: (j) => Map<String, dynamic>.from(j as Map),
    );
  }

  Future<void> logout() async {
    final rt = session.refreshToken;
    try {
      if (rt != null && rt.isNotEmpty) {
        await api.postVoid('/v1/auth/logout', data: {'refresh_token': rt});
      }
    } catch (_) {}
    await session.clear();
  }

  // —— Content ——

  Future<HomeData> home() => api.getJson(
        '/v1/home',
        parse: (j) => HomeData.fromJson(Map<String, dynamic>.from(j as Map)),
      );

  Future<Article> article(String slug) => api.getJson(
        '/v1/articles/${Uri.encodeComponent(slug)}',
        parse: (j) => Article.fromJson(Map<String, dynamic>.from(j as Map)),
      );

  Future<List<Category>> categories() => api.getJson(
        '/v1/categories',
        parse: (j) => _list(j, Category.fromJson),
      );

  Future<SearchResult> search(String q) => api.getJson(
        '/v1/search',
        query: {'q': q, 'limit': 20},
        parse: (j) => SearchResult.fromJson(Map<String, dynamic>.from(j as Map)),
      );

  Future<List<EconomicEvent>> events({String? country}) => api.getJson(
        '/v1/events',
        query: {
          if (country != null && country.isNotEmpty) 'country': country,
          'limit': 50,
        },
        parse: (j) => _list(j, EconomicEvent.fromJson),
      );

  // —— Market ——

  Future<List<Instrument>> instruments() => api.getJson(
        '/v1/market/instruments',
        parse: (j) => _list(j, Instrument.fromJson),
      );

  Future<List<QuoteItem>> quotes(List<String> symbols) async {
    if (symbols.isEmpty) return [];
    final out = <QuoteItem>[];
    for (var i = 0; i < symbols.length; i += 30) {
      final c = symbols.sublist(
        i,
        i + 30 > symbols.length ? symbols.length : i + 30,
      );
      out.addAll(
        await api.getJson(
          '/v1/market/quotes',
          query: {'symbols': c.join(',')},
          parse: (j) => _list(j, QuoteItem.fromJson),
        ),
      );
    }
    return out;
  }

  Future<InstrumentDetail> instrument(String symbol) => api.getJson(
        '/v1/market/instruments/${Uri.encodeComponent(symbol)}',
        parse: (j) =>
            InstrumentDetail.fromJson(Map<String, dynamic>.from(j as Map)),
      );

  Future<List<Candle>> candles(
    String symbol, {
    String interval = '1day',
    int limit = 90,
  }) =>
      api.getJson(
        '/v1/market/instruments/${Uri.encodeComponent(symbol)}/candles',
        query: {'interval': interval, 'limit': limit},
        parse: (j) => _list(j, Candle.fromJson),
      );

  // —— Shorts ——

  Future<List<ShortItem>> shorts({int limit = 30}) => api.getJson(
        '/v1/shorts',
        query: {'limit': limit},
        parse: (j) => _list(j, ShortItem.fromJson),
      );

  Future<void> shortView(String id) =>
      api.postVoid('/v1/shorts/${Uri.encodeComponent(id)}/view');

  Future<ShortItem> shortLike(String id, {required bool like}) async {
    final path = '/v1/shorts/${Uri.encodeComponent(id)}/like';
    final j = like
        ? await api.postJson(path, data: {}, parse: (x) => x)
        : await api.deleteJson(path, parse: (x) => x);
    final m = Map<String, dynamic>.from(j as Map);
    return ShortItem(
      id: id,
      title: '',
      liked: m['liked'] == true,
      likes: (m['likes'] as num?)?.toInt() ?? 0,
    );
  }

  Future<ShortItem> shortSave(String id, {required bool save}) async {
    final path = '/v1/shorts/${Uri.encodeComponent(id)}/save';
    final j = save
        ? await api.postJson(path, data: {}, parse: (x) => x)
        : await api.deleteJson(path, parse: (x) => x);
    final m = Map<String, dynamic>.from(j as Map);
    return ShortItem(
      id: id,
      title: '',
      saved: m['saved'] == true,
      saves: (m['saves'] as num?)?.toInt() ?? 0,
    );
  }

  Future<Map<String, dynamic>> shortShare(String id) => api.postJson(
        '/v1/shorts/${Uri.encodeComponent(id)}/share',
        data: {'channel': 'app'},
        parse: (j) => Map<String, dynamic>.from(j as Map),
      );

  Future<List<ShortComment>> shortComments(String id) => api.getJson(
        '/v1/shorts/${Uri.encodeComponent(id)}/comments',
        parse: (j) => _list(j, ShortComment.fromJson),
      );

  Future<ShortComment> addShortComment(String id, String body) => api.postJson(
        '/v1/shorts/${Uri.encodeComponent(id)}/comments',
        data: {'body': body},
        parse: (j) => ShortComment.fromJson(Map<String, dynamic>.from(j as Map)),
      );

  Future<List<ShortItem>> savedShorts() => api.getJson(
        '/v1/me/shorts/saved',
        parse: (j) => _list(j, ShortItem.fromJson),
      );

  // —— Live ——

  Future<LiveBlog> live() => api.getJson(
        '/v1/live',
        parse: (j) => LiveBlog.fromJson(Map<String, dynamic>.from(j as Map)),
      );

  // —— Me ——

  Future<UserProfile> me() async {
    final u = await api.getJson(
      '/v1/me',
      parse: (j) => UserProfile.fromJson(Map<String, dynamic>.from(j as Map)),
    );
    await session.setUser(u);
    return u;
  }

  Future<Map<String, dynamic>> patchMe(Map<String, dynamic> body) =>
      api.patchJson(
        '/v1/me',
        data: body,
        parse: (j) => Map<String, dynamic>.from(j as Map),
      );

  Future<List<WatchItem>> watchlist() =>
      api.getJson('/v1/me/watchlist', parse: (j) => _list(j, WatchItem.fromJson));

  Future<List<WatchItem>> addWatch(String symbol) => api.postJson(
        '/v1/me/watchlist',
        data: {'symbol': symbol},
        parse: (j) => _list(j, WatchItem.fromJson),
      );

  Future<void> removeWatch(String symbol) =>
      api.deleteVoid('/v1/me/watchlist/${Uri.encodeComponent(symbol)}');

  Future<List<AppNotification>> notifications() => api.getJson(
        '/v1/me/notifications',
        parse: (j) => _list(j, AppNotification.fromJson),
      );

  Future<void> markNotificationsRead({List<String>? ids}) => api.postVoid(
        '/v1/me/notifications/read',
        data: {'ids': ids ?? []},
      );

  Future<List<ArticleCard>> bookmarks() => api.getJson(
        '/v1/me/bookmarks',
        parse: (j) => _list(j, ArticleCard.fromJson),
      );

  Future<void> addBookmark(String slug) =>
      api.putVoid('/v1/me/bookmarks/${Uri.encodeComponent(slug)}');

  Future<void> removeBookmark(String slug) =>
      api.deleteVoid('/v1/me/bookmarks/${Uri.encodeComponent(slug)}');

  Future<List<PriceAlert>> alerts() =>
      api.getJson('/v1/me/alerts', parse: (j) => _list(j, PriceAlert.fromJson));

  Future<List<PriceAlert>> createAlert({
    required String symbol,
    required String condition,
    double? threshold,
    String frequency = 'once',
    List<String> channels = const ['in_app'],
    String note = '',
  }) =>
      api.postJson(
        '/v1/me/alerts',
        data: {
          'symbol': symbol,
          'condition': condition,
          if (threshold != null) 'threshold': threshold,
          'frequency': frequency,
          'channels': channels,
          if (note.isNotEmpty) 'note': note,
        },
        parse: (j) => _list(j, PriceAlert.fromJson),
      );

  Future<void> deleteAlert(String id) =>
      api.deleteVoid('/v1/me/alerts/${Uri.encodeComponent(id)}');

  Future<List<DeviceSession>> sessions() => api.getJson(
        '/v1/me/sessions',
        parse: (j) => _list(j, DeviceSession.fromJson),
      );

  Future<void> deleteSession(String id) =>
      api.deleteVoid('/v1/me/sessions/${Uri.encodeComponent(id)}');

  // —— Billing ——

  Future<List<PlanInfo>> plans() => api.getJson(
        '/v1/plans',
        parse: (j) => _list(j, PlanInfo.fromJson),
      );

  Future<CheckoutResult> checkout({
    required String planCode,
    String provider = 'midtrans',
    String method = 'qris',
    int seats = 1,
  }) =>
      api.postJson(
        '/v1/billing/checkout',
        data: {
          'plan_code': planCode,
          'provider': provider,
          'method': method,
          'seats': seats,
        },
        parse: (j) =>
            CheckoutResult.fromJson(Map<String, dynamic>.from(j as Map)),
      );

  Future<InvoiceInfo> invoice(String id) => api.getJson(
        '/v1/billing/invoices/${Uri.encodeComponent(id)}',
        parse: (j) {
          final m = Map<String, dynamic>.from(j as Map);
          if (m['invoice'] is Map) {
            return InvoiceInfo.fromJson(
              Map<String, dynamic>.from(m['invoice'] as Map),
            );
          }
          return InvoiceInfo.fromJson(m);
        },
      );

  Future<InvoiceInfo> refreshInvoice(String id) => api.postJson(
        '/v1/billing/invoices/${Uri.encodeComponent(id)}/refresh',
        data: {},
        parse: (j) {
          final m = Map<String, dynamic>.from(j as Map);
          if (m['invoice'] is Map) {
            return InvoiceInfo.fromJson(
              Map<String, dynamic>.from(m['invoice'] as Map),
            );
          }
          return InvoiceInfo.fromJson(m);
        },
      );

  Future<void> cancelSubscription() =>
      api.postVoid('/v1/billing/subscription/cancel', data: {});

  // —— AI ——

  Future<AiChatReply> aiChat(List<Map<String, String>> messages) =>
      api.postJsonLong(
        '/v1/ai/chat',
        data: {'messages': messages},
        parse: (j) => AiChatReply.fromJson(Map<String, dynamic>.from(j as Map)),
      );

  Future<AiChatReply> aiAsk({String? slug, String? symbol, required String question}) =>
      api.postJsonLong(
        '/v1/ai/ask',
        data: {
          if (slug != null) 'slug': slug,
          if (symbol != null) 'symbol': symbol,
          'question': question,
        },
        parse: (j) => AiChatReply.fromJson(Map<String, dynamic>.from(j as Map)),
      );

  Future<Map<String, dynamic>?> articleAi(String slug) async {
    try {
      return await api.getJson(
        '/v1/articles/${Uri.encodeComponent(slug)}/ai',
        parse: (j) => Map<String, dynamic>.from(j as Map),
      );
    } catch (_) {
      return null;
    }
  }

  Future<AiChatReply> aiChart(File file, {String note = '', String? symbol}) {
    return api.postMultipart(
      '/v1/ai/chart',
      data: FormData.fromMap({
        'file': MultipartFile.fromFileSync(file.path, filename: file.uri.pathSegments.last),
        'note': note,
        if (symbol != null) 'symbol': symbol,
      }),
      parse: (j) => AiChatReply.fromJson(Map<String, dynamic>.from(j as Map)),
    );
  }

  // —— Journal ——

  Future<JournalList> journal() => api.getJson(
        '/v1/me/journal',
        parse: (j) => JournalList.fromJson(Map<String, dynamic>.from(j as Map)),
      );

  Future<JournalEntry> createJournal(Map<String, dynamic> body) => api.postJson(
        '/v1/me/journal',
        data: body,
        parse: (j) => JournalEntry.fromJson(Map<String, dynamic>.from(j as Map)),
      );

  Future<JournalEntry> updateJournal(String id, Map<String, dynamic> body) =>
      api.putJson(
        '/v1/me/journal/${Uri.encodeComponent(id)}',
        data: body,
        parse: (j) => JournalEntry.fromJson(Map<String, dynamic>.from(j as Map)),
      );

  Future<void> deleteJournal(String id) =>
      api.deleteVoid('/v1/me/journal/${Uri.encodeComponent(id)}');

  // —— Admin / tulis ——

  Future<String> uploadAdminMedia(File file) async {
    final res = await api.postMultipart(
      '/v1/admin/media',
      data: FormData.fromMap({
        'file': MultipartFile.fromFileSync(
          file.path,
          filename: file.uri.pathSegments.last,
        ),
      }),
      parse: (j) => Map<String, dynamic>.from(j as Map),
    );
    return (res['id'] ?? res['media_id'] ?? res['url'] ?? '').toString();
  }

  Future<Map<String, dynamic>> createAdminArticle(Map<String, dynamic> body) =>
      api.postJson(
        '/v1/admin/articles',
        data: body,
        parse: (j) => Map<String, dynamic>.from(j as Map),
      );

  Future<List<AdminArticle>> adminArticles() => api.getJson(
        '/v1/admin/articles',
        parse: (j) => _list(j, AdminArticle.fromJson),
      );

  Future<Map<String, dynamic>> createAdminShort(Map<String, dynamic> body) =>
      api.postJson(
        '/v1/admin/shorts',
        data: body,
        parse: (j) => Map<String, dynamic>.from(j as Map),
      );

  Future<Map<String, dynamic>> adminDashboard() => api.getJson(
        '/v1/admin/dashboard',
        parse: (j) => Map<String, dynamic>.from(j as Map),
      );

  Future<List<Map<String, dynamic>>> adminFeed() => api.getJson(
        '/v1/admin/feed',
        parse: (j) {
          final data = j is Map ? j['data'] : j;
          if (data is! List) return [];
          return data
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        },
      );
}
