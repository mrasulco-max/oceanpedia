/// Model tambahan scope 3+4.
library;

class ShortItem {
  ShortItem({
    required this.id,
    required this.title,
    this.caption = '',
    this.videoUrl,
    this.coverUrl,
    this.symbol,
    this.views = 0,
    this.durationS = 0,
    this.likes = 0,
    this.comments = 0,
    this.saves = 0,
    this.shares = 0,
    this.liked = false,
    this.saved = false,
  });

  final String id;
  final String title;
  final String caption;
  final String? videoUrl;
  final String? coverUrl;
  final String? symbol;
  final int views;
  final int durationS;
  final int likes;
  final int comments;
  final int saves;
  final int shares;
  final bool liked;
  final bool saved;

  ShortItem copyWith({bool? liked, bool? saved, int? likes, int? saves, int? shares}) =>
      ShortItem(
        id: id,
        title: title,
        caption: caption,
        videoUrl: videoUrl,
        coverUrl: coverUrl,
        symbol: symbol,
        views: views,
        durationS: durationS,
        likes: likes ?? this.likes,
        comments: comments,
        saves: saves ?? this.saves,
        shares: shares ?? this.shares,
        liked: liked ?? this.liked,
        saved: saved ?? this.saved,
      );

  factory ShortItem.fromJson(Map<String, dynamic> j) => ShortItem(
        id: (j['id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        caption: (j['caption'] ?? '').toString(),
        videoUrl: j['video_url'] as String?,
        coverUrl: j['cover_url'] as String?,
        symbol: j['symbol'] as String?,
        views: (j['views'] as num?)?.toInt() ?? 0,
        durationS: (j['duration_s'] as num?)?.toInt() ?? 0,
        likes: (j['likes'] as num?)?.toInt() ?? 0,
        comments: (j['comments'] as num?)?.toInt() ?? 0,
        saves: (j['saves'] as num?)?.toInt() ?? 0,
        shares: (j['shares'] as num?)?.toInt() ?? 0,
        liked: j['liked'] == true,
        saved: j['saved'] == true,
      );
}

class ShortComment {
  ShortComment({
    required this.id,
    required this.userName,
    required this.body,
    this.parentId,
    this.createdAt,
  });

  final String id;
  final String userName;
  final String body;
  final String? parentId;
  final DateTime? createdAt;

  factory ShortComment.fromJson(Map<String, dynamic> j) => ShortComment(
        id: (j['id'] ?? '').toString(),
        userName: (j['user_name'] ?? '').toString(),
        body: (j['body'] ?? '').toString(),
        parentId: j['parent_id'] as String?,
        createdAt: DateTime.tryParse((j['created_at'] ?? '').toString()),
      );
}

class LivePost {
  LivePost({
    required this.id,
    required this.body,
    this.kind = 'update',
    this.symbol,
    this.pinned = false,
    this.author = '',
    this.createdAt,
  });

  final String id;
  final String body;
  final String kind;
  final String? symbol;
  final bool pinned;
  final String author;
  final DateTime? createdAt;

  factory LivePost.fromJson(Map<String, dynamic> j) => LivePost(
        id: (j['id'] ?? '').toString(),
        body: (j['body'] ?? '').toString(),
        kind: (j['kind'] ?? 'update').toString(),
        symbol: j['symbol'] as String?,
        pinned: j['pinned'] == true,
        author: (j['author'] ?? '').toString(),
        createdAt: DateTime.tryParse((j['created_at'] ?? '').toString()),
      );
}

class LiveBlog {
  LiveBlog({
    required this.id,
    required this.title,
    this.summary = '',
    this.status = '',
    this.symbol,
    this.posts = const [],
  });

  final String id;
  final String title;
  final String summary;
  final String status;
  final String? symbol;
  final List<LivePost> posts;

  factory LiveBlog.fromJson(Map<String, dynamic> j) => LiveBlog(
        id: (j['id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        summary: (j['summary'] ?? '').toString(),
        status: (j['status'] ?? '').toString(),
        symbol: j['symbol'] as String?,
        posts: (j['posts'] is List)
            ? (j['posts'] as List)
                .whereType<Map>()
                .map((e) => LivePost.fromJson(Map<String, dynamic>.from(e)))
                .toList()
            : [],
      );
}

class PlanInfo {
  PlanInfo({
    required this.code,
    required this.name,
    required this.priceAmount,
    this.currency = 'IDR',
    this.billingPeriod = 'month',
    this.features = const [],
  });

  final String code;
  final String name;
  final int priceAmount;
  final String currency;
  final String billingPeriod;
  final List<String> features;

  factory PlanInfo.fromJson(Map<String, dynamic> j) => PlanInfo(
        code: (j['code'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        priceAmount: (j['price_amount'] as num?)?.toInt() ?? 0,
        currency: (j['currency'] ?? 'IDR').toString(),
        billingPeriod: (j['billing_period'] ?? 'month').toString(),
        features: (j['features'] is List)
            ? (j['features'] as List).map((e) => e.toString()).toList()
            : [],
      );
}

class CheckoutResult {
  CheckoutResult({
    this.invoiceId,
    this.orderId,
    this.payUrl,
    this.status,
    this.provider,
  });

  final String? invoiceId;
  final String? orderId;
  final String? payUrl;
  final String? status;
  final String? provider;

  factory CheckoutResult.fromJson(Map<String, dynamic> j) {
    final inv = j['invoice'];
    String? invId;
    if (inv is Map) invId = inv['id']?.toString();
    return CheckoutResult(
      invoiceId: invId ?? j['invoice_id']?.toString(),
      orderId: j['order_id']?.toString(),
      payUrl: j['pay_url']?.toString(),
      status: j['status']?.toString() ??
          (inv is Map ? inv['status']?.toString() : null),
      provider: j['provider']?.toString(),
    );
  }
}

class InvoiceInfo {
  InvoiceInfo({
    required this.id,
    this.status = '',
    this.payUrl,
    this.total = 0,
    this.currency = 'IDR',
  });

  final String id;
  final String status;
  final String? payUrl;
  final int total;
  final String currency;

  bool get isPaid =>
      status == 'paid' || status == 'settlement' || status == 'success';

  factory InvoiceInfo.fromJson(Map<String, dynamic> j) => InvoiceInfo(
        id: (j['id'] ?? '').toString(),
        status: (j['status'] ?? '').toString(),
        payUrl: j['pay_url'] as String?,
        total: (j['total'] as num?)?.toInt() ??
            (j['amount'] as num?)?.toInt() ??
            0,
        currency: (j['currency'] ?? 'IDR').toString(),
      );
}

class PriceAlert {
  PriceAlert({
    required this.id,
    required this.symbol,
    required this.condition,
    this.threshold,
    this.frequency = 'once',
    this.channels = const [],
    this.note = '',
    this.active = true,
  });

  final String id;
  final String symbol;
  final String condition;
  final double? threshold;
  final String frequency;
  final List<String> channels;
  final String note;
  final bool active;

  factory PriceAlert.fromJson(Map<String, dynamic> j) => PriceAlert(
        id: (j['id'] ?? '').toString(),
        symbol: (j['symbol'] ?? '').toString(),
        condition: (j['condition'] ?? '').toString(),
        threshold: (j['threshold'] as num?)?.toDouble(),
        frequency: (j['frequency'] ?? 'once').toString(),
        channels: (j['channels'] is List)
            ? (j['channels'] as List).map((e) => e.toString()).toList()
            : [],
        note: (j['note'] ?? '').toString(),
        active: j['active'] != false,
      );
}

class JournalEntry {
  JournalEntry({
    required this.id,
    required this.symbol,
    required this.market,
    required this.side,
    required this.entryPrice,
    required this.quantity,
    this.currency = 'USD',
    this.exitPrice,
    this.fees = 0,
    this.stopLoss,
    this.takeProfit,
    this.openedAt,
    this.closedAt,
    this.strategy = '',
    this.notes = '',
    this.pnl,
    this.pnlPct,
  });

  final String id;
  final String symbol;
  final String market;
  final String side;
  final double entryPrice;
  final double quantity;
  final String currency;
  final double? exitPrice;
  final double fees;
  final double? stopLoss;
  final double? takeProfit;
  final DateTime? openedAt;
  final DateTime? closedAt;
  final String strategy;
  final String notes;
  final double? pnl;
  final double? pnlPct;

  factory JournalEntry.fromJson(Map<String, dynamic> j) => JournalEntry(
        id: (j['id'] ?? '').toString(),
        symbol: (j['symbol'] ?? '').toString(),
        market: (j['market'] ?? '').toString(),
        side: (j['side'] ?? '').toString(),
        entryPrice: (j['entry_price'] as num?)?.toDouble() ?? 0,
        quantity: (j['quantity'] as num?)?.toDouble() ?? 0,
        currency: (j['currency'] ?? 'USD').toString(),
        exitPrice: (j['exit_price'] as num?)?.toDouble(),
        fees: (j['fees'] as num?)?.toDouble() ?? 0,
        stopLoss: (j['stop_loss'] as num?)?.toDouble(),
        takeProfit: (j['take_profit'] as num?)?.toDouble(),
        openedAt: DateTime.tryParse((j['opened_at'] ?? '').toString()),
        closedAt: DateTime.tryParse((j['closed_at'] ?? '').toString()),
        strategy: (j['strategy'] ?? '').toString(),
        notes: (j['notes'] ?? '').toString(),
        pnl: (j['pnl'] as num?)?.toDouble(),
        pnlPct: (j['pnl_pct'] as num?)?.toDouble(),
      );
}

class JournalList {
  JournalList({this.data = const [], this.stats});

  final List<JournalEntry> data;
  final Map<String, dynamic>? stats;

  factory JournalList.fromJson(Map<String, dynamic> j) => JournalList(
        data: (j['data'] is List)
            ? (j['data'] as List)
                .whereType<Map>()
                .map((e) => JournalEntry.fromJson(Map<String, dynamic>.from(e)))
                .toList()
            : [],
        stats: j['stats'] is Map
            ? Map<String, dynamic>.from(j['stats'] as Map)
            : null,
      );
}

class AiChatReply {
  AiChatReply({
    required this.answer,
    this.links = const [],
  });

  final String answer;
  final List<String> links;

  factory AiChatReply.fromJson(Map<String, dynamic> j) => AiChatReply(
        answer: (j['answer'] ?? j['reply'] ?? '').toString(),
        links: (j['links'] is List)
            ? (j['links'] as List).map((e) {
                if (e is Map) return (e['url'] ?? e['href'] ?? '').toString();
                return e.toString();
              }).where((e) => e.isNotEmpty).toList()
            : [],
      );
}

class DeviceSession {
  DeviceSession({
    required this.id,
    this.userAgent = '',
    this.current = false,
    this.createdAt,
  });

  final String id;
  final String userAgent;
  final bool current;
  final DateTime? createdAt;

  factory DeviceSession.fromJson(Map<String, dynamic> j) => DeviceSession(
        id: (j['id'] ?? j['hash'] ?? '').toString(),
        userAgent: (j['user_agent'] ?? j['ua'] ?? '').toString(),
        current: j['current'] == true || j['this_device'] == true,
        createdAt: DateTime.tryParse((j['created_at'] ?? '').toString()),
      );
}

class AdminArticle {
  AdminArticle({
    required this.id,
    required this.title,
    this.slug = '',
    this.status = '',
    this.category = '',
  });

  final String id;
  final String title;
  final String slug;
  final String status;
  final String category;

  factory AdminArticle.fromJson(Map<String, dynamic> j) => AdminArticle(
        id: (j['id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        slug: (j['slug'] ?? '').toString(),
        status: (j['status'] ?? '').toString(),
        category: j['category'] is Map
            ? (j['category']['slug'] ?? j['category']['name'] ?? '').toString()
            : (j['category'] ?? '').toString(),
      );
}
