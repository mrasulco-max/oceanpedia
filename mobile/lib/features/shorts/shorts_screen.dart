import 'package:cached_network_image/cached_network_image.dart';
import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:video_player/video_player.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/api_exception.dart';
import '../../core/session.dart';
import '../../core/short_media.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../data/models/extra.dart';
import '../../widgets/ob_widgets.dart';

class ShortsScreen extends StatefulWidget {
  const ShortsScreen({super.key, this.initialId});

  final String? initialId;

  @override
  State<ShortsScreen> createState() => _ShortsScreenState();
}

class _ShortsScreenState extends State<ShortsScreen> {
  List<ShortItem> _items = [];
  Object? _error;
  bool _loading = true;
  late final PageController _page;

  @override
  void initState() {
    super.initState();
    _page = PageController();
    _load();
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _items.isEmpty;
      _error = null;
    });
    try {
      final list = await context.read<ApiRepository>().shorts();
      if (!mounted) return;
      setState(() {
        _items = list;
        _loading = false;
      });
      if (widget.initialId != null) {
        final i = list.indexWhere((e) => e.id == widget.initialId);
        if (i > 0) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_page.hasClients) _page.jumpToPage(i);
          });
        }
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _toggleLike(int i) async {
    final session = context.read<SessionStore>();
    if (!session.isLoggedIn) {
      context.push('/masuk');
      return;
    }
    final s = _items[i];
    try {
      final r = await context.read<ApiRepository>().shortLike(s.id, like: !s.liked);
      setState(() {
        _items[i] = s.copyWith(liked: r.liked, likes: r.likes);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _toggleSave(int i) async {
    final session = context.read<SessionStore>();
    if (!session.isLoggedIn) {
      context.push('/masuk');
      return;
    }
    final s = _items[i];
    try {
      final r = await context.read<ApiRepository>().shortSave(s.id, save: !s.saved);
      setState(() {
        _items[i] = s.copyWith(saved: r.saved, saves: r.saves);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: _loading
          ? const ObLoading()
          : _error != null && _items.isEmpty
              ? ObErrorView(
                  message: _error is ApiException
                      ? (_error as ApiException).message
                      : 'Gagal memuat Short',
                  onRetry: _load,
                )
              : _items.isEmpty
                  ? const Center(
                      child: Text('Belum ada Short', style: TextStyle(color: Colors.white70)),
                    )
                  : Stack(
                      children: [
                        PageView.builder(
                          controller: _page,
                          scrollDirection: Axis.vertical,
                          itemCount: _items.length,
                          onPageChanged: (i) {
                            context.read<ApiRepository>().shortView(_items[i].id);
                          },
                          itemBuilder: (_, i) => _ShortPage(
                            item: _items[i],
                            onLike: () => _toggleLike(i),
                            onSave: () => _toggleSave(i),
                            onShare: () async {
                              final s = _items[i];
                              try {
                                await context.read<ApiRepository>().shortShare(s.id);
                              } catch (_) {}
                              // ignore: deprecated_member_use
                              await Share.share('${s.title}\nhttps://oceanpedia.id/short?v=${s.id}');
                            },
                            onComment: () => _showComments(_items[i]),
                          ),
                        ),
                        SafeArea(
                          child: IconButton(
                            onPressed: () => context.pop(),
                            icon: const Icon(Icons.close, color: Colors.white),
                          ),
                        ),
                      ],
                    ),
    );
  }

  Future<void> _showComments(ShortItem item) async {
    final repo = context.read<ApiRepository>();
    final session = context.read<SessionStore>();
    List<ShortComment> comments = [];
    try {
      comments = await repo.shortComments(item.id);
    } catch (_) {}
    if (!mounted) return;
    final ctrl = TextEditingController();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: ObColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.viewInsetsOf(ctx).bottom + 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Komentar', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 12),
              SizedBox(
                height: 240,
                child: comments.isEmpty
                    ? const Center(child: Text('Belum ada komentar', style: TextStyle(color: ObColors.textMuted)))
                    : ListView.builder(
                        itemCount: comments.length,
                        itemBuilder: (_, i) {
                          final c = comments[i];
                          return ListTile(
                            dense: true,
                            title: Text(c.userName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                            subtitle: Text(c.body),
                          );
                        },
                      ),
              ),
              if (session.isLoggedIn)
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: ctrl,
                        decoration: const InputDecoration(hintText: 'Tulis komentar…'),
                      ),
                    ),
                    IconButton(
                      onPressed: () async {
                        final t = ctrl.text.trim();
                        if (t.isEmpty) return;
                        try {
                          final c = await repo.addShortComment(item.id, t);
                          comments = [...comments, c];
                          ctrl.clear();
                          (ctx as Element).markNeedsBuild();
                        } catch (e) {
                          if (ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              SnackBar(content: Text(e is ApiException ? e.message : '$e')),
                            );
                          }
                        }
                      },
                      icon: const Icon(Icons.send, color: ObColors.brand),
                    ),
                  ],
                )
              else
                TextButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    context.push('/masuk');
                  },
                  child: const Text('Masuk untuk berkomentar'),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _ShortPage extends StatefulWidget {
  const _ShortPage({
    required this.item,
    required this.onLike,
    required this.onSave,
    required this.onShare,
    required this.onComment,
  });

  final ShortItem item;
  final VoidCallback onLike;
  final VoidCallback onSave;
  final VoidCallback onShare;
  final VoidCallback onComment;

  @override
  State<_ShortPage> createState() => _ShortPageState();
}

class _ShortPageState extends State<_ShortPage> {
  VideoPlayerController? _vc;
  WebViewController? _web;
  late final ShortMedia _media;

  @override
  void initState() {
    super.initState();
    _media = ShortMedia.resolve(widget.item.videoUrl, widget.item.coverUrl);
    if (_media.kind == 'file' && _media.src != null) {
      _vc = VideoPlayerController.networkUrl(Uri.parse(_media.src!))
        ..initialize().then((_) {
          if (!mounted) return;
          setState(() {});
          _vc!
            ..setLooping(true)
            ..play();
        });
    } else if (_media.kind == 'embed' && _media.src != null) {
      _web = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..loadRequest(Uri.parse(_media.src!));
    }
    context.read<ApiRepository>().shortView(widget.item.id);
  }

  @override
  void dispose() {
    _vc?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (_media.kind == 'file' && _vc != null && _vc!.value.isInitialized)
          FittedBox(
            fit: BoxFit.cover,
            child: SizedBox(
              width: _vc!.value.size.width,
              height: _vc!.value.size.height,
              child: VideoPlayer(_vc!),
            ),
          )
        else if (_media.kind == 'embed' && _web != null)
          WebViewWidget(controller: _web!)
        else if (_media.poster != null)
          CachedNetworkImage(imageUrl: _media.poster!, fit: BoxFit.cover)
        else
          Container(color: Colors.black87),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Colors.transparent, Colors.black54],
            ),
          ),
        ),
        Positioned(
          right: 12,
          bottom: 100,
          child: Column(
            children: [
              _Act(icon: item.liked ? Icons.favorite : Icons.favorite_border, label: '${item.likes}', color: item.liked ? const Color(0xFFFE2C55) : Colors.white, onTap: widget.onLike),
              _Act(icon: Icons.chat_bubble_outline, label: '${item.comments}', onTap: widget.onComment),
              _Act(icon: item.saved ? Icons.bookmark : Icons.bookmark_border, label: '${item.saves}', color: item.saved ? const Color(0xFFFACC15) : Colors.white, onTap: widget.onSave),
              _Act(icon: Icons.share_outlined, label: 'Bagikan', onTap: widget.onShare),
            ],
          ),
        ),
        Positioned(
          left: 16,
          right: 80,
          bottom: 48,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
              if (item.caption.isNotEmpty)
                Text(item.caption, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70)),
              if (item.symbol != null)
                Text(item.symbol!, style: const TextStyle(color: ObColors.brandSoft, fontFamily: 'RobotoMono')),
            ],
          ),
        ),
      ],
    );
  }
}

class _Act extends StatelessWidget {
  const _Act({required this.icon, required this.label, required this.onTap, this.color = Colors.white});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: InkWell(
        onTap: onTap,
        child: Column(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 11)),
          ],
        ),
      ),
    );
  }
}
