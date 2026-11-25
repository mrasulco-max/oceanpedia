class Category {
  Category({
    required this.id,
    required this.slug,
    required this.name,
    this.description = '',
    this.icon = '',
    this.articleCount = 0,
  });

  final String id;
  final String slug;
  final String name;
  final String description;
  final String icon;
  final int articleCount;

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: (j['id'] ?? '').toString(),
        slug: (j['slug'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        description: (j['description'] ?? '').toString(),
        icon: (j['icon'] ?? '').toString(),
        articleCount: (j['article_count'] as num?)?.toInt() ?? 0,
      );
}

class ArticleCard {
  ArticleCard({
    required this.id,
    required this.slug,
    required this.title,
    required this.excerpt,
    this.coverUrl,
    required this.category,
    required this.authorName,
    this.isPremium = false,
    this.isBreaking = false,
    this.readingMinutes = 0,
    this.viewCount = 0,
    this.publishedAt,
  });

  final String id;
  final String slug;
  final String title;
  final String excerpt;
  final String? coverUrl;
  final Category category;
  final String authorName;
  final bool isPremium;
  final bool isBreaking;
  final int readingMinutes;
  final int viewCount;
  final DateTime? publishedAt;

  factory ArticleCard.fromJson(Map<String, dynamic> j) => ArticleCard(
        id: (j['id'] ?? '').toString(),
        slug: (j['slug'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        excerpt: (j['excerpt'] ?? '').toString(),
        coverUrl: j['cover_url'] as String?,
        category: Category.fromJson(
          (j['category'] as Map<String, dynamic>?) ?? {},
        ),
        authorName: (j['author_name'] ?? '').toString(),
        isPremium: j['is_premium'] == true,
        isBreaking: j['is_breaking'] == true,
        readingMinutes: (j['reading_minutes'] as num?)?.toInt() ?? 0,
        viewCount: (j['view_count'] as num?)?.toInt() ?? 0,
        publishedAt: DateTime.tryParse((j['published_at'] ?? '').toString()),
      );
}

class Article extends ArticleCard {
  Article({
    required super.id,
    required super.slug,
    required super.title,
    required super.excerpt,
    super.coverUrl,
    required super.category,
    required super.authorName,
    super.isPremium,
    super.isBreaking,
    super.readingMinutes,
    super.viewCount,
    super.publishedAt,
    required this.body,
    this.locked = false,
    this.symbols = const [],
    this.tags = const [],
  });

  final String body;
  final bool locked;
  final List<String> symbols;
  final List<({String slug, String name})> tags;

  factory Article.fromJson(Map<String, dynamic> j) {
    final card = ArticleCard.fromJson(j);
    final tagsRaw = j['tags'];
    final tags = <({String slug, String name})>[];
    if (tagsRaw is List) {
      for (final t in tagsRaw) {
        if (t is Map) {
          tags.add((
            slug: (t['slug'] ?? '').toString(),
            name: (t['name'] ?? '').toString(),
          ));
        }
      }
    }
    final symbolsRaw = j['symbols'];
    final symbols = symbolsRaw is List
        ? symbolsRaw.map((e) => e.toString()).toList()
        : <String>[];
    return Article(
      id: card.id,
      slug: card.slug,
      title: card.title,
      excerpt: card.excerpt,
      coverUrl: card.coverUrl,
      category: card.category,
      authorName: card.authorName,
      isPremium: card.isPremium,
      isBreaking: card.isBreaking,
      readingMinutes: card.readingMinutes,
      viewCount: card.viewCount,
      publishedAt: card.publishedAt,
      body: (j['body'] ?? '').toString(),
      locked: j['locked'] == true,
      symbols: symbols,
      tags: tags,
    );
  }
}

class HomeData {
  HomeData({
    this.topStory,
    this.latest = const [],
    this.mostRead = const [],
    this.sections = const [],
  });

  final ArticleCard? topStory;
  final List<ArticleCard> latest;
  final List<ArticleCard> mostRead;
  final List<HomeSection> sections;

  factory HomeData.fromJson(Map<String, dynamic> j) {
    ArticleCard? top;
    final rawTop = j['top_story'];
    if (rawTop is Map<String, dynamic>) top = ArticleCard.fromJson(rawTop);
    List<ArticleCard> list(dynamic v) => v is List
        ? v
            .whereType<Map>()
            .map((e) => ArticleCard.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : [];
    final sections = <HomeSection>[];
    final rawSec = j['sections'];
    if (rawSec is List) {
      for (final s in rawSec) {
        if (s is Map) {
          sections.add(HomeSection.fromJson(Map<String, dynamic>.from(s)));
        }
      }
    }
    return HomeData(
      topStory: top,
      latest: list(j['latest']),
      mostRead: list(j['most_read']),
      sections: sections,
    );
  }
}

class HomeSection {
  HomeSection({required this.category, required this.articles});

  final Category category;
  final List<ArticleCard> articles;

  factory HomeSection.fromJson(Map<String, dynamic> j) => HomeSection(
        category: Category.fromJson(
          (j['category'] as Map<String, dynamic>?) ?? {},
        ),
        articles: (j['articles'] is List)
            ? (j['articles'] as List)
                .whereType<Map>()
                .map((e) => ArticleCard.fromJson(Map<String, dynamic>.from(e)))
                .toList()
            : [],
      );
}

class Instrument {
  Instrument({
    required this.symbol,
    required this.name,
    this.exchange = '',
    this.assetClass = '',
    this.currency = '',
    this.sector,
  });

  final String symbol;
  final String name;
  final String exchange;
  final String assetClass;
  final String currency;
  final String? sector;

  factory Instrument.fromJson(Map<String, dynamic> j) => Instrument(
        symbol: (j['symbol'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        exchange: (j['exchange'] ?? '').toString(),
        assetClass: (j['asset_class'] ?? '').toString(),
        currency: (j['currency'] ?? '').toString(),
        sector: j['sector'] as String?,
      );
}

class Quote {
  Quote({
    required this.symbol,
    required this.price,
    this.change = 0,
    this.changePercent = 0,
    this.open = 0,
    this.high = 0,
    this.low = 0,
    this.previousClose = 0,
    this.volume = 0,
    this.asOf,
    this.source = '',
  });

  final String symbol;
  final double price;
  final double change;
  final double changePercent;
  final double open;
  final double high;
  final double low;
  final double previousClose;
  final double volume;
  final DateTime? asOf;
  final String source;

  bool get isUp => changePercent >= 0;

  factory Quote.fromJson(Map<String, dynamic> j) => Quote(
        symbol: (j['symbol'] ?? '').toString(),
        price: (j['price'] as num?)?.toDouble() ?? 0,
        change: (j['change'] as num?)?.toDouble() ?? 0,
        changePercent: (j['change_percent'] as num?)?.toDouble() ?? 0,
        open: (j['open'] as num?)?.toDouble() ?? 0,
        high: (j['high'] as num?)?.toDouble() ?? 0,
        low: (j['low'] as num?)?.toDouble() ?? 0,
        previousClose: (j['previous_close'] as num?)?.toDouble() ?? 0,
        volume: (j['volume'] as num?)?.toDouble() ?? 0,
        asOf: DateTime.tryParse((j['as_of'] ?? '').toString()),
        source: (j['source'] ?? '').toString(),
      );
}

class QuoteItem {
  QuoteItem({required this.instrument, this.quote, this.error});

  final Instrument instrument;
  final Quote? quote;
  final String? error;

  factory QuoteItem.fromJson(Map<String, dynamic> j) => QuoteItem(
        instrument: Instrument.fromJson(
          (j['instrument'] as Map<String, dynamic>?) ??
              {'symbol': j['symbol'], 'name': j['symbol']},
        ),
        quote: j['quote'] is Map<String, dynamic>
            ? Quote.fromJson(j['quote'] as Map<String, dynamic>)
            : null,
        error: j['error'] as String?,
      );
}

class Candle {
  Candle({
    required this.time,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    this.volume = 0,
  });

  final DateTime time;
  final double open;
  final double high;
  final double low;
  final double close;
  final double volume;

  factory Candle.fromJson(Map<String, dynamic> j) {
    final tRaw = j['t'] ?? j['time'] ?? j['datetime'];
    DateTime time;
    if (tRaw is num) {
      final n = tRaw.toInt();
      time = DateTime.fromMillisecondsSinceEpoch(n > 1e12 ? n : n * 1000, isUtc: true);
    } else {
      time = DateTime.tryParse(tRaw?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0);
    }
    return Candle(
      time: time,
      open: (j['o'] as num?)?.toDouble() ?? (j['open'] as num?)?.toDouble() ?? 0,
      high: (j['h'] as num?)?.toDouble() ?? (j['high'] as num?)?.toDouble() ?? 0,
      low: (j['l'] as num?)?.toDouble() ?? (j['low'] as num?)?.toDouble() ?? 0,
      close: (j['c'] as num?)?.toDouble() ?? (j['close'] as num?)?.toDouble() ?? 0,
      volume: (j['v'] as num?)?.toDouble() ?? (j['volume'] as num?)?.toDouble() ?? 0,
    );
  }
}

class EconomicEvent {
  EconomicEvent({
    required this.id,
    required this.country,
    required this.title,
    required this.impact,
    required this.scheduledAt,
    this.actual,
    this.forecast,
    this.previous,
  });

  final String id;
  final String country;
  final String title;
  final String impact;
  final DateTime scheduledAt;
  final String? actual;
  final String? forecast;
  final String? previous;

  factory EconomicEvent.fromJson(Map<String, dynamic> j) => EconomicEvent(
        id: (j['id'] ?? '').toString(),
        country: (j['country'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        impact: (j['impact'] ?? '').toString(),
        scheduledAt: DateTime.tryParse((j['scheduled_at'] ?? '').toString()) ??
            DateTime.fromMillisecondsSinceEpoch(0),
        actual: j['actual'] as String?,
        forecast: j['forecast'] as String?,
        previous: j['previous'] as String?,
      );
}

class SearchResult {
  SearchResult({
    this.instruments = const [],
    this.articles = const [],
    this.authors = const [],
    this.tags = const [],
  });

  final List<Instrument> instruments;
  final List<ArticleCard> articles;
  final List<AuthorHit> authors;
  final List<({String slug, String name})> tags;

  factory SearchResult.fromJson(Map<String, dynamic> j) {
    final tags = <({String slug, String name})>[];
    if (j['tags'] is List) {
      for (final t in j['tags'] as List) {
        if (t is Map) {
          tags.add((
            slug: (t['slug'] ?? '').toString(),
            name: (t['name'] ?? '').toString(),
          ));
        }
      }
    }
    return SearchResult(
      instruments: (j['instruments'] is List)
          ? (j['instruments'] as List)
              .whereType<Map>()
              .map((e) => Instrument.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : [],
      articles: (j['articles'] is List)
          ? (j['articles'] as List)
              .whereType<Map>()
              .map((e) => ArticleCard.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : [],
      authors: (j['authors'] is List)
          ? (j['authors'] as List)
              .whereType<Map>()
              .map((e) => AuthorHit.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : [],
      tags: tags,
    );
  }
}

class AuthorHit {
  AuthorHit({
    required this.slug,
    required this.name,
    this.title = '',
    this.articleCount = 0,
  });

  final String slug;
  final String name;
  final String title;
  final int articleCount;

  factory AuthorHit.fromJson(Map<String, dynamic> j) => AuthorHit(
        slug: (j['slug'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        articleCount: (j['article_count'] as num?)?.toInt() ?? 0,
      );
}

class UserProfile {
  UserProfile({
    required this.id,
    required this.email,
    required this.fullName,
    this.role = 'reader',
    this.plan,
    this.roleName,
    this.isStaff = false,
    this.avatarId,
    this.permissions = const [],
  });

  final String id;
  final String email;
  final String fullName;
  final String role;
  final String? plan;
  final String? roleName;
  final bool isStaff;
  final String? avatarId;
  final List<String> permissions;

  bool get isPlus => plan != null && plan!.isNotEmpty;

  bool hasPerm(String p) => permissions.contains(p);

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        id: (j['id'] ?? '').toString(),
        email: (j['email'] ?? '').toString(),
        fullName: (j['full_name'] ?? '').toString(),
        role: (j['role'] ?? 'reader').toString(),
        plan: j['plan'] as String?,
        roleName: j['role_name'] as String?,
        isStaff: j['is_staff'] == true,
        avatarId: j['avatar_id'] as String?,
        permissions: (j['permissions'] is List)
            ? (j['permissions'] as List).map((e) => e.toString()).toList()
            : [],
      );
}

class TokenResponse {
  TokenResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
    required this.user,
    this.deviceToken,
  });

  final String accessToken;
  final String refreshToken;
  final int expiresIn;
  final UserProfile user;
  final String? deviceToken;

  factory TokenResponse.fromJson(Map<String, dynamic> j) => TokenResponse(
        accessToken: (j['access_token'] ?? '').toString(),
        refreshToken: (j['refresh_token'] ?? '').toString(),
        expiresIn: (j['expires_in'] as num?)?.toInt() ?? 900,
        user: UserProfile.fromJson(
          (j['user'] as Map<String, dynamic>?) ?? {},
        ),
        deviceToken: j['device_token'] as String?,
      );
}

class WatchItem {
  WatchItem({required this.instrument, this.addedAt});

  final Instrument instrument;
  final DateTime? addedAt;

  factory WatchItem.fromJson(Map<String, dynamic> j) => WatchItem(
        instrument: Instrument.fromJson(j),
        addedAt: DateTime.tryParse((j['added_at'] ?? '').toString()),
      );
}

class AppNotification {
  AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    this.link = '',
    this.symbol = '',
    this.readAt,
    required this.createdAt,
  });

  final String id;
  final String kind;
  final String title;
  final String body;
  final String link;
  final String symbol;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isUnread => readAt == null;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: (j['id'] ?? '').toString(),
        kind: (j['kind'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        body: (j['body'] ?? '').toString(),
        link: (j['link'] ?? '').toString(),
        symbol: (j['symbol'] ?? '').toString(),
        readAt: DateTime.tryParse((j['read_at'] ?? '').toString()),
        createdAt: DateTime.tryParse((j['created_at'] ?? '').toString()) ??
            DateTime.now(),
      );
}

class InstrumentDetail {
  InstrumentDetail({
    required this.instrument,
    this.quote,
    this.news = const [],
    this.error,
  });

  final Instrument instrument;
  final Quote? quote;
  final List<ArticleCard> news;
  final String? error;

  factory InstrumentDetail.fromJson(Map<String, dynamic> j) => InstrumentDetail(
        instrument: Instrument.fromJson(
          (j['instrument'] as Map<String, dynamic>?) ?? {},
        ),
        quote: j['quote'] is Map<String, dynamic>
            ? Quote.fromJson(j['quote'] as Map<String, dynamic>)
            : null,
        news: (j['news'] is List)
            ? (j['news'] as List)
                .whereType<Map>()
                .map((e) => ArticleCard.fromJson(Map<String, dynamic>.from(e)))
                .toList()
            : [],
        error: j['error'] as String?,
      );
}
