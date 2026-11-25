/// Deteksi sumber video Short: file langsung vs embed platform.
class ShortMedia {
  ShortMedia._(this.kind, {this.src, this.poster, this.provider});

  final String kind; // file | embed | none
  final String? src;
  final String? poster;
  final String? provider;

  static ShortMedia resolve(String? video, String? cover) {
    final v = (video ?? '').trim();
    final c = (cover ?? '').trim();
    final poster = c.isEmpty ? null : c;
    if (v.isEmpty) return ShortMedia._('none', poster: poster);
    final emb = embedOf(v);
    if (emb != null) {
      return ShortMedia._(
        'embed',
        src: emb.$1,
        poster: poster ?? emb.$2,
        provider: emb.$3,
      );
    }
    return ShortMedia._('file', src: v, poster: poster);
  }

  /// Returns (embedUrl, thumb, provider) or null.
  static (String, String?, String)? embedOf(String raw) {
    Uri? u;
    try {
      u = Uri.parse(raw.trim());
    } catch (_) {
      return null;
    }
    if (u.scheme != 'http' && u.scheme != 'https') return null;
    var host = u.host.toLowerCase();
    host = host.replaceFirst(RegExp(r'^(www|m|mobile)\.'), '');
    final seg = u.pathSegments.where((s) => s.isNotEmpty).toList();

    bool idOk(String? s) => s != null && RegExp(r'^[\w-]{4,64}$').hasMatch(s);

    if (host == 'youtube.com' ||
        host == 'music.youtube.com' ||
        host == 'youtube-nocookie.com' ||
        host == 'youtu.be') {
      String? v;
      if (host == 'youtu.be') {
        v = seg.isNotEmpty ? seg[0] : null;
      } else if (seg.isNotEmpty &&
          (seg[0] == 'shorts' || seg[0] == 'embed' || seg[0] == 'live')) {
        v = seg.length > 1 ? seg[1] : null;
      } else {
        v = u.queryParameters['v'];
      }
      if (!idOk(v)) return null;
      return (
        'https://www.youtube-nocookie.com/embed/$v?playsinline=1&rel=0&modestbranding=1',
        'https://i.ytimg.com/vi/$v/hqdefault.jpg',
        'YouTube',
      );
    }
    if (host == 'tiktok.com' || host.endsWith('.tiktok.com')) {
      final i = seg.indexOf('video');
      final v = i >= 0
          ? (i + 1 < seg.length ? seg[i + 1] : null)
          : (seg.isNotEmpty && seg[0] == 'embed' ? seg.last : null);
      if (v == null || !RegExp(r'^\d{6,25}$').hasMatch(v)) return null;
      return (
        'https://www.tiktok.com/player/v1/$v?description=0&music_info=0&rel=0',
        null,
        'TikTok',
      );
    }
    if (host == 'instagram.com') {
      final i = seg.indexWhere(
        (s) => s == 'reel' || s == 'reels' || s == 'p' || s == 'tv',
      );
      final v = i >= 0 && i + 1 < seg.length ? seg[i + 1] : null;
      if (!idOk(v)) return null;
      return ('https://www.instagram.com/reel/$v/embed/', null, 'Instagram');
    }
    if (host == 'vimeo.com' || host == 'player.vimeo.com') {
      final v = seg.cast<String?>().firstWhere(
            (s) => s != null && RegExp(r'^\d{5,12}$').hasMatch(s),
            orElse: () => null,
          );
      if (v == null) return null;
      return ('https://player.vimeo.com/video/$v?playsinline=1', null, 'Vimeo');
    }
    return null;
  }
}
